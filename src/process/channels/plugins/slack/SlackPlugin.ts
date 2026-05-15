/**
 * @license
 * Copyright 2025 Agent Club (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import WebSocket from 'ws';
import type { BotInfo, IChannelPluginConfig, IUnifiedOutgoingMessage, PluginType } from '../../types';
import { BasePlugin } from '../BasePlugin';

type SlackSocketEnvelope = {
  envelope_id?: string;
  type?: string;
  payload?: {
    event?: SlackMessageEvent;
    type?: string;
  };
};

type SlackMessageEvent = {
  type?: string;
  subtype?: string;
  channel?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  event_ts?: string;
  client_msg_id?: string;
};

type SlackApiResponse<T> = T & {
  ok?: boolean;
  error?: string;
};

type SlackAuthTestResponse = SlackApiResponse<{
  bot_id?: string;
  user_id?: string;
  user?: string;
  team?: string;
}>;

type SlackOpenConnectionResponse = SlackApiResponse<{
  url?: string;
}>;

type SlackPostMessageResponse = SlackApiResponse<{
  ts?: string;
}>;

/**
 * Slack Socket Mode channel plugin.
 *
 * Requires a bot token for Web API calls and an app-level token with
 * connections:write for Socket Mode. Incoming events are routed into the
 * existing channel message pipeline; outgoing replies use chat.postMessage.
 */
export class SlackPlugin extends BasePlugin {
  readonly type: PluginType = 'slack';

  private botToken = '';
  private appToken = '';
  private botUserId: string | null = null;
  private teamName: string | null = null;
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private activeUsers = new Set<string>();

  protected async onInitialize(config: IChannelPluginConfig): Promise<void> {
    const botToken = config.credentials?.botToken;
    const appToken = config.credentials?.appToken;
    if (!botToken || !appToken) {
      throw new Error('Slack bot token and app-level token are required');
    }
    this.botToken = String(botToken).trim();
    this.appToken = String(appToken).trim();
  }

  protected async onStart(): Promise<void> {
    this.stopped = false;
    const auth = await this.callSlackApi<SlackAuthTestResponse>('https://slack.com/api/auth.test', this.botToken);
    this.botUserId = auth.user_id || auth.user || null;
    this.teamName = auth.team || null;
    await this.connectSocket();
  }

  protected async onStop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = null;
    }
    this.activeUsers.clear();
  }

  async sendMessage(chatId: string, message: IUnifiedOutgoingMessage): Promise<string> {
    const response = await this.callSlackApi<SlackPostMessageResponse>('https://slack.com/api/chat.postMessage', this.botToken, {
      channel: chatId,
      text: message.text || '',
      mrkdwn: true,
      thread_ts: message.replyToMessageId,
      unfurl_links: false,
      unfurl_media: false,
    });
    return response.ts || `${Date.now()}`;
  }

  async editMessage(chatId: string, messageId: string, message: IUnifiedOutgoingMessage): Promise<void> {
    await this.callSlackApi<SlackApiResponse<Record<string, never>>>('https://slack.com/api/chat.update', this.botToken, {
      channel: chatId,
      ts: messageId,
      text: message.text || '',
      mrkdwn: true,
    });
  }

  getActiveUserCount(): number {
    return this.activeUsers.size;
  }

  getBotInfo(): BotInfo | null {
    return {
      id: this.botUserId || 'slack',
      username: this.botUserId || undefined,
      displayName: this.teamName ? `Slack (${this.teamName})` : 'Slack',
    };
  }

  private async connectSocket(): Promise<void> {
    const connection = await this.callSlackApi<SlackOpenConnectionResponse>(
      'https://slack.com/api/apps.connections.open',
      this.appToken
    );
    if (!connection.url) {
      throw new Error('Slack did not return a Socket Mode WebSocket URL');
    }

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(connection.url!);
      this.socket = socket;

      socket.once('open', () => resolve());
      socket.once('error', reject);
      socket.on('message', (data) => {
        void this.handleSocketMessage(data.toString()).catch((error) => {
          console.error('[SlackPlugin] Failed to handle socket message:', error);
          this.setError(error instanceof Error ? error.message : String(error));
        });
      });
      socket.on('close', () => {
        if (!this.stopped) {
          this.scheduleReconnect();
        }
      });
    });
  }

  private async handleSocketMessage(raw: string): Promise<void> {
    const envelope = JSON.parse(raw) as SlackSocketEnvelope;
    if (envelope.envelope_id && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
    }

    const event = envelope.payload?.event;
    if (!event || !this.shouldRouteEvent(event)) return;

    const userId = event.user;
    const channelId = event.channel;
    if (!userId || !channelId || !event.text) return;

    this.activeUsers.add(userId);
    await this.emitMessage({
      id: event.client_msg_id || event.event_ts || event.ts || `${Date.now()}`,
      platform: 'slack',
      chatId: channelId,
      user: {
        id: userId,
        username: userId,
        displayName: `Slack ${userId}`,
      },
      content: {
        type: event.type === 'app_mention' ? 'command' : 'text',
        text: this.stripBotMention(event.text),
      },
      timestamp: Number(event.event_ts || event.ts || Date.now() / 1000) * 1000,
      raw: event,
    });
  }

  private shouldRouteEvent(event: SlackMessageEvent): boolean {
    if (event.bot_id || event.subtype) return false;
    if (event.type === 'app_mention') return true;
    if (event.type !== 'message') return false;
    if (event.channel?.startsWith('D')) return true;
    return this.botUserId ? Boolean(event.text?.includes(`<@${this.botUserId}>`)) : false;
  }

  private stripBotMention(text: string): string {
    return this.botUserId ? text.replace(new RegExp(`<@${this.botUserId}>`, 'g'), '').trim() || text : text;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectSocket().catch((error) => {
        console.error('[SlackPlugin] Reconnect failed:', error);
        this.setError(error instanceof Error ? error.message : String(error));
        this.scheduleReconnect();
      });
    }, 5000);
  }

  private async callSlackApi<T extends SlackApiResponse<unknown>>(
    url: string,
    token: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: body ? JSON.stringify(body) : '{}',
    });
    const json = (await response.json()) as T;
    if (!response.ok || json.ok === false) {
      throw new Error(json.error || `Slack API request failed with HTTP ${response.status}`);
    }
    return json;
  }
}
