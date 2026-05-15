/**
 * @license
 * Copyright 2025 Agent Club (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import { DiscordPlugin } from '../../src/process/channels/plugins/discord/DiscordPlugin';
import type { IUnifiedIncomingMessage } from '../../src/process/channels/types';

type DiscordPluginHarness = Pick<DiscordPlugin, 'onMessage'> & {
  botUser: { id: string; username?: string };
  handleMessageCreate(message: {
    id: string;
    channel_id: string;
    guild_id?: string;
    content?: string;
    timestamp?: string;
    author?: { id: string; username?: string; global_name?: string | null; bot?: boolean };
    mentions?: { id: string; username?: string }[];
  }): Promise<void>;
};

const createHarness = (): DiscordPluginHarness => new DiscordPlugin() as unknown as DiscordPluginHarness;

describe('DiscordPlugin', () => {
  it('routes non-slash guild mentions as text messages', async () => {
    const plugin = createHarness();
    const received: IUnifiedIncomingMessage[] = [];

    plugin.onMessage(async (message) => {
      received.push(message);
    });
    plugin.botUser = { id: 'bot-1', username: 'Cat' };

    await plugin.handleMessageCreate({
      id: 'message-1',
      channel_id: 'channel-1',
      guild_id: 'guild-1',
      content: '<@bot-1> hi',
      timestamp: '2026-05-15T03:37:00.000Z',
      author: { id: 'user-1', username: 'samin', global_name: 'Samin' },
      mentions: [{ id: 'bot-1', username: 'Cat' }],
    });

    expect(received).toHaveLength(1);
    expect(received[0].content).toEqual({ type: 'text', text: 'hi' });
  });

  it('routes slash-prefixed guild mentions as commands', async () => {
    const plugin = createHarness();
    const received: IUnifiedIncomingMessage[] = [];

    plugin.onMessage(async (message) => {
      received.push(message);
    });
    plugin.botUser = { id: 'bot-1', username: 'Cat' };

    await plugin.handleMessageCreate({
      id: 'message-2',
      channel_id: 'channel-1',
      guild_id: 'guild-1',
      content: '<@bot-1> /start',
      timestamp: '2026-05-15T03:37:00.000Z',
      author: { id: 'user-1', username: 'samin', global_name: 'Samin' },
      mentions: [{ id: 'bot-1', username: 'Cat' }],
    });

    expect(received).toHaveLength(1);
    expect(received[0].content).toEqual({ type: 'command', text: '/start' });
  });
});
