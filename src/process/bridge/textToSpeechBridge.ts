/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { TextToSpeechService } from './services/TextToSpeechService';

export function initTextToSpeechBridge(): void {
  ipcBridge.textToSpeech.synthesize.provider(async (request) => {
    return TextToSpeechService.synthesize(request);
  });
}
