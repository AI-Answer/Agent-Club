/**
 * @license
 * Copyright 2025 Agent Club (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import WebSocket from 'ws';
import type { BotInfo, IChannelPluginConfig, IUnifiedOutgoingMessage, PluginType } from '../../types';
import { BasePlugin } from '../BasePlugin';

const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';
const DISCORD_INTENTS = 1 | 512 | 4096 | 32768;

type DiscordGatewayPayload<T = unknown> = {
  op: number;
  d?: T;
  s?: number;
  t?: string;
};

type DiscordReadyPayload = {
  user?: DiscordUser;
};

type DiscordMessagePayload = {
  id: string;
  channel_id: string;
  guild_id?: string;
  content?: string;
  timestamp?: string;
  author?: DiscordUser & { bot?: boolean };
  mentions?: DiscordUser[];
  referenced_message?: { id?: string } | null;
};

type DiscordUser = {
  id: string;
  username?: string;
  global_name?: string | null;
};

/**
 * Discord Gateway channel plugin.
 *
 * Uses a bot token to connect to Gateway v10 and routes MESSAGE_CREATE events
 * into the channel pipeline. Outgoing replies use the Discord REST message API.
 */
export class DiscordPlugin extends BasePlugin {
  readonly type: PluginType = 'discord';

  private botToken = '';
  private socket: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private sequence: number | null = null;
  private botUser: DiscordUser | null = null;
  private stopped = false;
  private activeUsers = new Set<string>();

  protected async onInitialize(config: IChannelPluginConfig): Promise<void> {
    const botToken = config.credentials?.botToken;
    if (!botToken) {
      throw new Error('Discord bot token is required');
    }
    this.botToken = String(botToken).trim();
  }

  protected async onStart(): Promise<void> {
    this.stopped = false;
    await this.fetchBotUser();
    await this.connectGateway();
  }

  protected async onStop(): Promise<void> {
    this.stopped = true;
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = null;
    }
    this.activeUsers.clear();
  }

  async sendMessage(chatId: string, message: IUnifiedOutgoingMessage): Promise<string> {
    const response = await this.discordFetch<{ id: string }>(`/channels/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content: message.text || '',
        message_reference: message.replyToMessageId ? { message_id: message.replyToMessageId } : undefined,
        allowed_mentions: { parse: ['users'] },
      }),
    });
    return response.id;
  }

  async editMessage(chatId: string, messageId: string, message: IUnifiedOutgoingMessage): Promise<void> {
    await this.discordFetch(`/channels/${chatId}/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        content: message.text || '',
        allowed_mentions: { parse: ['users'] },
      }),
    });
  }

  getActiveUserCount(): number {
    return this.activeUsers.size;
  }

  getBotInfo(): BotInfo | null {
    if (!this.botUser) return null;
    return {
      id: this.botUser.id,
      username: this.botUser.username,
      displayName: this.botUser.global_name || this.botUser.username || 'Discord',
    };
  }

  private async fetchBotUser(): Promise<void> {
    this.botUser = await this.discordFetch<DiscordUser>('/users/@me');
  }

  private async connectGateway(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(DISCORD_GATEWAY);
      this.socket = socket;

      socket.once('open', () => resolve());
      socket.once('error', reject);
      socket.on('message', (data) => {
        void this.handleGatewayMessage(data.toString()).catch((error) => {
          console.error('[DiscordPlugin] Failed to handle gateway message:', error);
          this.setError(error instanceof Error ? error.message : String(error));
        });
      });
      socket.on('close', () => {
        this.stopHeartbeat();
        if (!this.stopped) this.scheduleReconnect();
      });
    });
  }

  private async handleGatewayMessage(raw: string): Promise<void> {
    const payload = JSON.parse(raw) as DiscordGatewayPayload;
    if (typeof payload.s === 'number') this.sequence = payload.s;

    if (payload.op === 10) {
      const hello = payload.d as { heartbeat_interval?: number } | undefined;
      this.identify();
      this.startHeartbeat(hello?.heartbeat_interval || 45000);
      return;
    }

    if (payload.op === 11) return;
    if (payload.t === 'READY') {
      const ready = payload.d as DiscordReadyPayload;
      if (ready.user) this.botUser = ready.user;
      return;
    }

    if (payload.t === 'MESSAGE_CREATE') {
      await this.handleMessageCreate(payload.d as DiscordMessagePayload);
    }
  }

  private async handleMessageCreate(message: DiscordMessagePayload): Promise<void> {
    const author = message.author;
    if (!author || author.bot || author.id === this.botUser?.id) return;
    if (!message.content) return;
    if (message.guild_id && !message.mentions?.some((mention) => mention.id === this.botUser?.id)) return;

    this.activeUsers.add(author.id);
    await this.emitMessage({
      id: message.id,
      platform: 'discord',
      chatId: message.channel_id,
      user: {
        id: author.id,
        username: author.username,
        displayName: author.global_name || author.username || `Discord ${author.id}`,
      },
      content: {
        type: message.guild_id ? 'command' : 'text',
        text: this.stripBotMention(message.content),
      },
      timestamp: message.timestamp ? Date.parse(message.timestamp) : Date.now(),
      replyToMessageId: message.referenced_message?.id,
      raw: message,
    });
  }

  private identify(): void {
    this.socket?.send(
      JSON.stringify({
        op: 2,
        d: {
          token: this.botToken,
          intents: DISCORD_INTENTS,
          properties: {
            os: process.platform,
            browser: 'agent-club',
            device: 'agent-club',
          },
        },
      })
    );
  }

  private startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.socket?.send(JSON.stringify({ op: 1, d: this.sequence }));
    }, intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    setTimeout(() => {
      if (!this.stopped) {
        void this.connectGateway().catch((error) => {
          console.error('[DiscordPlugin] Reconnect failed:', error);
          this.setError(error instanceof Error ? error.message : String(error));
          this.scheduleReconnect();
        });
      }
    }, 5000);
  }

  private stripBotMention(text: string): string {
    return this.botUser ? text.replace(new RegExp(`<@!?${this.botUser.id}>`, 'g'), '').trim() || text : text;
  }

  private async discordFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${DISCORD_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bot ${this.botToken}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
    const json = response.status === 204 ? null : await response.json().catch((): null => null);
    if (!response.ok) {
      const message =
        json && typeof json === 'object' && 'message' in json ? String((json as { message?: string }).message) : '';
      throw new Error(message || `Discord API request failed with HTTP ${response.status}`);
    }
    return json as T;
  }
}
