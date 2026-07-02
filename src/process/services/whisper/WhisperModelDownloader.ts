/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWriteStream, statSync } from 'node:fs';
import { unlink, rename } from 'node:fs/promises';
import path from 'node:path';
import { getWhisperModelDefinition, resolveWhisperModelId } from '@/common/types/whisperModels';
import { getWhisperModelCacheDir } from '@process/services/whisper/WhisperModelStore';
import { mainError, mainLog } from '@process/utils/mainLogger';

export type WhisperModelDownloadStatus = 'starting' | 'downloading' | 'completed' | 'error' | 'cancelled';

export type WhisperModelDownloadProgressEvent = {
  downloadId: string;
  modelId: string;
  status: WhisperModelDownloadStatus;
  receivedBytes: number;
  totalBytes?: number;
  percent?: number;
  bytesPerSecond?: number;
  error?: string;
};

type DownloadListener = (event: WhisperModelDownloadProgressEvent) => void;

const LOG_TAG = '[WhisperModelDownloader]';
const activeDownloads = new Map<string, AbortController>();

const emit = (listener: DownloadListener | undefined, event: WhisperModelDownloadProgressEvent) => {
  listener?.(event);
};

async function attemptDownload(
  downloadId: string,
  modelId: string,
  url: string,
  filePath: string,
  abortController: AbortController,
  onProgress?: DownloadListener
): Promise<{ ok: boolean; message: string }> {
  let receivedBytes = 0;
  let totalBytes: number | undefined;
  const startedAt = Date.now();
  let lastEmitAt = 0;

  const emitThrottled = (status: WhisperModelDownloadStatus, error?: string) => {
    const now = Date.now();
    if (status === 'downloading' && now - lastEmitAt < 250) return;
    lastEmitAt = now;
    const elapsedSec = Math.max(0.001, (now - startedAt) / 1000);
    emit(onProgress, {
      downloadId,
      modelId,
      status,
      receivedBytes,
      totalBytes,
      percent: totalBytes ? Math.min(100, (receivedBytes / totalBytes) * 100) : undefined,
      bytesPerSecond: receivedBytes / elapsedSec,
      error,
    });
  };

  emitThrottled('starting');

  let stream: ReturnType<typeof createWriteStream> | null = null;
  try {
    const response = await fetch(url, { signal: abortController.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const parsed = Number.parseInt(contentLength, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        totalBytes = parsed;
      }
    }

    if (!response.body) {
      throw new Error('Empty response body');
    }

    stream = createWriteStream(filePath);
    const reader = response.body.getReader();

    let doneReading = false;
    while (!doneReading) {
      const { done, value } = await reader.read();
      doneReading = done;
      if (doneReading) break;
      if (!value) continue;

      receivedBytes += value.byteLength;
      const buf = Buffer.from(value);
      if (!stream.write(buf)) {
        await new Promise<void>((resolve) => stream?.once('drain', () => resolve()));
      }
      emitThrottled('downloading');
    }

    await new Promise<void>((resolve, reject) => {
      if (!stream) {
        resolve();
        return;
      }
      stream.end(() => resolve());
      stream.on('error', reject);
    });

    return { ok: true, message: '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      stream?.close();
    } catch {
      // ignore
    }
    try {
      await unlink(filePath);
    } catch {
      // ignore
    }
    return { ok: false, message };
  }
}

export async function downloadWhisperModel(
  modelIdInput: string,
  onProgress?: DownloadListener
): Promise<{ success: boolean; error?: string }> {
  const modelId = resolveWhisperModelId(modelIdInput);
  const definition = getWhisperModelDefinition(modelId);
  const downloadId = `whisper-${modelId}-${Date.now().toString(36)}`;
  const targetPath = path.join(getWhisperModelCacheDir(), definition.fileName);
  const tempPath = `${targetPath}.download`;

  const existing = activeDownloads.get(modelId);
  if (existing) {
    existing.abort();
  }

  const abortController = new AbortController();
  activeDownloads.set(modelId, abortController);

  mainLog(LOG_TAG, 'Starting model download', { modelId, url: definition.url });

  try {
    const result = await attemptDownload(
      downloadId,
      modelId,
      definition.url,
      tempPath,
      abortController,
      onProgress
    );

    if (!result.ok) {
      const isAbort = abortController.signal.aborted || result.message.toLowerCase().includes('abort');
      const status: WhisperModelDownloadStatus = isAbort ? 'cancelled' : 'error';
      emit(onProgress, {
        downloadId,
        modelId,
        status,
        receivedBytes: 0,
        error: result.message,
      });
      return { success: false, error: result.message };
    }

    await unlink(targetPath).catch((): void => undefined);
    await rename(tempPath, targetPath);

    const finalSize = totalBytesFromFile(targetPath);
    emit(onProgress, {
      downloadId,
      modelId,
      status: 'completed',
      receivedBytes: finalSize ?? 0,
      totalBytes: finalSize,
      percent: 100,
    });

    mainLog(LOG_TAG, 'Model download completed', { modelId, path: targetPath });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    mainError(LOG_TAG, 'Model download failed', { modelId, message });
    emit(onProgress, {
      downloadId,
      modelId,
      status: 'error',
      receivedBytes: 0,
      error: message,
    });
    return { success: false, error: message };
  } finally {
    activeDownloads.delete(modelId);
  }
}

function totalBytesFromFile(filePath: string): number | undefined {
  try {
    return statSync(filePath).size;
  } catch {
    return undefined;
  }
}

export function cancelWhisperModelDownload(modelIdInput: string): void {
  const modelId = resolveWhisperModelId(modelIdInput);
  activeDownloads.get(modelId)?.abort();
  activeDownloads.delete(modelId);
}
