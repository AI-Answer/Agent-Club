/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WhisperModelId } from './whisperModels';

export type SpeechToTextProvider = 'openai' | 'deepgram' | 'elevenlabs' | 'local';

export type OpenAISpeechToTextConfig = {
  apiKey: string;
  baseUrl?: string;
  language?: string;
  model: string;
  prompt?: string;
  temperature?: number;
};

export type DeepgramSpeechToTextConfig = {
  apiKey: string;
  baseUrl?: string;
  detectLanguage?: boolean;
  language?: string;
  model: string;
  punctuate?: boolean;
  smartFormat?: boolean;
};

export type ElevenLabsSpeechToTextConfig = {
  apiKey: string;
  baseUrl?: string;
  language?: string;
  /** Scribe model id, e.g. 'scribe_v1' or 'scribe_v2'. */
  model: string;
};

export type LocalSpeechToTextConfig = {
  /** GGML model id (see whisperModels.ts). */
  modelId: WhisperModelId;
  language?: string;
};

export type SpeechToTextConfig = {
  autoSend?: boolean;
  enabled: boolean;
  provider: SpeechToTextProvider;
  deepgram?: DeepgramSpeechToTextConfig;
  elevenlabs?: ElevenLabsSpeechToTextConfig;
  local?: LocalSpeechToTextConfig;
  openai?: OpenAISpeechToTextConfig;
};

export type SpeechToTextAudioBuffer = Uint8Array | number[] | Record<string, number>;

export type SpeechToTextRequest = {
  audioBuffer: SpeechToTextAudioBuffer;
  fileName: string;
  languageHint?: string;
  mimeType: string;
};

export type SpeechToTextResult = {
  language?: string;
  model: string;
  provider: SpeechToTextProvider;
  text: string;
};

export type SpeechToTextLocalModelStatus = {
  modelId: string;
  fileName: string;
  downloaded: boolean;
  sizeBytes?: number;
  expectedSizeBytes: number;
};

export type SpeechToTextLocalReadyResult = {
  ready: boolean;
  binaryAvailable: boolean;
  modelDownloaded: boolean;
  modelId: string;
};

export type SpeechToTextLocalModelDownloadRequest = {
  modelId: string;
};

export type SpeechToTextLocalModelDownloadProgressEvent = {
  downloadId: string;
  modelId: string;
  status: 'starting' | 'downloading' | 'completed' | 'error' | 'cancelled';
  receivedBytes: number;
  totalBytes?: number;
  percent?: number;
  bytesPerSecond?: number;
  error?: string;
};

/** Trimmed API key for the active speech-to-text provider, or empty when unset. */
export function getSpeechToTextProviderApiKey(config: SpeechToTextConfig): string {
  switch (config.provider) {
    case 'local':
      return '';
    case 'deepgram':
      return config.deepgram?.apiKey?.trim() ?? '';
    case 'elevenlabs':
      return config.elevenlabs?.apiKey?.trim() ?? '';
    case 'openai':
      return config.openai?.apiKey?.trim() ?? '';
  }
}

/** True when speech-to-text is enabled and cloud credentials / local model id are set. */
export function isSpeechToTextConfigured(config: SpeechToTextConfig | undefined): config is SpeechToTextConfig {
  if (!config?.enabled) return false;
  if (config.provider === 'local') {
    return Boolean(config.local?.modelId?.trim());
  }
  return Boolean(getSpeechToTextProviderApiKey(config));
}

// --- Text-to-speech (Jarvis spoken replies) ---------------------------------

export type TextToSpeechProvider = 'system' | 'elevenlabs' | 'openai';

export type ElevenLabsTextToSpeechConfig = {
  /** Falls back to the ElevenLabs speech-to-text (Scribe) key when empty. */
  apiKey?: string;
  baseUrl?: string;
  /** ElevenLabs voice id; empty uses the app default voice. */
  voiceId?: string;
  /** Model id; empty uses the low-latency flash model. */
  model?: string;
};

export type OpenAITextToSpeechConfig = {
  /** Falls back to the OpenAI speech-to-text (Whisper) key when empty. */
  apiKey?: string;
  baseUrl?: string;
  /** Built-in voice name (alloy, nova, onyx, …); empty uses the default. */
  voice?: string;
  /** Model id; empty uses the default TTS model. */
  model?: string;
};

export type TextToSpeechConfig = {
  provider: TextToSpeechProvider;
  elevenlabs?: ElevenLabsTextToSpeechConfig;
  openai?: OpenAITextToSpeechConfig;
};

export type TextToSpeechRequest = {
  text: string;
};

export type TextToSpeechResult = {
  /** Encoded audio bytes (serialized over IPC). */
  audio: number[];
  mimeType: string;
  provider: 'elevenlabs' | 'openai';
  model: string;
  voiceId: string;
};

/** Resolve the ElevenLabs TTS key: dedicated key first, then the Scribe key. */
export function getTextToSpeechElevenLabsKey(tts: TextToSpeechConfig | undefined, stt: SpeechToTextConfig | undefined): string {
  const own = tts?.elevenlabs?.apiKey?.trim();
  if (own) return own;
  return stt?.elevenlabs?.apiKey?.trim() ?? '';
}

/** Resolve the OpenAI TTS key: dedicated key first, then the Whisper STT key. */
export function getTextToSpeechOpenAIKey(tts: TextToSpeechConfig | undefined, stt: SpeechToTextConfig | undefined): string {
  const own = tts?.openai?.apiKey?.trim();
  if (own) return own;
  return stt?.openai?.apiKey?.trim() ?? '';
}

/**
 * Pick the effective voice for spoken replies. The explicit provider choice is
 * honored when its key exists; otherwise any available remote key beats the
 * robotic system voice, which is always the final fallback. Shared by the
 * renderer (engine display/state) and the main-process service (routing) so
 * the two can never disagree.
 */
export function resolveTextToSpeechProvider(tts: TextToSpeechConfig | undefined, stt: SpeechToTextConfig | undefined): TextToSpeechProvider {
  const elKey = getTextToSpeechElevenLabsKey(tts, stt);
  const openaiKey = getTextToSpeechOpenAIKey(tts, stt);
  if (tts?.provider === 'system') return 'system';
  if (tts?.provider === 'openai' && openaiKey) return 'openai';
  if (elKey) return 'elevenlabs';
  if (openaiKey) return 'openai';
  return 'system';
}
