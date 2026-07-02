/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

/** GGML whisper.cpp model identifiers shipped as downloadable local STT options. */
export type WhisperModelId = 'base' | 'base.en' | 'tiny' | 'tiny.en';

export type WhisperModelDefinition = {
  id: WhisperModelId;
  fileName: string;
  /** Approximate download size for UI copy (bytes). */
  sizeBytes: number;
  url: string;
};

export const WHISPER_HF_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

export const WHISPER_MODEL_CATALOG: Record<WhisperModelId, WhisperModelDefinition> = {
  base: {
    id: 'base',
    fileName: 'ggml-base.bin',
    sizeBytes: 148_000_000,
    url: `${WHISPER_HF_BASE_URL}/ggml-base.bin`,
  },
  'base.en': {
    id: 'base.en',
    fileName: 'ggml-base.en.bin',
    sizeBytes: 148_000_000,
    url: `${WHISPER_HF_BASE_URL}/ggml-base.en.bin`,
  },
  tiny: {
    id: 'tiny',
    fileName: 'ggml-tiny.bin',
    sizeBytes: 75_000_000,
    url: `${WHISPER_HF_BASE_URL}/ggml-tiny.bin`,
  },
  'tiny.en': {
    id: 'tiny.en',
    fileName: 'ggml-tiny.en.bin',
    sizeBytes: 75_000_000,
    url: `${WHISPER_HF_BASE_URL}/ggml-tiny.en.bin`,
  },
};

export const DEFAULT_WHISPER_MODEL_ID: WhisperModelId = 'base';

export const WHISPER_MODEL_IDS = Object.keys(WHISPER_MODEL_CATALOG) as WhisperModelId[];

export function resolveWhisperModelId(modelId?: string | null): WhisperModelId {
  if (modelId && modelId in WHISPER_MODEL_CATALOG) {
    return modelId as WhisperModelId;
  }
  return DEFAULT_WHISPER_MODEL_ID;
}

export function getWhisperModelDefinition(modelId?: string | null): WhisperModelDefinition {
  return WHISPER_MODEL_CATALOG[resolveWhisperModelId(modelId)];
}
