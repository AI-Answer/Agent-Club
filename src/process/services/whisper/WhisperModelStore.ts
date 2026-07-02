/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  getWhisperModelDefinition,
  resolveWhisperModelId,
  WHISPER_MODEL_IDS,
  type WhisperModelId,
} from '@/common/types/whisperModels';
import { getDataPath } from '@process/utils/utils';

const CACHE_DIR_NAME = 'whisper';

export function getWhisperModelCacheDir(): string {
  const dir = join(getDataPath(), 'cache', CACHE_DIR_NAME);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getWhisperModelPath(modelId?: string | null): string {
  const definition = getWhisperModelDefinition(modelId);
  return join(getWhisperModelCacheDir(), definition.fileName);
}

export function isWhisperModelDownloaded(modelId?: string | null): boolean {
  const modelPath = getWhisperModelPath(modelId);
  if (!existsSync(modelPath)) return false;
  try {
    return statSync(modelPath).size > 1024;
  } catch {
    return false;
  }
}

export function getWhisperModelSizeBytes(modelId?: string | null): number | undefined {
  const modelPath = getWhisperModelPath(modelId);
  if (!existsSync(modelPath)) return undefined;
  try {
    return statSync(modelPath).size;
  } catch {
    return undefined;
  }
}

export function deleteWhisperModel(modelId: string): boolean {
  const resolved = resolveWhisperModelId(modelId);
  const modelPath = getWhisperModelPath(resolved);
  if (!existsSync(modelPath)) return false;
  unlinkSync(modelPath);
  return true;
}

export type WhisperModelStatus = {
  modelId: WhisperModelId;
  fileName: string;
  downloaded: boolean;
  sizeBytes?: number;
  expectedSizeBytes: number;
};

export function listWhisperModelStatuses(): WhisperModelStatus[] {
  return WHISPER_MODEL_IDS.map((modelId) => {
    const definition = getWhisperModelDefinition(modelId);
    return {
      modelId,
      fileName: definition.fileName,
      downloaded: isWhisperModelDownloaded(modelId),
      sizeBytes: getWhisperModelSizeBytes(modelId),
      expectedSizeBytes: definition.sizeBytes,
    };
  });
}
