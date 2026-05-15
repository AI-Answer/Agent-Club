/**
 * @license
 * Copyright 2025 Agent Club (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '../../src/common/config/storage';
import {
  isChannelConversationForAgent,
  resolveChannelAgentPreference,
} from '../../src/process/channels/utils/channelConversation';

const makeConversation = (
  overrides: Partial<TChatConversation> & { extra?: Record<string, unknown> }
): TChatConversation =>
  ({
    id: 'conv-1',
    name: 'discord-acp-hermes-channel-1',
    type: 'acp',
    extra: { backend: 'hermes' },
    model: {} as TChatConversation['model'],
    source: 'discord',
    channelChatId: 'channel-1',
    createTime: 1,
    modifyTime: 1,
    ...overrides,
  }) as TChatConversation;

describe('channel conversation routing', () => {
  it('defaults Hermes-native channels to Hermes when no agent is saved', () => {
    expect(resolveChannelAgentPreference(undefined, 'discord')).toMatchObject({
      backend: 'hermes',
      name: 'Hermes Chief of Staff',
    });
    expect(resolveChannelAgentPreference(undefined, 'slack').backend).toBe('hermes');
    expect(resolveChannelAgentPreference(undefined, 'imessage').backend).toBe('hermes');
  });

  it('keeps legacy channels on Gemini by default', () => {
    expect(resolveChannelAgentPreference(undefined, 'telegram')).toEqual({ backend: 'gemini' });
  });

  it('rejects stale Gemini conversations for a Hermes Discord channel', () => {
    const staleGeminiConversation = makeConversation({
      type: 'gemini',
      extra: {},
      name: 'discord-gemini-channel-1',
    });

    expect(
      isChannelConversationForAgent(staleGeminiConversation, {
        platform: 'discord',
        channelChatId: 'channel-1',
        backend: 'hermes',
      })
    ).toBe(false);
  });

  it('accepts matching Hermes ACP conversations', () => {
    expect(
      isChannelConversationForAgent(makeConversation({}), {
        platform: 'discord',
        channelChatId: 'channel-1',
        backend: 'hermes',
      })
    ).toBe(true);
  });
});
