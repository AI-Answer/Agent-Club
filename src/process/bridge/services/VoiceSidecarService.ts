/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import { mainLog, mainWarn } from '@process/utils/mainLogger';

/**
 * Client for the optional local voice sidecar (resources/voice-sidecar):
 * warm faster-whisper STT, Kokoro TTS, and the "Hey Jarvis" wake word on
 * 127.0.0.1:3108. Auto-detected via GET /health with a cached probe — the
 * app works fully without it and upgrades itself when it appears.
 */

const SIDECAR_URL = process.env.AGENT_CLUB_VOICE_SIDECAR_URL || 'http://127.0.0.1:3108';
const PROBE_TIMEOUT_MS = 600;
const LOG_TAG = '[VoiceSidecar]';

export type VoiceSidecarStatus = {
  up: boolean;
  /** Kokoro TTS available (model files present). */
  tts: boolean;
  /** Warm STT available. */
  stt: boolean;
  /** 'cuda' | 'cpu' | undefined — the app prefers Metal whisper-cli on
   *  macOS over a CPU sidecar, so callers need this. */
  sttDevice?: string;
  /** Wake-word listener armed. */
  wake: boolean;
  voice?: string;
};

type HealthPayload = {
  ok?: boolean;
  voice?: string;
  tts?: { ok?: boolean };
  stt?: { ok?: boolean; device?: string };
  wake?: { ok?: boolean };
};

const DOWN: VoiceSidecarStatus = { up: false, tts: false, stt: false, wake: false };

/**
 * The sidecar streams WAV with an "unknown length" header (fine for
 * progressive <audio> playback). decodeAudioData needs real sizes, so patch
 * the RIFF/data lengths once the full body is collected (44-byte header).
 */
function fixWavLength(wav: Uint8Array): Uint8Array {
  if (wav.byteLength < 44) return wav;
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  view.setUint32(4, wav.byteLength - 8, true);
  view.setUint32(40, wav.byteLength - 44, true);
  return wav;
}

// health probe cached briefly so every utterance doesn't pre-flight;
// re-check dead servers sooner than live ones (pattern from jarvis-hud).
let cachedUntil = 0;
let cached: VoiceSidecarStatus = DOWN;

export class VoiceSidecarService {
  static async status(): Promise<VoiceSidecarStatus> {
    const now = Date.now();
    if (now < cachedUntil) return cached;
    try {
      const res = await fetch(`${SIDECAR_URL}/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      const j = res.ok ? ((await res.json()) as HealthPayload) : null;
      cached = j?.ok
        ? {
            up: true,
            tts: Boolean(j.tts?.ok),
            stt: Boolean(j.stt?.ok),
            sttDevice: j.stt?.device,
            wake: Boolean(j.wake?.ok),
            voice: j.voice,
          }
        : DOWN;
    } catch {
      cached = DOWN;
    }
    cachedUntil = now + (cached.up ? 30_000 : 5_000);
    return cached;
  }

  /** Drop the probe cache after a mid-flight failure. */
  private static invalidate(): void {
    cachedUntil = 0;
  }

  static async transcribe(audio: Uint8Array, mimeType: string, language?: string): Promise<{ text: string; language?: string }> {
    const query = language?.trim() ? `?language=${encodeURIComponent(language.trim())}` : '';
    const startedAt = Date.now();
    try {
      const res = await fetch(`${SIDECAR_URL}/stt${query}`, {
        method: 'POST',
        headers: { 'Content-Type': mimeType || 'audio/webm' },
        body: Buffer.from(audio),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`sidecar stt ${res.status}`);
      const j = (await res.json()) as { text?: string; language?: string; ms?: number };
      mainLog(LOG_TAG, 'STT completed', { ms: j.ms, totalMs: Date.now() - startedAt, language: j.language });
      return { text: (j.text ?? '').trim(), language: j.language ?? undefined };
    } catch (e) {
      this.invalidate();
      mainWarn(LOG_TAG, 'STT failed', { message: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }

  /** Synthesize one utterance with Kokoro; returns a complete WAV. */
  static async synthesize(text: string): Promise<{ audio: Uint8Array; voice?: string }> {
    const startedAt = Date.now();
    try {
      const res = await fetch(`${SIDECAR_URL}/speak?text=${encodeURIComponent(text)}`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`sidecar speak ${res.status}`);
      const audio = fixWavLength(new Uint8Array(await res.arrayBuffer()));
      mainLog(LOG_TAG, 'TTS completed', { audioBytes: audio.byteLength, ms: Date.now() - startedAt });
      return { audio, voice: cached.voice };
    } catch (e) {
      this.invalidate();
      mainWarn(LOG_TAG, 'TTS failed', { message: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }
}
