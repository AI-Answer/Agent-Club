/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * JARVIS voice pipeline (renderer-only).
 *
 * Reuses the existing ACP chat IPC (see docs T017) to run a full voice loop:
 *   mic → STT → ACP sendMessage → responseStream → STREAMING sentence TTS.
 *
 * Spoken replies are synthesized app-side, sentence by sentence, WHILE the
 * reply text is still streaming — speech starts after the first sentence, not
 * after the whole reply. Engines: ElevenLabs (flash model via the main-process
 * TextToSpeechService, key shared with Scribe STT) with automatic fallback to
 * the system voice. This replaced the old Hermes `text_to_speech` tool-call
 * path, which cost an extra model roundtrip plus a whole-file synth wait.
 */
import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { ToolCallUpdate } from '@/common/types/acpTypes';
import { ConfigStorage, type IMcpServer, type TProviderWithModel } from '@/common/config/storage';
import { isSpeechToTextConfigured, resolveTextToSpeechProvider, type TextToSpeechProvider } from '@/common/types/speech';
import { uuid } from '@/common/utils';
import { getSpeechInputAvailability, pickRecordingMimeType } from '@/renderer/hooks/system/useSpeechInput';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { transcribeAudioBlob } from '@/renderer/services/SpeechToTextService';
import { extractSentences, flushSentenceBuffer } from '@/renderer/utils/speech/sentenceChunker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveJarvisSessionMcpServers } from './jarvisMcpServers';
import { connectVoiceSidecarWake } from './voiceSidecarWake';

export const SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT = 'aionui:speech-to-text-config-changed';
export const TEXT_TO_SPEECH_CONFIG_CHANGED_EVENT = 'aionui:text-to-speech-config-changed';

/** Local dismiss commands — handled without sending to Hermes (jarvis-hud pattern). */
const DISMISS_RE = /^(stop|cancel|never ?mind|nada|silencio|para|quiet|shut up|nothing|no|nope)[\s.!,]*$/i;

export type VoiceSidecarSnapshot = {
  up: boolean;
  stt: boolean;
  tts: boolean;
  wake: boolean;
};

const SIDECAR_DOWN: VoiceSidecarSnapshot = { up: false, stt: false, tts: false, wake: false };

/** Concise system instruction injected into the Hermes conversation. */
const PRESET_CONTEXT =
  'You are JARVIS, a spoken voice assistant. Always reply in the same language the user used. Reply in plain conversational prose — no markdown, no bullet lists, no code blocks, no emoji. Keep replies to 1-3 short sentences; offer to elaborate if the user wants more detail.';

/** Hermes is a built-in ACP backend that owns its own auth/model. */
export const HERMES_VOICE_MODEL: TProviderWithModel = {
  id: 'hermes-voice',
  name: 'Hermes',
  platform: 'hermes',
  baseUrl: '',
  apiKey: '',
  useModel: 'default',
};

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
export type TtsEngine = TextToSpeechProvider;

/**
 * Web Speech is only a real option outside Electron: Chromium's cloud speech
 * service needs Google keys Electron doesn't ship, so offering the mic there
 * invites a guaranteed failure. Report 'none' instead and let the console
 * show setup guidance up front.
 */
function webSpeechFallback(): SttEngine {
  if (isElectronDesktop()) return 'none';
  return getSpeechRecognitionCtor() ? 'webspeech' : 'none';
}

/**
 * Pick the voice for spoken replies — the shared resolver honors the explicit
 * provider choice when its key exists (ElevenLabs or OpenAI, both reusing
 * their STT keys) and falls back to the system voice.
 */
export async function resolveTtsEngine(): Promise<TtsEngine> {
  try {
    const [tts, stt, sidecar] = await Promise.all([
      ConfigStorage.get('tools.textToSpeech'),
      ConfigStorage.get('tools.speechToText'),
      ipcBridge.voiceSidecar.status.invoke().catch(() => SIDECAR_DOWN),
    ]);
    const base = resolveTextToSpeechProvider(tts, stt);
    // Live Kokoro beats the robotic system voice; explicit remote keys still win.
    if (sidecar.tts && (base === 'system' || tts?.provider === 'kokoro')) return 'kokoro';
    if (base === 'kokoro' && !sidecar.tts) return 'system';
    return base;
  } catch {
    // storage unavailable — fall through
  }
  return 'system';
}

/**
 * Pick the best available STT engine. Prefers the warm local sidecar when
 * present; then the app's configured Speech-to-Text tool; then Web Speech.
 */
export async function resolveSttEngine(): Promise<SttEngine> {
  try {
    if (getSpeechInputAvailability() !== 'record') {
      return webSpeechFallback();
    }

    // In Electron the mic is always the entry point — browser permission is
    // the only gate. Transcription routing (sidecar → configured provider)
    // happens in the main process when the clip is sent.
    if (isElectronDesktop()) return 'recorder';

    const sidecar = await ipcBridge.voiceSidecar.status.invoke().catch(() => SIDECAR_DOWN);
    if (sidecar.stt) return 'recorder';

    const cfg = await ConfigStorage.get('tools.speechToText');
    if (!cfg?.enabled || getSpeechInputAvailability() !== 'record') {
      return webSpeechFallback();
    }

    if (cfg.provider === 'local') {
      if (!isSpeechToTextConfigured(cfg)) {
        return webSpeechFallback();
      }
      const ready = await ipcBridge.speechToText.isLocalReady.invoke({ modelId: cfg.local?.modelId });
      return ready.ready ? 'recorder' : webSpeechFallback();
    }

    if (isSpeechToTextConfigured(cfg)) return 'recorder';
  } catch {
    // storage unavailable — fall through to the runtime check
  }
  return webSpeechFallback();
}

/** Cap on one sentence's remote synthesis: a hung/missing IPC handler or a
 *  stalled network call must degrade to the system voice, never wedge speech. */
const SYNTH_TIMEOUT_MS = 10_000;

/** If the reply hasn't started within this window, speak an acknowledgment so
 *  the user is never left in dead air while the agent thinks. */
const ACK_FILLER_DELAY_MS = 1_800;

/**
 * Short spoken acknowledgments, per language. Runtime spoken content (matched
 * to the language the USER spoke, not the UI language), so it lives here
 * rather than in the UI locale files. Kept tiny and neutral on purpose — a
 * filler must never claim anything the agent might not do.
 */
const ACK_FILLERS: Record<string, string[]> = {
  en: ['On it.', 'One moment.', 'Let me check.'],
  es: ['Voy.', 'Un momento.', 'Déjame ver.'],
};

function pickAckFiller(language: string | null): string {
  const set = ACK_FILLERS[(language || 'en').split('-')[0].toLowerCase()] || ACK_FILLERS.en;
  return set[Math.floor(Math.random() * set.length)];
}

function synthesizeWithTimeout(text: string, provider: Exclude<TtsEngine, 'system'>): Promise<{ audio: number[] }> {
  return Promise.race([
    ipcBridge.textToSpeech.synthesize.invoke({
      text,
      provider: provider === 'kokoro' ? 'kokoro' : provider,
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('TTS_TIMEOUT')), SYNTH_TIMEOUT_MS);
    }),
  ]);
}

const VAD_INTERVAL_MS = 80;
/** Re-transcribe the capture-so-far this often for the live interim
 *  transcript (local provider only — cloud passes would be billed calls). */
const INTERIM_STT_INTERVAL_MS = 1_500;
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
  /** Live mic analyser while listening — real voice-input level for the orb. */
  micAnalyser: AnalyserNode | null;
  level: number;
  error: string | null;
  speechSupported: boolean;
  sttEngine: SttEngine;
  /** Which voice speaks replies ('elevenlabs' or the system voice). */
  ttsEngine: TtsEngine;
  /** Live tool-call title while Hermes works (fills the thinking wait). */
  activity: string | null;
  sttBlocked: boolean;
  voiceMode: boolean;
  /** MCP servers injected into the current Hermes session. */
  sessionMcpCount: number;
  /** Optional local voice sidecar (warm STT / Kokoro / wake word). */
  sidecar: VoiceSidecarSnapshot;
  /** True when the sidecar wake listener is armed ("Hey Jarvis"). */
  wakeArmed: boolean;
  toggleVoiceMode: () => void;
  startListening: () => void;
  stopListening: () => void;
  cancelListening: () => void;
  stopSpeaking: () => void;
  sendText: (text: string) => boolean;
  recheck: () => void;
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
  const [ttsEngine, setTtsEngine] = useState<TtsEngine>('system');
  const [sessionMcpCount, setSessionMcpCount] = useState(0);
  const [sidecar, setSidecar] = useState<VoiceSidecarSnapshot>(SIDECAR_DOWN);
  const [wakeArmed, setWakeArmed] = useState(false);
  const [bootstrapNonce, setBootstrapNonce] = useState(0);

  const speechSupported = sttEngine !== 'none';

  const voiceModeRef = useRef(false);
  const sttEngineRef = useRef<SttEngine>('none');
  const startListeningRef = useRef<() => void>(() => {});
  const sidecarRef = useRef<VoiceSidecarSnapshot>(SIDECAR_DOWN);
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
  const interimIntervalRef = useRef<number | null>(null);
  /** In-flight interim (live-caption) transcription, if any. The final
   *  transcription on release must wait for this rather than run alongside
   *  it — two concurrent whisper invocations contend for the same CPU/Metal
   *  resources and each ends up slower than running sequentially. */
  const interimInFlightRef = useRef<Promise<void> | null>(null);
  const vadCtxRef = useRef<AudioContext | null>(null);
  /** Live mic analyser (same node the VAD reads) — exposed so the GraphCore
   *  orb can react to the user's actual voice input, not just app state. */
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null);
  const commitRef = useRef(true);
  const turnTokenRef = useRef(0);
  const interimLineIdRef = useRef<string | null>(null);
  const modelRef = useRef(model);
  const turnsRef = useRef<Map<string, TurnAccum>>(new Map());
  const hermesTurnActiveRef = useRef(false);
  const capturePendingRef = useRef(false);
  const pendingStopRef = useRef(false);
  const turnStartRef = useRef(0);
  const computerControlEngagedRef = useRef(computerControlEngaged);
  const prevEngagedRef = useRef(computerControlEngaged);
  // Streaming sentence TTS: queue of utterances + the per-turn text remainder.
  // Reply text is REVEALED in the transcript as each sentence starts speaking
  // (caption-style), so what you read is what you hear.
  const ttsEngineRef = useRef<TtsEngine>('system');
  type SpeechQueueItem = { text: string; lineId: string | null; synthPromise: Promise<{ audio: number[] }> | null };
  const speakQueueRef = useRef<SpeechQueueItem[]>([]);
  const speakBusyRef = useRef(false);
  /** Bumped to invalidate queued/in-flight speech (barge-in, Esc, new turn). */
  const speakTokenRef = useRef(0);
  const sentenceBufRef = useRef('');
  const firstSpeechOfTurnRef = useRef(true);
  /** Jarvis line currently being revealed; finalized when speech settles. */
  const revealLineIdRef = useRef<string | null>(null);
  /** Anti-dead-air: acknowledgment timer + the language the user last spoke. */
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUserLangRef = useRef<string | null>(null);
  /** What Hermes is doing right now (live tool-call title), for the console. */
  const [activity, setActivity] = useState<string | null>(null);

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

  /** Mark the currently revealing Jarvis line as final (settled or cut off). */
  const finalizeRevealedLine = useCallback(() => {
    const lineId = revealLineIdRef.current;
    if (!lineId) return;
    revealLineIdRef.current = null;
    setTranscript((prev) => prev.map((l) => (l.id === lineId ? { ...l, final: true } : l)));
  }, []);

  /** Append a just-spoken sentence to its Jarvis transcript line. */
  const revealSpokenText = useCallback((lineId: string | null, sentence: string) => {
    if (!lineId) return;
    revealLineIdRef.current = lineId;
    setTranscript((prev) => {
      const idx = prev.findIndex((l) => l.id === lineId);
      if (idx < 0) return [...prev, { id: lineId, role: 'jarvis' as const, text: sentence, final: false }];
      const next = prev.slice();
      next[idx] = { ...next[idx], text: `${next[idx].text} ${sentence}`.trim(), final: false };
      return next;
    });
  }, []);

  /** Hard-stop ALL speech: queued sentences, in-flight synth, live audio. */
  const stopPlayback = useCallback(() => {
    speakTokenRef.current += 1;
    speakQueueRef.current = [];
    sentenceBufRef.current = '';
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* noop */
      }
      sourceRef.current = null;
    }
    // Whatever was revealed so far is what the user heard — freeze it.
    finalizeRevealedLine();
  }, [finalizeRevealedLine]);

  /** Settle back to idle once the turn is over AND the speech queue drained. */
  const maybeIdleAfterSpeech = useCallback(() => {
    if (speakBusyRef.current || speakQueueRef.current.length > 0) return;
    if (hermesTurnActiveRef.current) {
      // An acknowledgment filler just finished but the agent is still
      // working — reflect that honestly instead of staying on 'speaking'.
      setStatus((s) => (s === 'speaking' ? 'thinking' : s));
      return;
    }
    finalizeRevealedLine();
    setStatus((s) => (s === 'speaking' || s === 'thinking' ? 'idle' : s));
  }, [finalizeRevealedLine]);

  /** Play encoded audio bytes through the shared analyser chain; resolves on end. */
  const playAudioBytes = useCallback(
    async (bytes: number[], token: number): Promise<void> => {
      const ctx = ensureAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();
      const audioBuf = await ctx.decodeAudioData(Uint8Array.from(bytes).buffer);
      if (token !== speakTokenRef.current) return;
      const an = analyserRef.current;
      if (!an) return;
      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(an);
      sourceRef.current = src;
      await new Promise<void>((resolve) => {
        src.onended = () => {
          if (sourceRef.current === src) sourceRef.current = null;
          resolve();
        };
        src.start();
      });
    },
    [ensureAudioContext]
  );

  /** Speak one utterance with the system voice; resolves when done. */
  const speakSystem = useCallback((text: string, token: number): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (!('speechSynthesis' in window) || token !== speakTokenRef.current) {
        resolve();
        return;
      }
      try {
        const utter = new SpeechSynthesisUtterance(text);
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        window.speechSynthesis.speak(utter);
      } catch {
        resolve();
      }
    });
  }, []);

  /**
   * Start synthesis for the next couple of queued sentences without waiting
   * for the current one to finish playing. Without this, each sentence only
   * begins synthesizing after the previous one's audio ends — turning every
   * multi-sentence reply into a string of audible dead-air gaps (Kokoro/
   * ElevenLabs/OpenAI synth is not instant, ~0.3-1s per sentence). System
   * voice needs no prefetch: speechSynthesis.speak() is a local, near-instant
   * enqueue.
   */
  const prefetchAhead = useCallback(() => {
    const engine = ttsEngineRef.current;
    if (engine === 'system') return;
    const queue = speakQueueRef.current;
    for (let i = 0; i < Math.min(2, queue.length); i++) {
      const item = queue[i];
      if (!item.synthPromise) {
        item.synthPromise = synthesizeWithTimeout(item.text, engine);
      }
    }
  }, []);

  /** Drain the speech queue one utterance at a time. */
  const pumpSpeech = useCallback(() => {
    if (speakBusyRef.current) return;
    const next = speakQueueRef.current.shift();
    if (next === undefined) {
      maybeIdleAfterSpeech();
      return;
    }
    speakBusyRef.current = true;
    const token = speakTokenRef.current;
    void (async () => {
      try {
        if (token !== speakTokenRef.current) return;
        if (firstSpeechOfTurnRef.current) {
          firstSpeechOfTurnRef.current = false;
          markPerf('speech_start');
        }
        setStatus('speaking');
        // Caption-style: the text appears the moment its audio is requested,
        // so the transcript leads the voice by a beat instead of dumping the
        // whole reply while audio lags behind.
        revealSpokenText(next.lineId, next.text);
        if (ttsEngineRef.current !== 'system') {
          try {
            const res = await (next.synthPromise ?? synthesizeWithTimeout(next.text, ttsEngineRef.current));
            if (token !== speakTokenRef.current) return;
            // While this sentence PLAYS, get the following one(s) synthesizing.
            prefetchAhead();
            await playAudioBytes(res.audio, token);
          } catch (e) {
            // Remote/local TTS unreachable — fall back to the system voice.
            console.warn('[jarvis] TTS failed; falling back to system voice', e);
            ttsEngineRef.current = 'system';
            setTtsEngine('system');
            if (token === speakTokenRef.current) await speakSystem(next.text, token);
          }
        } else {
          await speakSystem(next.text, token);
        }
      } finally {
        speakBusyRef.current = false;
        // The queue only ever holds current-token utterances (stopPlayback
        // clears it when the token bumps), so always keep draining.
        if (speakQueueRef.current.length > 0) {
          pumpSpeech();
        } else {
          maybeIdleAfterSpeech();
        }
      }
    })();
  }, [markPerf, maybeIdleAfterSpeech, playAudioBytes, prefetchAhead, revealSpokenText, speakSystem]);

  const enqueueSpeech = useCallback(
    (sentences: string[], lineId: string | null) => {
      if (sentences.length === 0) return;
      speakQueueRef.current.push(...sentences.map((text): SpeechQueueItem => ({ text, lineId, synthPromise: null })));
      prefetchAhead();
      pumpSpeech();
    },
    [prefetchAhead, pumpSpeech]
  );

  const interruptInFlightTurn = useCallback(async () => {
    const convoId = conversationIdRef.current;
    const s = statusRef.current;
    if (!convoId || (!hermesTurnActiveRef.current && s !== 'speaking')) return;
    hermesTurnActiveRef.current = false;
    turnTokenRef.current += 1;
    turnsRef.current.clear();
    if (ackTimerRef.current) {
      clearTimeout(ackTimerRef.current);
      ackTimerRef.current = null;
    }
    setActivity(null);
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
          sentenceBufRef.current = '';
          firstSpeechOfTurnRef.current = true;
          turnsRef.current.set(m.msg_id, {
            text: '',
            jarvisLineId: null,
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
              sawFirstContent: false,
              turnToken,
            };
            turnsRef.current.set(m.msg_id, turn);
            hermesTurnActiveRef.current = true;
            sentenceBufRef.current = '';
            firstSpeechOfTurnRef.current = true;
            setStatus('thinking');
          }
          if (!turn.sawFirstContent) {
            turn.sawFirstContent = true;
            markPerf('first_content');
            // The reply is here — no acknowledgment filler needed anymore.
            if (ackTimerRef.current) {
              clearTimeout(ackTimerRef.current);
              ackTimerRef.current = null;
            }
            setActivity(null);
          }
          turn.text += chunk;
          const id = turn.jarvisLineId || `jarvis-${m.msg_id}`;
          turn.jarvisLineId = id;
          // Streaming TTS: peel complete sentences off the buffer and speak
          // them immediately. The transcript is NOT written here — pumpSpeech
          // reveals each sentence as it starts speaking, keeping the written
          // and spoken reply in sync.
          sentenceBufRef.current += chunk;
          const extraction = extractSentences(sentenceBufRef.current);
          sentenceBufRef.current = extraction.rest;
          enqueueSpeech(extraction.sentences, id);
          break;
        }
        case 'acp_tool_call': {
          // Narrate real progress: while Hermes runs a tool, show its name so
          // the thinking wait is informative instead of dead air.
          const update = (m.data as ToolCallUpdate)?.update;
          if (!update) break;
          if (update.status === 'completed' || update.status === 'failed') setActivity(null);
          else if (update.title) setActivity(update.title);
          break;
        }
        case 'finish': {
          const turn = resolveTurnForStreamEvent(turnsRef.current, m.msg_id);
          if (!turn) break;
          hermesTurnActiveRef.current = false;
          setActivity(null);
          markPerf('finish');
          // Speak whatever is left in the sentence buffer, then settle idle
          // once the queue drains — maybeIdleAfterSpeech also finalizes the
          // revealed transcript line at that point.
          const remainder = flushSentenceBuffer(sentenceBufRef.current);
          sentenceBufRef.current = '';
          if (remainder.length > 0) enqueueSpeech(remainder, turn.jarvisLineId || `jarvis-${m.msg_id}`);
          else maybeIdleAfterSpeech();
          break;
        }
        case 'error':
          hermesTurnActiveRef.current = false;
          setActivity(null);
          stopPlayback();
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
    [enqueueSpeech, markPerf, maybeIdleAfterSpeech, stopPlayback]
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
      const [engine, voice, sidecarStatus] = await Promise.all([
        resolveSttEngine(),
        resolveTtsEngine(),
        ipcBridge.voiceSidecar.status.invoke().catch(() => SIDECAR_DOWN),
      ]);
      if (cancelled) return;
      sidecarRef.current = sidecarStatus;
      setSidecar(sidecarStatus);
      sttEngineRef.current = engine;
      setSttEngine(engine);
      if (engine === 'recorder') setSttBlocked(false);
      ttsEngineRef.current = voice;
      setTtsEngine(voice);
    };
    void refresh();
    const onConfigChanged = () => {
      void refresh();
    };
    window.addEventListener(SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT, onConfigChanged);
    window.addEventListener(TEXT_TO_SPEECH_CONFIG_CHANGED_EVENT, onConfigChanged);
    const sidecarPoll = window.setInterval(() => {
      void refresh();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(sidecarPoll);
      window.removeEventListener(SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT, onConfigChanged);
      window.removeEventListener(TEXT_TO_SPEECH_CONFIG_CHANGED_EVENT, onConfigChanged);
    };
  }, [bootstrapNonce]);

  const cleanupCapture = useCallback(() => {
    if (vadIntervalRef.current !== null) {
      window.clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (interimIntervalRef.current !== null) {
      window.clearInterval(interimIntervalRef.current);
      interimIntervalRef.current = null;
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
    micAnalyserRef.current = null;
    setMicAnalyser(null);
  }, []);

  const dropCaptureLine = useCallback((lineId: string) => {
    setTranscript((prev) => prev.filter((l) => l.id !== lineId));
    setStatus((s) => (s === 'listening' || s === 'thinking' ? 'idle' : s));
  }, []);

  const handleDismiss = useCallback(
    (lineId?: string) => {
      if (lineId) dropCaptureLine(lineId);
      void interruptInFlightTurn();
      stopPlayback();
      setStatus('idle');
      if (voiceModeRef.current) {
        window.setTimeout(() => startListeningRef.current(), 350);
      }
    },
    [dropCaptureLine, interruptInFlightTurn, stopPlayback]
  );

  const dispatchUserMessage = useCallback(
    async (text: string) => {
      const convoId = conversationIdRef.current;
      if (!text || !convoId) return;
      if (DISMISS_RE.test(text.trim())) {
        handleDismiss();
        return;
      }
      await interruptInFlightTurn();
      beginTurnPerf();
      markPerf('send_message');
      setError(null);
      setStatus('thinking');
      void ipcBridge.acpConversation.sendMessage.invoke({ input: text, msg_id: uuid(36), conversation_id: convoId });
      // Anti-dead-air: if the reply hasn't started after a beat, speak a short
      // acknowledgment in the user's language. First content cancels this; the
      // filler carries no lineId so nothing is written to the transcript.
      if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
      ackTimerRef.current = setTimeout(() => {
        ackTimerRef.current = null;
        if (statusRef.current !== 'thinking') return;
        enqueueSpeech([pickAckFiller(lastUserLangRef.current)], null);
      }, ACK_FILLER_DELAY_MS);
    },
    [beginTurnPerf, enqueueSpeech, handleDismiss, interruptInFlightTurn, markPerf]
  );

  const transcribeAndSend = useCallback(
    async (blob: Blob, lineId: string) => {
      try {
        // No language hint: the user's configured language (Settings → Speech
        // to Text) wins, and with no setting the provider auto-detects per
        // utterance — bilingual users can freely mix languages.
        const result = await transcribeAudioBlob(blob);
        markPerf('stt_result');
        if (result.language) lastUserLangRef.current = result.language;
        const text = result.text.trim();
        const convoId = conversationIdRef.current;
        if (!text || !convoId) {
          dropCaptureLine(lineId);
          return;
        }
        if (DISMISS_RE.test(text)) {
          setTranscript((prev) => prev.map((l) => (l.id === lineId ? { ...l, text, final: true } : l)));
          handleDismiss();
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
          const next: SttEngine = webSpeechFallback();
          sttEngineRef.current = next;
          setSttEngine(next);
        } else {
          setError(msg.replace('STT_REQUEST_FAILED:', '').trim() || 'Transcription failed.');
        }
      }
    },
    [dispatchUserMessage, dropCaptureLine, handleDismiss, markPerf]
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
        // Recording has genuinely stopped here, but transcription (STT) can
        // take multiple seconds — without this, status stays 'listening' for
        // that whole window, so the mic/orb still LOOK like they're actively
        // recording well after release, and the orb loses its mic-level
        // analyser (capture just ended) with nothing to replace it. Flip to
        // 'thinking' immediately so both give real feedback that release was
        // registered and something is happening.
        setStatus('thinking');
        beginTurnPerf();
        markPerf('mic_stop');
        // If a live-caption (interim) transcription is still running, let it
        // finish first instead of firing the final one alongside it — two
        // concurrent whisper invocations contend for the same CPU/Metal
        // resources and each ends up slower than doing them back to back.
        const pendingInterim = interimInFlightRef.current;
        const runFinal = async (): Promise<void> => {
          if (pendingInterim) {
            try {
              await pendingInterim;
            } catch {
              /* interim failures are already swallowed at the source */
            }
          }
          await transcribeAndSend(blob, lineId);
        };
        void runFinal();
      };

      setTranscript((prev) => [...prev, { id: lineId, role: 'user', text: '…', final: false }]);
      setError(null);
      setStatus('listening');
      // Timeslice so interim transcription can read the audio captured so far.
      recorder.start(500);
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
        micAnalyserRef.current = analyserNode;
        setMicAnalyser(analyserNode);
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

      // Live transcript while you speak: with the free local provider we can
      // afford to re-transcribe the audio-so-far every ~1.5s and show the
      // partial text in place of the "…" placeholder. Cloud providers skip
      // this (every pass would be a billed API call) and show text on release.
      const sttCfg = await ConfigStorage.get('tools.speechToText').catch((): undefined => undefined);
      if (sttCfg?.provider === 'local' || sidecarRef.current.stt) {
        let interimBusy = false;
        interimIntervalRef.current = window.setInterval(() => {
          if (interimBusy || !speechSeen || chunks.length === 0) return;
          if (recorderRef.current !== recorder) return;
          interimBusy = true;
          const partial = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
          const thisInFlight: Promise<void> = transcribeAudioBlob(partial)
            .then((result) => {
              const text = result.text.trim();
              // Only update while THIS capture is still live — the final pass
              // owns the line once the recorder stops.
              if (!text || recorderRef.current !== recorder || interimLineIdRef.current !== lineId) return;
              setTranscript((prev) => prev.map((l) => (l.id === lineId ? { ...l, text, final: false } : l)));
            })
            .catch(() => {
              /* interim is best-effort; the final pass reports real errors */
            })
            .finally((): void => {
              interimBusy = false;
              if (interimInFlightRef.current === thisInFlight) interimInFlightRef.current = null;
            });
          interimInFlightRef.current = thisInFlight;
        }, INTERIM_STT_INTERVAL_MS);
      }
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

  startListeningRef.current = startListening;

  useEffect(() => {
    if (!hermesInstalled || !sidecar.wake) return;
    return connectVoiceSidecarWake({
      onHello: (armed) => setWakeArmed(armed),
      onWake: () => {
        void interruptInFlightTurn();
        stopPlayback();
        setStatus('listening');
      },
      onWakeEnd: () => {
        setStatus((s) => (s === 'listening' ? 'idle' : s));
      },
      onTranscript: (text) => {
        if (DISMISS_RE.test(text)) {
          handleDismiss();
          return;
        }
        const lineId = `user-wake-${uuid()}`;
        setTranscript((prev) => [...prev, { id: lineId, role: 'user', text, final: true }]);
        void dispatchUserMessage(text);
      },
    });
  }, [dispatchUserMessage, handleDismiss, hermesInstalled, interruptInFlightTurn, sidecar.wake, stopPlayback]);

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
    stopPlayback();
    setStatus((s) => (s === 'speaking' ? 'idle' : s));
  }, [stopPlayback]);

  const sendText = useCallback(
    (text: string): boolean => {
      const clean = text.trim();
      const convoId = conversationIdRef.current;
      if (!clean || !convoId || !hermesInstalled) return false;
      if (DISMISS_RE.test(clean)) {
        handleDismiss();
        return true;
      }
      stopPlayback();
      setTranscript((prev) => [...prev, { id: `user-${uuid()}`, role: 'user', text: clean, final: true }]);
      void dispatchUserMessage(clean);
      return true;
    },
    [dispatchUserMessage, handleDismiss, hermesInstalled, stopPlayback]
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
      if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
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
      if (interimIntervalRef.current !== null) window.clearInterval(interimIntervalRef.current);
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
    micAnalyser,
    level,
    error,
    speechSupported,
    sttEngine,
    ttsEngine,
    activity,
    sttBlocked,
    voiceMode,
    sessionMcpCount,
    sidecar,
    wakeArmed,
    toggleVoiceMode,
    startListening,
    stopListening,
    cancelListening,
    stopSpeaking,
    sendText,
    recheck,
  };
}
