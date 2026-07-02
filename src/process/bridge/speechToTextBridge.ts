/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { resolveWhisperModelId } from '@/common/types/whisperModels';
import { isWhisperCliAvailable } from '@process/agent/whisper/binaryResolver';
import { SpeechToTextService } from './services/SpeechToTextService';
import { downloadWhisperModel } from '@process/services/whisper/WhisperModelDownloader';
import {
  deleteWhisperModel,
  isWhisperModelDownloaded,
  listWhisperModelStatuses,
} from '@process/services/whisper/WhisperModelStore';

export function initSpeechToTextBridge(): void {
  ipcBridge.speechToText.transcribe.provider(async (request) => {
    return SpeechToTextService.transcribe(request);
  });

  ipcBridge.speechToText.isLocalReady.provider(async ({ modelId }) => {
    const resolvedModelId = resolveWhisperModelId(modelId);
    const binaryAvailable = isWhisperCliAvailable();
    const modelDownloaded = isWhisperModelDownloaded(resolvedModelId);
    return {
      ready: binaryAvailable && modelDownloaded,
      binaryAvailable,
      modelDownloaded,
      modelId: resolvedModelId,
    };
  });

  ipcBridge.speechToText.getLocalModelStatus.provider(async () => {
    return listWhisperModelStatuses();
  });

  ipcBridge.speechToText.downloadLocalModel.provider(async ({ modelId }) => {
    const result = await downloadWhisperModel(modelId, (event) => {
      ipcBridge.speechToText.localModelDownloadProgress.emit(event);
    });
    if (!result.success) {
      return { success: false, msg: result.error || 'Download failed' };
    }
    return { success: true };
  });

  ipcBridge.speechToText.deleteLocalModel.provider(async ({ modelId }) => {
    const deleted = deleteWhisperModel(modelId);
    if (!deleted) {
      return { success: false, msg: 'Model not found' };
    }
    return { success: true };
  });
}
