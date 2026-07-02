// @vitest-environment jsdom

/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';

const mockStop = vi.fn().mockResolvedValue({ success: true });
const mockSendMessage = vi.fn().mockResolvedValue({ success: true });
const mockCreate = vi.fn();
const mockRemove = vi.fn().mockResolvedValue(true);
const mockGetAgents = vi.fn();
let streamHandler: ((m: IResponseMessage) => void) | null = null;
const mockResolveMcp = vi.fn().mockResolvedValue([]);

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getAvailableAgents: { invoke: (...args: unknown[]) => mockGetAgents(...args) },
      responseStream: {
        on: (handler: (m: IResponseMessage) => void) => {
          streamHandler = handler;
          return () => {
            streamHandler = null;
          };
        },
      },
      sendMessage: { invoke: (...args: unknown[]) => mockSendMessage(...args) },
    },
    conversation: {
      create: { invoke: (...args: unknown[]) => mockCreate(...args) },
      remove: { invoke: (...args: unknown[]) => mockRemove(...args) },
      stop: { invoke: (...args: unknown[]) => mockStop(...args) },
    },
    fs: {
      readFileBuffer: { invoke: vi.fn() },
    },
    speechToText: {
      isLocalReady: { invoke: vi.fn().mockResolvedValue({ ready: false }) },
    },
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: vi.fn().mockResolvedValue({ enabled: false }),
  },
}));

vi.mock('@/renderer/hooks/system/useSpeechInput', () => ({
  getSpeechInputAvailability: () => 'unsupported',
  pickRecordingMimeType: () => 'audio/webm',
}));

vi.mock('@/renderer/services/SpeechToTextService', () => ({
  transcribeAudioBlob: vi.fn(),
}));

vi.mock('@/renderer/pages/jarvis/services/jarvisMcpServers', () => ({
  resolveJarvisSessionMcpServers: (...args: unknown[]) => mockResolveMcp(...args),
}));

import { HERMES_VOICE_MODEL, useVoicePipeline } from '@/renderer/pages/jarvis/services/voicePipeline';

describe('useVoicePipeline concurrency guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamHandler = null;
    mockGetAgents.mockResolvedValue({ success: true, data: [{ backend: 'hermes', name: 'Hermes' }] });
    mockCreate.mockResolvedValue({ id: 'convo-1' });
  });

  it('calls conversation.stop before sending when Hermes is already thinking', async () => {
    const { result } = renderHook(() => useVoicePipeline(HERMES_VOICE_MODEL));

    await act(async () => {
      await Promise.resolve();
    });

    expect(streamHandler).toBeTruthy();

    act(() => {
      streamHandler?.({
        type: 'start',
        msg_id: 'assistant-1',
        conversation_id: 'convo-1',
        data: null,
      });
    });

    await act(async () => {
      result.current.sendText('barge in');
      await Promise.resolve();
    });

    expect(mockStop).toHaveBeenCalledWith({ conversation_id: 'convo-1' });
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it('streams assistant text when content msg_id differs from start msg_id', async () => {
    const { result } = renderHook(() => useVoicePipeline(HERMES_VOICE_MODEL));

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      streamHandler?.({
        type: 'start',
        msg_id: 'client-msg-id',
        conversation_id: 'convo-1',
        data: null,
      });
      streamHandler?.({
        type: 'content',
        msg_id: 'adapter-msg-id',
        conversation_id: 'convo-1',
        data: 'Hello from Jarvis',
      });
      streamHandler?.({
        type: 'finish',
        msg_id: 'random-finish-id',
        conversation_id: 'convo-1',
        data: null,
      });
    });

    const jarvisLine = result.current.transcript.find((line) => line.role === 'jarvis');
    expect(jarvisLine?.text).toBe('Hello from Jarvis');
    expect(jarvisLine?.final).toBe(true);
  });
});
