/**
 * @license
 * Copyright 2025 Agent Club (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import type { BotInfo, IChannelPluginConfig, IUnifiedOutgoingMessage, PluginType } from '../../types';
import { stripHtml } from '../weixin/WeixinAdapter';
import { BasePlugin } from '../BasePlugin';
import { setActiveImessagePlugin } from './BlueBubblesWebhookState';

const BLUEBUBBLES_WEBHOOK_PATH = '/channels/imessage/bluebubbles/webhook';
const DRAFT_FLUSH_DELAY_MS = 3000;

type BlueBubblesApiResponse<T = unknown> = {
  status?: number;
  message?: string;
  data?: T;
  error?: {
    type?: string;
    error?: string;
  };
};

type DraftMessage = {
  chatId: string;
  text: string;
  timer: ReturnType<typeof setTimeout> | null;
  sentText?: string;
  sendQueue: Promise<void>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getRecordValue(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  return asRecord(record?.[key]);
}

function getString(record: Record<string, unknown> | null, ...keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function getBoolean(record: Record<string, unknown> | null, ...keys: string[]): boolean | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

function normalizeTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsedNumber = Number(value);
    if (Number.isFinite(parsedNumber)) {
      return parsedNumber < 10_000_000_000 ? parsedNumber * 1000 : parsedNumber;
    }
    const parsedDate = Date.parse(value);
    if (Number.isFinite(parsedDate)) return parsedDate;
  }
  return Date.now();
}

function extractData<T>(json: BlueBubblesApiResponse<T>): T | BlueBubblesApiResponse<T> {
  return json.data === undefined ? json : json.data;
}

function extractMessageGuid(response: unknown, fallback: string): string {
  const data = asRecord(response);
  const nestedData = getRecordValue(data, 'data');
  return (
    getString(nestedData, 'guid', 'messageGuid', 'tempGuid', 'id') ||
    getString(data, 'guid', 'messageGuid', 'tempGuid', 'id') ||
    fallback
  );
}

function pickWebhookMessage(payload: Record<string, unknown>): Record<string, unknown> | null {
  const data = getRecordValue(payload, 'data');
  const nestedMessage = getRecordValue(data, 'message');
  const directMessage = getRecordValue(payload, 'message');
  return nestedMessage || data || directMessage || payload;
}

function pickChatGuid(message: Record<string, unknown>, payload: Record<string, unknown>): string | undefined {
  const direct =
    getString(message, 'chatGuid', 'chat_guid', 'chatIdentifier', 'chatId') ||
    getString(payload, 'chatGuid', 'chat_guid', 'chatIdentifier', 'chatId');
  if (direct) return direct;

  const chats = message.chats || payload.chats;
  if (Array.isArray(chats)) {
    for (const chat of chats) {
      const guid = getString(asRecord(chat), 'guid', 'chatGuid', 'id');
      if (guid) return guid;
    }
  }
  return undefined;
}

function pickSender(message: Record<string, unknown>, payload: Record<string, unknown>): string {
  const handle = getRecordValue(message, 'handle') || getRecordValue(payload, 'handle');
  return (
    getString(message, 'handleAddress', 'address', 'sender', 'from', 'fromAddress', 'phone', 'email') ||
    getString(handle, 'address', 'originalROWID', 'id') ||
    'imessage-user'
  );
}

function pickText(message: Record<string, unknown>): string {
  const text = getString(message, 'text', 'message', 'body', 'content');
  if (text) return text;

  const attributedBody = getRecordValue(message, 'attributedBody');
  return getString(attributedBody, 'string', 'text') || '';
}

function extractOutgoingText(message: IUnifiedOutgoingMessage): string {
  if (message.type !== 'text' || typeof message.text !== 'string') return '';
  return stripHtml(message.text).trim();
}

/**
 * iMessage channel plugin backed by BlueBubbles Server.
 *
 * BlueBubbles pushes inbound messages to the WebUI webhook endpoint and this
 * plugin sends outbound text through the BlueBubbles REST API. We avoid
 * streaming partial edits into iMessage: the channel drafts edits internally
 * and only flushes the latest draft once the response is final or idle.
 */
export class ImessagePlugin extends BasePlugin {
  readonly type: PluginType = 'imessage';

  private serverUrl = '';
  private guid = '';
  private activeUsers = new Set<string>();
  private readonly seenEvents = new Map<string, number>();
  private readonly drafts = new Map<string, DraftMessage>();
  readonly metrics = {
    received: 0,
    sent: 0,
    updated: 0,
    lastEventAt: 0,
  };

  static getWebhookPath(): string {
    return BLUEBUBBLES_WEBHOOK_PATH;
  }

  protected async onInitialize(config: IChannelPluginConfig): Promise<void> {
    const serverUrl = String(config.credentials?.serverUrl || '').trim();
    const guid = String(config.credentials?.guid || '').trim();
    if (!serverUrl || !guid) {
      throw new Error('BlueBubbles server URL and password/guid are required');
    }
    this.serverUrl = serverUrl.replace(/\/+$/, '');
    this.guid = guid;
  }

  protected async onStart(): Promise<void> {
    await this.callBlueBubbles('/api/v1/ping', { method: 'GET' });
    setActiveImessagePlugin(this);
  }

  protected async onStop(): Promise<void> {
    setActiveImessagePlugin(null);
    for (const draft of this.drafts.values()) {
      if (draft.timer) clearTimeout(draft.timer);
    }
    this.drafts.clear();
    this.activeUsers.clear();
    this.seenEvents.clear();
  }

  isRunning(): boolean {
    return this._status === 'running';
  }

  verifyWebhookGuid(value: string): boolean {
    return Boolean(value) && value === this.guid;
  }

  async handleWebhookPayload(payload: Record<string, unknown>): Promise<{ accepted: boolean; reason?: string }> {
    if (!this.isRunning()) {
      return { accepted: false, reason: 'plugin not running' };
    }

    const message = pickWebhookMessage(payload);
    if (!message) return { accepted: false, reason: 'missing message payload' };

    if (getBoolean(message, 'isFromMe') || getBoolean(payload, 'isFromMe')) {
      return { accepted: false, reason: 'own message ignored' };
    }

    const text = pickText(message);
    if (!text.trim()) return { accepted: false, reason: 'empty message ignored' };

    const eventId =
      getString(message, 'guid', 'messageGuid', 'id', 'tempGuid') ||
      getString(payload, 'guid', 'messageGuid', 'id', 'eventId') ||
      randomUUID();
    if (this.shouldDropDuplicate(eventId)) {
      return { accepted: false, reason: 'duplicate ignored' };
    }

    const chatId = pickChatGuid(message, payload);
    if (!chatId) return { accepted: false, reason: 'missing chat guid' };

    const sender = pickSender(message, payload);
    this.activeUsers.add(sender);
    this.metrics.received += 1;
    this.metrics.lastEventAt = Date.now();

    await this.emitMessage({
      id: eventId,
      platform: 'imessage',
      chatId,
      user: {
        id: sender,
        username: sender,
        displayName: sender,
      },
      content: {
        type: 'text',
        text,
      },
      timestamp: normalizeTimestamp(message.dateCreated || message.date_created || payload.dateCreated),
      raw: payload,
    });

    return { accepted: true };
  }

  async sendMessage(chatId: string, message: IUnifiedOutgoingMessage): Promise<string> {
    const text = extractOutgoingText(message);
    if (text === '⏳ Thinking...') {
      const draftId = `imessage_draft_${randomUUID()}`;
      this.drafts.set(draftId, {
        chatId,
        text: '',
        timer: null,
        sendQueue: Promise.resolve(),
      });
      return draftId;
    }

    if (!text) return `imessage_empty_${randomUUID()}`;
    return this.sendText(chatId, text, message.replyToMessageId);
  }

  async editMessage(chatId: string, messageId: string, message: IUnifiedOutgoingMessage): Promise<void> {
    const text = extractOutgoingText(message);
    if (!text) return;

    const draft =
      this.drafts.get(messageId) ||
      ({
        chatId,
        text: '',
        timer: null,
        sendQueue: Promise.resolve(),
      } satisfies DraftMessage);
    draft.chatId = chatId;
    draft.text = text;
    this.drafts.set(messageId, draft);

    if (message.replyMarkup !== undefined) {
      await this.flushDraft(messageId);
      return;
    }

    if (draft.timer) clearTimeout(draft.timer);
    draft.timer = setTimeout(() => {
      void this.flushDraft(messageId).catch((error) => {
        console.error('[ImessagePlugin] Failed to flush drafted message:', error);
        this.setError(error instanceof Error ? error.message : String(error));
      });
    }, DRAFT_FLUSH_DELAY_MS);
  }

  getActiveUserCount(): number {
    return this.activeUsers.size;
  }

  getBotInfo(): BotInfo | null {
    return {
      id: 'imessage',
      username: 'BlueBubbles',
      displayName: 'iMessage (BlueBubbles)',
    };
  }

  private shouldDropDuplicate(eventId: string): boolean {
    const now = Date.now();
    const lastSeen = this.seenEvents.get(eventId);
    if (lastSeen && now - lastSeen < 5 * 60_000) return true;
    this.seenEvents.set(eventId, now);
    return false;
  }

  private async flushDraft(messageId: string): Promise<void> {
    const draft = this.drafts.get(messageId);
    if (!draft || !draft.text.trim()) return;

    if (draft.timer) {
      clearTimeout(draft.timer);
      draft.timer = null;
    }

    if (draft.sentText === draft.text) return;
    const textToSend = draft.text;
    draft.sendQueue = draft.sendQueue
      .catch((): void => undefined)
      .then(async () => {
        await this.sendText(draft.chatId, textToSend);
        draft.sentText = textToSend;
      });
    await draft.sendQueue;
  }

  private async sendText(chatId: string, text: string, replyToMessageId?: string): Promise<string> {
    const tempGuid = randomUUID();
    const payload: Record<string, unknown> = {
      chatGuid: chatId,
      tempGuid,
      message: text,
    };
    if (replyToMessageId) {
      payload.selectedMessageGuid = replyToMessageId;
      payload.partIndex = 0;
    }
    const response = await this.callBlueBubbles('/api/v1/message/text', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    this.metrics.sent += 1;
    this.metrics.lastEventAt = Date.now();
    return extractMessageGuid(response, tempGuid);
  }

  private async callBlueBubbles<T = unknown>(path: string, init: RequestInit): Promise<T | BlueBubblesApiResponse<T>> {
    const url = new URL(`${this.serverUrl}${path}`);
    url.searchParams.set('guid', this.guid);
    const response = await fetch(url.toString(), {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    const text = await response.text();
    const json = text
      ? (JSON.parse(text) as BlueBubblesApiResponse<T>)
      : ({ status: response.status } as BlueBubblesApiResponse<T>);
    if (!response.ok || (typeof json.status === 'number' && json.status >= 400)) {
      const error = json.error?.error || json.message || `BlueBubbles API request failed with HTTP ${response.status}`;
      throw new Error(error);
    }
    return extractData(json);
  }
}
