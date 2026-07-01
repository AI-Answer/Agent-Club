/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * JARVIS voice pipeline (renderer-only).
 *
 * Reuses the existing ACP chat IPC (see docs T017) to run a full voice loop:
 *   mic → Web Speech STT → ACP sendMessage → responseStream → text_to_speech
 *   tool call → fs.readFileBuffer → WebAudio playback (through an AnalyserNode
 *   the HUD can react to). Falls back to browser speechSynthesis when Hermes
 *   does not emit a text_to_speech tool call for a completed reply.
 *
 * No core-bridge edits: the only out-of-renderer concerns (mic permission +
 * Info.plist usage string) live in src/index.ts and electron-builder.yml.
 */
import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { ToolCallUpdate } from '@/common/types/acpTypes';
import type { TProviderWithModel } from '@/common/config/storage';
import { uuid } from '@/common/utils';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Concise system instruction injected into the Hermes conversation. */
const PRESET_CONTEXT = 'You are JARVIS. For EVERY reply, also call the `text_to_speech` tool with your reply text and an `output_path`. Keep spoken replies concise and conversational.';

/** Minimal Web Speech API typings (webkitSpeechRecognition is untyped in lib.dom). */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export type VoiceStatus = 'checking' | 'offline' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface TranscriptLine {
  id: string;
  role: 'user' | 'jarvis';
  text: string;
  /** false while interim (live) STT text is still being refined */
  final: boolean;
}

export interface VoicePipeline {
  status: VoiceStatus;
  hermesInstalled: boolean;
  /** Live + finalized transcript lines for the on-screen log. */
  transcript: TranscriptLine[];
  /** AnalyserNode the HUD can pull getByteFrequencyData() from while speaking. */
  analyser: AnalyserNode | null;
  /** 0..1 smoothed speaking level (rAF-driven) for a simple visible pulse. */
  level: number;
  error: string | null;
  speechSupported: boolean;
  /**
   * Whether hands-free voice mode is engaged. While on, the pipeline keeps a
   * continuous listen → Hermes → speak → listen loop running (the closest thing
   * to Hermes's TTY-only "voice mode" we can drive over the ACP + text_to_speech
   * seam — see docs/goals/agent-club-jarvis/notes/T016-hermes-voice-mode.md).
   */
  voiceMode: boolean;
  /** Toggle hands-free voice mode on/off. */
  toggleVoiceMode: () => void;
  /** Begin a single push-to-talk capture. */
  startListening: () => void;
  /** End push-to-talk capture (sends the final transcript). */
  stopListening: () => void;
  /**
   * Hard-stop any in-flight reply playback: cancel browser speechSynthesis and
   * stop the live WebAudio TTS source. Used by the HUD's Esc handler so the
   * user can silence JARVIS mid-sentence ("ESC to stop").
   */
  stopSpeaking: () => void;
  /**
   * Forward an arbitrary text turn to Hermes (same conversation as voice).
   * Used by the Command Deck so a skill button runs through the brain and its
   * reply streams into the transcript / TTS exactly like a spoken turn.
   * No-op (returns false) when Hermes is offline.
   */
  sendText: (text: string) => boolean;
}

/**
 * Extract a TTS output file path from a completed text_to_speech tool call.
 * The path may live in rawInput (output_path/file_path/path) and/or in the
 * tool result content text (sometimes JSON).
 */
function extractTtsFilePath(update: ToolCallUpdate['update']): string | null {
  const raw = (update.rawInput || {}) as Record<string, unknown>;
  for (const key of ['output_path', 'file_path', 'path', 'audio_path', 'outputPath']) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const items = update.content || [];
  for (const item of items) {
    const text = (item as { content?: { text?: string } })?.content?.text;
    if (typeof text !== 'string' || !text.trim()) continue;
    // Try JSON first (the tool often returns a JSON blob).
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      for (const key of ['output_path', 'file_path', 'path', 'audio_path', 'outputPath']) {
        const v = parsed[key];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
    } catch {
      // Fall through to a loose path match.
    }
    const m = text.match(/(\/[^\s"']+\.(?:wav|mp3|ogg|m4a|aac|flac))/i);
    if (m) return m[1];
  }
  return null;
}

export function useVoicePipeline(model: TProviderWithModel | null): VoicePipeline {
  const [status, setStatus] = useState<VoiceStatus>('checking');
  const [hermesInstalled, setHermesInstalled] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);

  const speechSupported = !!getSpeechRecognitionCtor();

  // Mirror of voiceMode for use inside async callbacks (STT handlers / timers)
  // that capture a stale closure of the state value.
  const voiceModeRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const offStreamRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number | null>(null);

  // Per-turn accumulation so the fallback can speak the full reply.
  const pendingTextRef = useRef('');
  const spokeViaToolRef = useRef(false);
  // Monotonic per-turn token: bumped on each reply 'start'. A late text_to_speech
  // tool-call invalidates any in-flight synth fallback for the same turn.
  const turnTokenRef = useRef(0);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jarvisLineIdRef = useRef<string | null>(null);
  const interimLineIdRef = useRef<string | null>(null);
  const modelRef = useRef(model);
  modelRef.current = model;

  const ensureAudioContext = useCallback((): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
      const ctx = new Ctor();
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      an.smoothingTimeConstant = 0.8;
      an.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = an;
      setAnalyser(an);
    }
    return audioCtxRef.current;
  }, []);

  // rAF level pump so a simple pulse element works without canvas wiring.
  // Only run while actually speaking (or an audio source is live); otherwise the
  // loop allocates a Uint8Array every frame at ~60fps for nothing. When idle we
  // decay the level to 0 once and stop.
  useEffect(() => {
    const active = status === 'speaking' || sourceRef.current != null;
    if (!active) {
      // Single decay tick toward 0, then leave the loop stopped.
      setLevel((prev) => (prev > 0.01 ? prev * 0.85 : 0));
      return;
    }
    const tick = () => {
      const an = analyserRef.current;
      if (an) {
        const buf = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        const avg = sum / buf.length / 255; // 0..1
        setLevel((prev) => prev + (avg - prev) * 0.3);
      } else {
        setLevel((prev) => prev * 0.85);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [status]);

  const speakFallback = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean || !('speechSynthesis' in window)) return;
    try {
      const utter = new SpeechSynthesisUtterance(clean);
      utter.onstart = () => setStatus('speaking');
      utter.onend = () => setStatus('idle');
      setStatus('speaking');
      window.speechSynthesis.speak(utter);
    } catch {
      setStatus('idle');
    }
  }, []);

  const playTtsFile = useCallback(
    async (filePath: string) => {
      try {
        // The real TTS file wins over any browser-synth fallback: cancel pending
        // / in-flight speechSynthesis so the two cannot double-speak.
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        const buf = await ipcBridge.fs.readFileBuffer.invoke({ path: filePath });
        if (!buf || (buf as ArrayBuffer).byteLength === 0) return false;
        const ctx = ensureAudioContext();
        if (ctx.state === 'suspended') await ctx.resume();
        // decodeAudioData detaches the buffer; copy so the IPC buffer stays intact.
        const audioBuf = await ctx.decodeAudioData((buf as ArrayBuffer).slice(0));
        if (sourceRef.current) {
          try {
            sourceRef.current.stop();
          } catch {
            /* already stopped */
          }
        }
        const src = ctx.createBufferSource();
        src.buffer = audioBuf;
        // ensureAudioContext() guarantees an analyser; guard anyway so a null can
        // never throw from a non-null assertion.
        const an = analyserRef.current;
        if (!an) {
          console.warn('[jarvis] TTS playback skipped: analyser unavailable');
          return false;
        }
        src.connect(an);
        src.onended = () => {
          if (sourceRef.current === src) sourceRef.current = null;
          setStatus((s) => (s === 'speaking' ? 'idle' : s));
        };
        sourceRef.current = src;
        setStatus('speaking');
        src.start();
        return true;
      } catch (e) {
        console.warn('[jarvis] TTS playback failed', e);
        return false;
      }
    },
    [ensureAudioContext]
  );

  const handleStream = useCallback(
    (m: IResponseMessage) => {
      if (m.conversation_id !== conversationIdRef.current) return;
      switch (m.type) {
        case 'start':
          spokeViaToolRef.current = false;
          pendingTextRef.current = '';
          jarvisLineIdRef.current = null;
          turnTokenRef.current += 1;
          if (fallbackTimerRef.current) {
            clearTimeout(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
          }
          setStatus('thinking');
          break;
        case 'content': {
          const chunk = typeof m.data === 'string' ? m.data : '';
          if (!chunk) break;
          pendingTextRef.current += chunk;
          const id = jarvisLineIdRef.current || `jarvis-${m.msg_id}`;
          jarvisLineIdRef.current = id;
          const full = pendingTextRef.current;
          setTranscript((prev) => {
            const idx = prev.findIndex((l) => l.id === id);
            const line: TranscriptLine = { id, role: 'jarvis', text: full, final: false };
            if (idx >= 0) {
              const next = prev.slice();
              next[idx] = line;
              return next;
            }
            return [...prev, line];
          });
          break;
        }
        case 'acp_tool_call': {
          const update = (m.data as ToolCallUpdate)?.update;
          if (!update) break;
          // MCP backends namespace / humanize the tool title (e.g.
          // `mcp__tts__text_to_speech`, `Text To Speech`). Match defensively by
          // title shape OR by the presence of a known TTS output-path param.
          const name = update.title || '';
          const raw = (update.rawInput || {}) as Record<string, unknown>;
          const hasTtsParam = ['output_path', 'audio_path', 'outputPath'].some((k) => typeof raw[k] === 'string' && (raw[k] as string).trim());
          const isTts = /(^|[_.: ])text_to_speech$/i.test(name) || name.toLowerCase() === 'text to speech' || hasTtsParam;
          if (!isTts) break;
          if (update.status === 'completed') {
            const filePath = extractTtsFilePath(update);
            if (filePath) {
              // A real TTS file landed: suppress the synth fallback for this turn,
              // cancel any pending fallback timer, and invalidate in-flight synth.
              spokeViaToolRef.current = true;
              turnTokenRef.current += 1;
              if (window.speechSynthesis) window.speechSynthesis.cancel();
              if (fallbackTimerRef.current) {
                clearTimeout(fallbackTimerRef.current);
                fallbackTimerRef.current = null;
              }
              void playTtsFile(filePath);
            }
          }
          break;
        }
        case 'finish': {
          // Mark the assistant line final.
          const id = jarvisLineIdRef.current;
          if (id) {
            setTranscript((prev) => prev.map((l) => (l.id === id ? { ...l, final: true } : l)));
          }
          // Fallback: if no text_to_speech landed shortly after completion, speak it.
          // Capture the turn token; a late text_to_speech tool-call bumps the token
          // (and cancels synth), so the timer must no-op if the turn has advanced.
          const text = pendingTextRef.current;
          const turnAtFinish = turnTokenRef.current;
          if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = setTimeout(() => {
            if (spokeViaToolRef.current || turnTokenRef.current !== turnAtFinish) return;
            if (text.trim()) {
              speakFallback(text);
            } else {
              setStatus('idle');
            }
          }, 1500);
          break;
        }
        case 'error':
          setStatus('error');
          setError(typeof m.data === 'string' ? m.data : 'Hermes error');
          break;
        default:
          break;
      }
    },
    [playTtsFile, speakFallback]
  );

  // Gate on Hermes + create the conversation once a model is available.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await ipcBridge.acpConversation.getAvailableAgents.invoke();
        const installed = !!r.success && !!r.data?.some((a) => a.backend === 'hermes');
        if (cancelled) return;
        setHermesInstalled(installed);
        if (!installed) {
          setStatus('offline');
          return;
        }
        const activeModel = modelRef.current;
        if (!activeModel) {
          setStatus('offline');
          setError('No model configured for Hermes voice.');
          return;
        }
        const convo = await ipcBridge.conversation.create.invoke({
          type: 'acp',
          model: activeModel,
          extra: { backend: 'hermes', presetContext: PRESET_CONTEXT },
        });
        if (cancelled) return;
        conversationIdRef.current = convo.id;
        // Drop any prior subscription before re-subscribing so listeners can't
        // accumulate across effect re-runs (duplicate transcript + TTS).
        offStreamRef.current?.();
        offStreamRef.current = ipcBridge.acpConversation.responseStream.on(handleStream);
        setStatus('idle');
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Failed to start Hermes voice.');
      }
    })();
    return () => {
      cancelled = true;
      offStreamRef.current?.();
      offStreamRef.current = null;
    };
    // model identity is read via ref; rerun only if model presence flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleStream, !!model]);

  const startListening = useCallback(() => {
    if (!hermesInstalled || !conversationIdRef.current) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError('Speech recognition is not available in this runtime.');
      return;
    }
    // User gesture: unlock AudioContext for later playback.
    void ensureAudioContext().resume?.();

    // Stop any in-flight reply playback when the user starts talking.
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* noop */
      }
      sourceRef.current = null;
    }

    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    const lineId = `user-${uuid()}`;
    interimLineIdRef.current = lineId;
    let finalText = '';

    rec.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const txt = res[0]?.transcript || '';
        if (res.isFinal) final += txt;
        else interim += txt;
      }
      if (final) finalText += final;
      const shown = (finalText + interim).trim();
      setTranscript((prev) => {
        const idx = prev.findIndex((l) => l.id === lineId);
        const line: TranscriptLine = { id: lineId, role: 'user', text: shown, final: false };
        if (idx >= 0) {
          const next = prev.slice();
          next[idx] = line;
          return next;
        }
        return [...prev, line];
      });
    };
    rec.onerror = (e) => {
      const code = e?.error;
      if (code && code !== 'no-speech' && code !== 'aborted') {
        setError(`STT: ${code}`);
        // These won't recover by re-listening (no STT backend reachable, or mic
        // denied). In hands-free mode that would spin the re-arm loop, so drop
        // out of voice mode and let the user re-engage deliberately.
        if (code === 'network' || code === 'not-allowed' || code === 'service-not-allowed') {
          voiceModeRef.current = false;
          setVoiceMode(false);
        }
      }
    };
    rec.onend = () => {
      recognitionRef.current = null;
      const text = finalText.trim();
      const convoId = conversationIdRef.current;
      if (text && convoId) {
        setTranscript((prev) => prev.map((l) => (l.id === lineId ? { ...l, text, final: true } : l)));
        setStatus('thinking');
        void ipcBridge.acpConversation.sendMessage.invoke({ input: text, msg_id: uuid(36), conversation_id: convoId });
      } else {
        // nothing captured — drop the empty interim line and idle out
        setTranscript((prev) => prev.filter((l) => l.id !== lineId || l.text.trim()));
        setStatus((s) => (s === 'listening' ? 'idle' : s));
      }
    };

    recognitionRef.current = rec;
    setError(null);
    setStatus('listening');
    try {
      rec.start();
    } catch (e) {
      setStatus('idle');
      setError(e instanceof Error ? e.message : 'Could not start microphone.');
    }
  }, [hermesInstalled, ensureAudioContext]);

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    // Invalidate any pending synth fallback for the current turn.
    turnTokenRef.current += 1;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* already stopped */
      }
      sourceRef.current = null;
    }
    setStatus((s) => (s === 'speaking' ? 'idle' : s));
  }, []);

  const sendText = useCallback(
    (text: string): boolean => {
      const clean = text.trim();
      const convoId = conversationIdRef.current;
      if (!clean || !convoId || !hermesInstalled) return false;
      // Stop any in-flight reply playback so a deck turn doesn't double-speak.
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {
          /* noop */
        }
        sourceRef.current = null;
      }
      setTranscript((prev) => [...prev, { id: `user-${uuid()}`, role: 'user', text: clean, final: true }]);
      setStatus('thinking');
      void ipcBridge.acpConversation.sendMessage.invoke({ input: clean, msg_id: uuid(36), conversation_id: convoId });
      return true;
    },
    [hermesInstalled]
  );

  // Hands-free voice mode: a single toggle that engages a continuous
  // listen → Hermes → speak → listen conversation. Turning it on arms STT once;
  // the re-arm effect below restarts STT every time the pipeline returns to idle
  // (after a reply finishes speaking) until the user toggles it off.
  const toggleVoiceMode = useCallback(() => {
    const next = !voiceModeRef.current;
    voiceModeRef.current = next;
    setVoiceMode(next);
    if (next) {
      startListening();
    } else {
      stopListening();
      stopSpeaking();
    }
  }, [startListening, stopListening, stopSpeaking]);

  // Re-arm STT whenever we settle back to idle while voice mode is engaged, so
  // the loop keeps listening hands-free. The short delay lets the reply's audio
  // tail finish and avoids re-capturing it. Guarded on no recognition already
  // running so a stray idle tick can't stack two recognizers.
  useEffect(() => {
    if (!voiceMode || status !== 'idle') return;
    const t = setTimeout(() => {
      if (voiceModeRef.current && !recognitionRef.current) startListening();
    }, 350);
    return () => clearTimeout(t);
  }, [voiceMode, status, startListening]);

  // Teardown everything on unmount.
  useEffect(() => {
    return () => {
      voiceModeRef.current = false;
      if (offStreamRef.current) {
        offStreamRef.current();
        offStreamRef.current = null;
      }
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          /* noop */
        }
      }
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {
          /* noop */
        }
      }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        void audioCtxRef.current.close();
      }
    };
  }, []);

  return {
    status,
    hermesInstalled,
    transcript,
    analyser,
    level,
    error,
    speechSupported,
    voiceMode,
    toggleVoiceMode,
    startListening,
    stopListening,
    stopSpeaking,
    sendText,
  };
}
