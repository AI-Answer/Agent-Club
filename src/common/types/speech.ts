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
