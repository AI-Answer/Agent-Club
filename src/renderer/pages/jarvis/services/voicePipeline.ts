/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * JARVIS voice pipeline (renderer-only).
 *
 * Reuses the existing ACP chat IPC (see docs T017) to run a full voice loop:
 *   mic → STT → ACP sendMessage → responseStream → text_to_speech tool call →
 *   fs.readFileBuffer → WebAudio playback (through an AnalyserNode the HUD can
 *   react to). Falls back to browser speechSynthesis when Hermes does not emit
 *   a text_to_speech tool call for a completed reply.
 */
import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { ToolCallUpdate } from '@/common/types/acpTypes';
import { ConfigStorage, type IMcpServer, type TProviderWithModel } from '@/common/config/storage';
import { isSpeechToTextConfigured } from '@/common/types/speech';
import { uuid } from '@/common/utils';
import { getSpeechInputAvailability, pickRecordingMimeType } from '@/renderer/hooks/system/useSpeechInput';
import { transcribeAudioBlob } from '@/renderer/services/SpeechToTextService';
import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveJarvisSessionMcpServers } from './jarvisMcpServers';

const SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT = 'aionui:speech-to-text-config-changed';

/** Concise system instruction injected into the Hermes conversation. */
const PRESET_CONTEXT =
  'You are JARVIS. For EVERY reply, also call the `text_to_speech` tool with your reply text and an `output_path`. Keep spoken replies to 1-3 short conversational sentences; offer to elaborate in text if the user wants more detail.';

/** Hermes is a built-in ACP backend that owns its own auth/model. */
export const HERMES_VOICE_MODEL: TProviderWithModel = {
  id: 'hermes-voice',
  name: 'Hermes',
  platform: 'hermes',
  baseUrl: '',
  apiKey: '',
  useModel: 'default',
};

/** Default wait before browser TTS fallback when Hermes TTS tool is slow/missing. */
export const TTS_FALLBACK_MS = 1500;
/** Fast fallback once repeated TTS misses indicate the tool is not configured. */
export const TTS_FALLBACK_FAST_MS = 50;
/** Consecutive TTS misses before switching to the fast fallback timer. */
export const TTS_MISS_THRESHOLD = 2;

export function getFallbackDelayMs(recentTtsMisses: number): number {
  return recentTtsMisses >= TTS_MISS_THRESHOLD ? TTS_FALLBACK_FAST_MS : TTS_FALLBACK_MS;
}

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
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export type SttEngine = 'recorder' | 'webspeech' | 'none';

/**
 * Pick the best available STT engine. Prefers the app's configured
 * Speech-to-Text tool; falls back to Web Speech where supported.
 */
export async function resolveSttEngine(): Promise<SttEngine> {
  try {
    const cfg = await ConfigStorage.get('tools.speechToText');
    if (!cfg?.enabled || getSpeechInputAvailability() !== 'record') {
      return getSpeechRecognitionCtor() ? 'webspeech' : 'none';
    }

    if (cfg.provider === 'local') {
      if (!isSpeechToTextConfigured(cfg)) {
        return getSpeechRecognitionCtor() ? 'webspeech' : 'none';
      }
      const ready = await ipcBridge.speechToText.isLocalReady.invoke({ modelId: cfg.local?.modelId });
      return ready.ready ? 'recorder' : getSpeechRecognitionCtor() ? 'webspeech' : 'none';
    }

    if (isSpeechToTextConfigured(cfg)) return 'recorder';
  } catch {
    // storage unavailable — fall through to the runtime check
  }
  return getSpeechRecognitionCtor() ? 'webspeech' : 'none';
}

const VAD_INTERVAL_MS = 80;
const VAD_SPEECH_RMS = 0.025;
/** Hands-free: end capture after this much trailing silence. */
const VAD_SILENCE_MS = 700;
const VAD_NO_SPEECH_MS = 15_000;
const MAX_CAPTURE_MS = 60_000;

export type VoiceStatus = 'checking' | 'offline' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface TranscriptLine {
  id: string;
  role: 'user' | 'jarvis';
  text: string;
  final: boolean;
}

type TurnAccum = {
  text: string;
  jarvisLineId: string | null;
  spokeViaTool: boolean;
  sawFirstContent: boolean;
  turnToken: number;
};

/**
 * ACP emits `start` with the client msg_id, but streamed chunks and finish
 * events often use adapter-assigned ids. Fall back to the active turn.
 */
export function resolveTurnForStreamEvent(turns: Map<string, TurnAccum>, msgId: string): TurnAccum | undefined {
  const direct = turns.get(msgId);
  if (direct) return direct;
  return Array.from(turns.values()).at(-1);
}

export interface VoicePipelineOptions {
  /** When true, Peekaboo is injected into the Hermes ACP session. */
  computerControlEngaged?: boolean;
}

export interface VoicePipeline {
  status: VoiceStatus;
  hermesInstalled: boolean;
  transcript: TranscriptLine[];
  analyser: AnalyserNode | null;
  level: number;
  error: string | null;
  speechSupported: boolean;
  sttEngine: SttEngine;
  sttBlocked: boolean;
  voiceMode: boolean;
  /** MCP servers injected into the current Hermes session. */
  sessionMcpCount: number;
  toggleVoiceMode: () => void;
  startListening: () => void;
  stopListening: () => void;
  cancelListening: () => void;
  stopSpeaking: () => void;
  sendText: (text: string) => boolean;
  recheck: () => void;
}

/**
 * Extract a TTS output file path from a completed text_to_speech tool call.
 */
export function extractTtsFilePath(update: ToolCallUpdate['update']): string | null {
  const raw = (update.rawInput || {}) as Record<string, unknown>;
  for (const key of ['output_path', 'file_path', 'path', 'audio_path', 'outputPath']) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const items = update.content || [];
  for (const item of items) {
    const text = (item as { content?: { text?: string } })?.content?.text;
    if (typeof text !== 'string' || !text.trim()) continue;
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

export function useVoicePipeline(model: TProviderWithModel | null, options?: VoicePipelineOptions): VoicePipeline {
  const computerControlEngaged = options?.computerControlEngaged ?? false;

  const [status, setStatus] = useState<VoiceStatus>('checking');
  const [hermesInstalled, setHermesInstalled] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [sttBlocked, setSttBlocked] = useState(false);
  const [sttEngine, setSttEngine] = useState<SttEngine>('none');
  const [sessionMcpCount, setSessionMcpCount] = useState(0);
  const [bootstrapNonce, setBootstrapNonce] = useState(0);

  const speechSupported = sttEngine !== 'none';

  const voiceModeRef = useRef(false);
  const sttEngineRef = useRef<SttEngine>('none');
  const statusRef = useRef<VoiceStatus>('checking');
  const conversationIdRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const offStreamRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const vadIntervalRef = useRef<number | null>(null);
  const vadCtxRef = useRef<AudioContext | null>(null);
  const commitRef = useRef(true);
  const turnTokenRef = useRef(0);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interimLineIdRef = useRef<string | null>(null);
  const modelRef = useRef(model);
  const turnsRef = useRef<Map<string, TurnAccum>>(new Map());
  const hermesTurnActiveRef = useRef(false);
  const capturePendingRef = useRef(false);
  const pendingStopRef = useRef(false);
  const turnStartRef = useRef(0);
  const recentTtsMissesRef = useRef(0);
  const computerControlEngagedRef = useRef(computerControlEngaged);
  const prevEngagedRef = useRef(computerControlEngaged);

  modelRef.current = model;
  statusRef.current = status;
  computerControlEngagedRef.current = computerControlEngaged;

  const markPerf = useCallback((label: string) => {
    if (turnStartRef.current <= 0) return;
    const ms = performance.now() - turnStartRef.current;
    console.log(`[jarvis:perf] ${label} +${ms.toFixed(0)}ms`);
  }, []);

  const beginTurnPerf = useCallback(() => {
    turnStartRef.current = performance.now();
    console.log('[jarvis:perf] turn_start +0ms');
  }, []);

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

  useEffect(() => {
    const active = status === 'speaking' || sourceRef.current != null;
    if (!active) {
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
        const avg = sum / buf.length / 255;
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

  const stopPlayback = useCallback(() => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* noop */
      }
      sourceRef.current = null;
    }
  }, []);

  const speakFallback = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean || !('speechSynthesis' in window)) return;
    try {
      markPerf('fallback_speak_start');
      const utter = new SpeechSynthesisUtterance(clean);
      utter.onstart = () => setStatus('speaking');
      utter.onend = () => setStatus('idle');
      setStatus('speaking');
      window.speechSynthesis.speak(utter);
    } catch {
      setStatus('idle');
    }
  }, [markPerf]);

  const playTtsFile = useCallback(
    async (filePath: string) => {
      try {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        const buf = await ipcBridge.fs.readFileBuffer.invoke({ path: filePath });
        if (!buf || (buf as ArrayBuffer).byteLength === 0) return false;
        const ctx = ensureAudioContext();
        if (ctx.state === 'suspended') await ctx.resume();
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
        markPerf('tts_playback_start');
        recentTtsMissesRef.current = 0;
        setStatus('speaking');
        src.start();
        return true;
      } catch (e) {
        console.warn('[jarvis] TTS playback failed', e);
        return false;
      }
    },
    [ensureAudioContext, markPerf]
  );

  const interruptInFlightTurn = useCallback(async () => {
    const convoId = conversationIdRef.current;
    const s = statusRef.current;
    if (!convoId || (!hermesTurnActiveRef.current && s !== 'speaking')) return;
    hermesTurnActiveRef.current = false;
    turnTokenRef.current += 1;
    turnsRef.current.clear();
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    stopPlayback();
    try {
      await ipcBridge.conversation.stop.invoke({ conversation_id: convoId });
    } catch {
      /* best-effort */
    }
  }, [stopPlayback]);

  const handleStream = useCallback(
    (m: IResponseMessage) => {
      if (m.conversation_id !== conversationIdRef.current) return;
      switch (m.type) {
        case 'start': {
          setError(null);
          hermesTurnActiveRef.current = true;
          const turnToken = ++turnTokenRef.current;
          if (fallbackTimerRef.current) {
            clearTimeout(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
          }
          turnsRef.current.set(m.msg_id, {
            text: '',
            jarvisLineId: null,
            spokeViaTool: false,
            sawFirstContent: false,
            turnToken,
          });
          setStatus('thinking');
          break;
        }
        case 'content': {
          const chunk = typeof m.data === 'string' ? m.data : '';
          if (!chunk) break;
          let turn = resolveTurnForStreamEvent(turnsRef.current, m.msg_id);
          if (!turn) {
            const turnToken = ++turnTokenRef.current;
            turn = {
              text: '',
              jarvisLineId: null,
              spokeViaTool: false,
              sawFirstContent: false,
              turnToken,
            };
            turnsRef.current.set(m.msg_id, turn);
            hermesTurnActiveRef.current = true;
            setStatus('thinking');
          }
          if (!turn.sawFirstContent) {
            turn.sawFirstContent = true;
            markPerf('first_content');
          }
          turn.text += chunk;
          const id = turn.jarvisLineId || `jarvis-${m.msg_id}`;
          turn.jarvisLineId = id;
          const full = turn.text;
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
          const name = update.title || '';
          const raw = (update.rawInput || {}) as Record<string, unknown>;
          const hasTtsParam = ['output_path', 'audio_path', 'outputPath'].some((k) => typeof raw[k] === 'string' && (raw[k] as string).trim());
          const isTts = /(^|[_.: ])text_to_speech$/i.test(name) || name.toLowerCase() === 'text to speech' || hasTtsParam;
          if (!isTts) break;
          if (update.status === 'completed') {
            const filePath = extractTtsFilePath(update);
            if (filePath) {
              const turn = resolveTurnForStreamEvent(turnsRef.current, m.msg_id);
              if (turn) turn.spokeViaTool = true;
              turnTokenRef.current += 1;
              markPerf('tts_tool_complete');
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
          const turn = resolveTurnForStreamEvent(turnsRef.current, m.msg_id);
          if (!turn) break;
          hermesTurnActiveRef.current = false;
          const id = turn.jarvisLineId;
          if (id) {
            setTranscript((prev) => prev.map((l) => (l.id === id ? { ...l, final: true } : l)));
          }
          markPerf('finish');
          const text = turn.text;
          const turnAtFinish = turn.turnToken;
          const delay = getFallbackDelayMs(recentTtsMissesRef.current);
          if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = setTimeout(() => {
            if (turn.spokeViaTool || turnTokenRef.current !== turnAtFinish) return;
            if (text.trim()) {
              recentTtsMissesRef.current += 1;
              speakFallback(text);
            } else {
              setStatus('idle');
            }
          }, delay);
          break;
        }
        case 'error':
          hermesTurnActiveRef.current = false;
          setStatus('error');
          setError(typeof m.data === 'string' ? m.data : 'Hermes error');
          if (voiceModeRef.current) {
            voiceModeRef.current = false;
            setVoiceMode(false);
          }
          break;
        default:
          break;
      }
    },
    [markPerf, playTtsFile, speakFallback]
  );

  const removeConversation = useCallback(async (id: string | null) => {
    if (!id) return;
    try {
      await ipcBridge.conversation.remove.invoke({ id });
    } catch {
      /* best-effort */
    }
  }, []);

  // Re-bootstrap when Hermes gate, engage toggle, or recheck fires.
  useEffect(() => {
    if (prevEngagedRef.current !== computerControlEngaged) {
      prevEngagedRef.current = computerControlEngaged;
      if (conversationIdRef.current) {
        setBootstrapNonce((n) => n + 1);
      }
    }
  }, [computerControlEngaged]);

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
          setSessionMcpCount(0);
          return;
        }
        const activeModel = modelRef.current;
        if (!activeModel) {
          setStatus('offline');
          setError('No model configured for Hermes voice.');
          return;
        }

        const additionalMcpServers: IMcpServer[] = await resolveJarvisSessionMcpServers(computerControlEngagedRef.current);
        if (cancelled) return;
        setSessionMcpCount(additionalMcpServers.length);

        const prevId = conversationIdRef.current;
        if (prevId) {
          await removeConversation(prevId);
          conversationIdRef.current = null;
        }

        const convo = await ipcBridge.conversation.create.invoke({
          type: 'acp',
          model: activeModel,
          extra: {
            backend: 'hermes',
            presetContext: PRESET_CONTEXT,
            isHealthCheck: true,
            additionalMcpServers,
          },
        });
        if (cancelled) return;
        conversationIdRef.current = convo.id;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleStream, !!model, bootstrapNonce, removeConversation]);

  const recheck = useCallback(() => {
    setStatus('checking');
    setError(null);
    setBootstrapNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const engine = await resolveSttEngine();
      if (cancelled) return;
      sttEngineRef.current = engine;
      setSttEngine(engine);
      if (engine === 'recorder') setSttBlocked(false);
    };
    void refresh();
    const onConfigChanged = () => {
      void refresh();
    };
    window.addEventListener(SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT, onConfigChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT, onConfigChanged);
    };
  }, [bootstrapNonce]);

  const cleanupCapture = useCallback(() => {
    if (vadIntervalRef.current !== null) {
      window.clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (vadCtxRef.current) {
      void vadCtxRef.current.close().catch(() => {});
      vadCtxRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  const dropCaptureLine = useCallback((lineId: string) => {
    setTranscript((prev) => prev.filter((l) => l.id !== lineId));
    setStatus((s) => (s === 'listening' || s === 'thinking' ? 'idle' : s));
  }, []);

  const dispatchUserMessage = useCallback(
    async (text: string) => {
      const convoId = conversationIdRef.current;
      if (!text || !convoId) return;
      await interruptInFlightTurn();
      beginTurnPerf();
      markPerf('send_message');
      setError(null);
      setStatus('thinking');
      void ipcBridge.acpConversation.sendMessage.invoke({ input: text, msg_id: uuid(36), conversation_id: convoId });
    },
    [beginTurnPerf, interruptInFlightTurn, markPerf]
  );

  const transcribeAndSend = useCallback(
    async (blob: Blob, lineId: string) => {
      try {
        const result = await transcribeAudioBlob(blob, navigator.language || undefined);
        markPerf('stt_result');
        const text = result.text.trim();
        const convoId = conversationIdRef.current;
        if (!text || !convoId) {
          dropCaptureLine(lineId);
          return;
        }
        setTranscript((prev) => prev.map((l) => (l.id === lineId ? { ...l, text, final: true } : l)));
        await dispatchUserMessage(text);
      } catch (e) {
        dropCaptureLine(lineId);
        voiceModeRef.current = false;
        setVoiceMode(false);
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('STT_DISABLED') || msg.includes('NOT_CONFIGURED') || msg.includes('STT_LOCAL_MODEL_NOT_DOWNLOADED')) {
          const next: SttEngine = getSpeechRecognitionCtor() ? 'webspeech' : 'none';
          sttEngineRef.current = next;
          setSttEngine(next);
        } else {
          setError(msg.replace('STT_REQUEST_FAILED:', '').trim() || 'Transcription failed.');
        }
      }
    },
    [dispatchUserMessage, dropCaptureLine, markPerf]
  );

  const startRecorderCapture = useCallback(async () => {
    await interruptInFlightTurn();
    capturePendingRef.current = true;
    pendingStopRef.current = false;
    const lineId = `user-${uuid()}`;
    interimLineIdRef.current = lineId;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (recorderRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        capturePendingRef.current = false;
        return;
      }
      const mimeType = pickRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      commitRef.current = true;
      micStreamRef.current = stream;
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        cleanupCapture();
        dropCaptureLine(lineId);
        setError('Microphone recording failed.');
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        const commit = commitRef.current;
        cleanupCapture();
        if (!commit || blob.size === 0) {
          dropCaptureLine(lineId);
          return;
        }
        beginTurnPerf();
        markPerf('mic_stop');
        void transcribeAndSend(blob, lineId);
      };

      setTranscript((prev) => [...prev, { id: lineId, role: 'user', text: '…', final: false }]);
      setError(null);
      setStatus('listening');
      recorder.start();
      capturePendingRef.current = false;
      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        commitRef.current = true;
        if (recorder.state !== 'inactive') {
          try {
            recorder.stop();
          } catch {
            /* already stopped */
          }
        }
        return;
      }

      const handsFree = voiceModeRef.current;
      const startedAt = Date.now();
      let speechSeen = false;
      let lastVoiceAt = startedAt;
      let analyserNode: AnalyserNode | null = null;
      let vadData: Uint8Array<ArrayBuffer> | null = null;
      try {
        const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
        const vadCtx = new Ctor();
        analyserNode = vadCtx.createAnalyser();
        analyserNode.fftSize = 512;
        vadCtx.createMediaStreamSource(stream).connect(analyserNode);
        vadCtxRef.current = vadCtx;
        vadData = new Uint8Array(analyserNode.fftSize);
      } catch {
        /* no VAD */
      }
      const stopCapture = (commit: boolean) => {
        commitRef.current = commit;
        const r = recorderRef.current;
        if (r && r.state !== 'inactive') {
          try {
            r.stop();
          } catch {
            /* already stopped */
          }
        }
      };
      vadIntervalRef.current = window.setInterval(() => {
        const now = Date.now();
        if (now - startedAt > MAX_CAPTURE_MS) {
          stopCapture(speechSeen || !handsFree);
          return;
        }
        if (!analyserNode || !vadData) return;
        analyserNode.getByteTimeDomainData(vadData);
        let sum = 0;
        for (const sample of vadData) {
          const n = (sample - 128) / 128;
          sum += n * n;
        }
        const rms = Math.sqrt(sum / vadData.length);
        if (rms > VAD_SPEECH_RMS) {
          speechSeen = true;
          lastVoiceAt = now;
        }
        if (!handsFree) return;
        if (speechSeen && now - lastVoiceAt > VAD_SILENCE_MS) stopCapture(true);
        else if (!speechSeen && now - startedAt > VAD_NO_SPEECH_MS) stopCapture(false);
      }, VAD_INTERVAL_MS);
    } catch (e) {
      capturePendingRef.current = false;
      pendingStopRef.current = false;
      cleanupCapture();
      dropCaptureLine(lineId);
      if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
        voiceModeRef.current = false;
        setVoiceMode(false);
        setSttBlocked(true);
      } else {
        setError(e instanceof Error ? e.message : 'Could not start microphone.');
      }
    }
  }, [beginTurnPerf, cleanupCapture, dropCaptureLine, interruptInFlightTurn, markPerf, transcribeAndSend]);

  const startListening = useCallback(() => {
    if (!hermesInstalled || !conversationIdRef.current) return;
    if (recognitionRef.current || recorderRef.current || capturePendingRef.current) return;

    void ensureAudioContext().resume?.();
    stopPlayback();

    if (sttEngineRef.current === 'recorder') {
      void startRecorderCapture();
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError('Speech recognition is not available in this runtime.');
      return;
    }
    void (async () => {
      capturePendingRef.current = true;
      pendingStopRef.current = false;
      await interruptInFlightTurn();
      const rec = new Ctor();
      rec.lang = navigator.language || 'en-US';
      rec.continuous = false;
      rec.interimResults = true;
      const lineId = `user-${uuid()}`;
      interimLineIdRef.current = lineId;
      let finalText = '';

      rec.onresult = (event) => {
        setSttBlocked(false);
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
        if (!code || code === 'no-speech' || code === 'aborted') return;
        if (code === 'network' || code === 'not-allowed' || code === 'service-not-allowed') {
          voiceModeRef.current = false;
          setVoiceMode(false);
          setSttBlocked(true);
          return;
        }
        setError(`STT: ${code}`);
      };
      rec.onend = () => {
        recognitionRef.current = null;
        const text = finalText.trim();
        if (text) {
          setTranscript((prev) => prev.map((l) => (l.id === lineId ? { ...l, text, final: true } : l)));
          beginTurnPerf();
          markPerf('mic_stop');
          void dispatchUserMessage(text);
        } else {
          setTranscript((prev) => prev.filter((l) => l.id !== lineId || l.text.trim()));
          setStatus((s) => (s === 'listening' ? 'idle' : s));
        }
      };

      recognitionRef.current = rec;
      setError(null);
      setStatus('listening');
      try {
        rec.start();
        capturePendingRef.current = false;
        if (pendingStopRef.current) {
          pendingStopRef.current = false;
          try {
            rec.stop();
          } catch {
            /* already stopped */
          }
        }
      } catch (e) {
        capturePendingRef.current = false;
        pendingStopRef.current = false;
        setStatus('idle');
        setError(e instanceof Error ? e.message : 'Could not start microphone.');
      }
    })();
  }, [beginTurnPerf, dispatchUserMessage, ensureAudioContext, hermesInstalled, interruptInFlightTurn, markPerf, startRecorderCapture, stopPlayback]);

  const stopListening = useCallback(() => {
    if (capturePendingRef.current) {
      pendingStopRef.current = true;
      return;
    }
    const recorder = recorderRef.current;
    if (recorder) {
      commitRef.current = true;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          /* already stopped */
        }
      }
      return;
    }
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    }
  }, []);

  const cancelListening = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder) {
      commitRef.current = false;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          /* already stopped */
        }
      }
      return;
    }
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.abort();
      } catch {
        /* noop */
      }
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    turnTokenRef.current += 1;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    stopPlayback();
    setStatus((s) => (s === 'speaking' ? 'idle' : s));
  }, [stopPlayback]);

  const sendText = useCallback(
    (text: string): boolean => {
      const clean = text.trim();
      const convoId = conversationIdRef.current;
      if (!clean || !convoId || !hermesInstalled) return false;
      stopPlayback();
      setTranscript((prev) => [...prev, { id: `user-${uuid()}`, role: 'user', text: clean, final: true }]);
      void dispatchUserMessage(clean);
      return true;
    },
    [dispatchUserMessage, hermesInstalled, stopPlayback]
  );

  const toggleVoiceMode = useCallback(() => {
    const next = !voiceModeRef.current;
    voiceModeRef.current = next;
    setVoiceMode(next);
    if (next) {
      startListening();
    } else {
      cancelListening();
      stopSpeaking();
    }
  }, [cancelListening, startListening, stopSpeaking]);

  useEffect(() => {
    if (!voiceMode || status !== 'idle') return;
    const t = setTimeout(() => {
      if (voiceModeRef.current && !recognitionRef.current && !recorderRef.current) startListening();
    }, 350);
    return () => clearTimeout(t);
  }, [voiceMode, status, startListening]);

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
      commitRef.current = false;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          /* noop */
        }
      }
      if (vadIntervalRef.current !== null) window.clearInterval(vadIntervalRef.current);
      if (vadCtxRef.current) void vadCtxRef.current.close().catch(() => {});
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach((t) => t.stop());
      stopPlayback();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        void audioCtxRef.current.close();
      }
      const id = conversationIdRef.current;
      if (id) void removeConversation(id);
    };
  }, [removeConversation, stopPlayback]);

  return {
    status,
    hermesInstalled,
    transcript,
    analyser,
    level,
    error,
    speechSupported,
    sttEngine,
    sttBlocked,
    voiceMode,
    sessionMcpCount,
    toggleVoiceMode,
    startListening,
    stopListening,
    cancelListening,
    stopSpeaking,
    sendText,
    recheck,
  };
}
