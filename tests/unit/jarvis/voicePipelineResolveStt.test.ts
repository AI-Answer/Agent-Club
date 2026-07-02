/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockConfigGet = vi.fn();
const mockIsLocalReady = vi.fn();
const mockGetSpeechInputAvailability = vi.fn();
const mockIsSpeechToTextConfigured = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    speechToText: {
      isLocalReady: { invoke: (...args: unknown[]) => mockIsLocalReady(...args) },
    },
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: (...args: unknown[]) => mockConfigGet(...args),
  },
}));

vi.mock('@/renderer/hooks/system/useSpeechInput', () => ({
  getSpeechInputAvailability: () => mockGetSpeechInputAvailability(),
}));

vi.mock('@/common/types/speech', () => ({
  isSpeechToTextConfigured: (...args: unknown[]) => mockIsSpeechToTextConfigured(...args),
}));

import { resolveSttEngine } from '@/renderer/pages/jarvis/services/voicePipeline';

describe('resolveSttEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSpeechInputAvailability.mockReturnValue('record');
    mockIsSpeechToTextConfigured.mockReturnValue(true);
  });

  it('returns recorder when cloud speech-to-text is configured', async () => {
    mockConfigGet.mockResolvedValue({ enabled: true, provider: 'openai', apiKey: 'k' });
    await expect(resolveSttEngine()).resolves.toBe('recorder');
  });

  it('returns none when recording is unavailable and web speech is missing', async () => {
    mockConfigGet.mockResolvedValue({ enabled: false });
    mockGetSpeechInputAvailability.mockReturnValue('unsupported');
    await expect(resolveSttEngine()).resolves.toBe('none');
  });
});
