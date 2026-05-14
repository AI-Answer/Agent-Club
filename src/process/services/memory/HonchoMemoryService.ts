import { ConfigStorage } from '@/common/config/storage';
import type { TMessage } from '@/common/chat/chatLib';
import type { AgentBackend } from '@/common/types/acpTypes';
import {
  DEFAULT_HONCHO_MEMORY_CONFIG,
  type HonchoMemoryConfig,
  type HonchoMemorySnapshot,
  type HonchoSetupResult,
} from '@/common/types/memory';
import { Honcho, type Peer } from '@honcho-ai/sdk';

type CapturableMessage = {
  message: TMessage;
  backend?: AgentBackend;
};

const CAPTURED_LIMIT = 2000;

function normalizeConfig(config?: Partial<HonchoMemoryConfig>): HonchoMemoryConfig {
  return {
    ...DEFAULT_HONCHO_MEMORY_CONFIG,
    ...config,
    provider: config?.provider ?? DEFAULT_HONCHO_MEMORY_CONFIG.provider,
    apiKey: config?.apiKey?.trim() ?? DEFAULT_HONCHO_MEMORY_CONFIG.apiKey,
    baseURL: config?.baseURL?.trim() || DEFAULT_HONCHO_MEMORY_CONFIG.baseURL,
    workspaceId: config?.workspaceId?.trim() || DEFAULT_HONCHO_MEMORY_CONFIG.workspaceId,
    userPeerId: config?.userPeerId?.trim() || DEFAULT_HONCHO_MEMORY_CONFIG.userPeerId,
  };
}

function extractMessageText(message: TMessage): string {
  if (message.type !== 'text') {
    return '';
  }

  const content = message.content;
  if (typeof content === 'object' && content !== null && 'content' in content) {
    const value = (content as { content?: unknown }).content;
    return typeof value === 'string' ? value.trim() : '';
  }

  return '';
}

function slugPart(value: string | undefined): string {
  const cleaned = (value || 'agent')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'agent';
}

function resolveAgentPeerId(message: TMessage, backend?: AgentBackend): string {
  const content = message.content as { senderAgentType?: string; senderName?: string } | undefined;
  return `agent-${slugPart(content?.senderAgentType || backend || content?.senderName)}`;
}

function shouldCaptureMessage(config: HonchoMemoryConfig, message: TMessage): boolean {
  if (config.provider !== 'honcho' || !config.enabled || !config.apiKey.trim()) {
    return false;
  }

  if (message.hidden && !config.includeHiddenMessages) {
    return false;
  }

  const text = extractMessageText(message);
  if (!text) {
    return false;
  }

  if (message.position === 'right') {
    return config.captureUserMessages;
  }

  if (message.position === 'left') {
    return config.captureAgentMessages && message.status === 'finish';
  }

  return false;
}

class HonchoMemoryService {
  private captured = new Set<string>();

  async getConfig(overrides?: Partial<HonchoMemoryConfig>): Promise<HonchoMemoryConfig> {
    const stored = (await ConfigStorage.get('memory.honcho')) as Partial<HonchoMemoryConfig> | undefined;
    return normalizeConfig({ ...stored, ...overrides });
  }

  async testConfig(config: HonchoMemoryConfig): Promise<HonchoSetupResult> {
    const effective = normalizeConfig(config);
    if (effective.provider !== 'honcho') {
      throw new Error('Select Honcho as the active memory provider before testing Honcho setup.');
    }
    const client = this.createClient(effective);
    const peer = await this.ensureUserPeer(client, effective);
    const context = await peer.context({ searchQuery: 'preferences, goals, work style', maxConclusions: 25 });

    return {
      configured: true,
      workspaceId: effective.workspaceId,
      userPeerId: effective.userPeerId,
      peerCardCount: context.peerCard?.length ?? 0,
      representationAvailable: Boolean(context.representation),
      message: 'Honcho is connected.',
    };
  }

  async getSnapshot(): Promise<HonchoMemorySnapshot> {
    const config = await this.getConfig();
    if (config.provider !== 'honcho' || !config.apiKey.trim()) {
      return {
        configured: false,
        enabled: config.enabled,
        provider: config.provider,
        workspaceId: config.workspaceId,
        userPeerId: config.userPeerId,
        representation: null,
        peerCard: [],
        updatedAt: Date.now(),
      };
    }

    const client = this.createClient(config);
    const peer = await this.ensureUserPeer(client, config);
    const [contextResult, queueResult] = await Promise.allSettled([
      peer.context({ searchQuery: 'preferences, goals, work style, recurring projects', maxConclusions: 50 }),
      client.queueStatus({ observer: peer }),
    ]);

    if (contextResult.status === 'rejected') {
      throw contextResult.reason instanceof Error ? contextResult.reason : new Error(String(contextResult.reason));
    }

    return {
      configured: true,
      enabled: config.enabled,
      provider: config.provider,
      workspaceId: config.workspaceId,
      userPeerId: config.userPeerId,
      representation: contextResult.value.representation,
      peerCard: contextResult.value.peerCard ?? [],
      queueStatus: queueResult.status === 'fulfilled' ? queueResult.value : undefined,
      updatedAt: Date.now(),
    };
  }

  captureMessage({ message, backend }: CapturableMessage): void {
    void this.captureMessageAsync(message, backend).catch((error) => {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[HonchoMemory] Message capture skipped: ${reason}`);
    });
  }

  private async captureMessageAsync(message: TMessage, backend?: AgentBackend): Promise<void> {
    const config = await this.getConfig();
    if (!shouldCaptureMessage(config, message)) {
      return;
    }

    const text = extractMessageText(message);
    const isUser = message.position === 'right';
    const peerId = isUser ? config.userPeerId : resolveAgentPeerId(message, backend);
    const captureKey = `${config.workspaceId}:${message.conversation_id}:${message.id}:${peerId}`;

    if (this.captured.has(captureKey)) {
      return;
    }
    this.rememberCapture(captureKey);

    const client = this.createClient(config);
    const peer = isUser
      ? await this.ensureUserPeer(client, config)
      : await client.peer(peerId, {
          metadata: {
            source: 'agent-club',
            role: 'agent',
            backend: backend || 'unknown',
          },
          configuration: { observeMe: false },
        });

    const session = await client.session(message.conversation_id, {
      metadata: {
        source: 'agent-club',
        conversationId: message.conversation_id,
      },
    });

    await session.addPeers(
      peerId === config.userPeerId
        ? [[config.userPeerId, { observeMe: true, observeOthers: true }]]
        : [
            [config.userPeerId, { observeMe: true, observeOthers: true }],
            [peerId, { observeMe: false, observeOthers: true }],
          ]
    );

    await session.addMessages(
      peer.message(text, {
        createdAt: new Date(message.createdAt || Date.now()),
        metadata: {
          source: 'agent-club',
          conversationId: message.conversation_id,
          messageId: message.id,
          msgId: message.msg_id,
          role: isUser ? 'user' : 'agent',
          backend: backend || undefined,
        },
      })
    );
  }

  private createClient(config: HonchoMemoryConfig): Honcho {
    if (!config.apiKey.trim()) {
      throw new Error('Honcho API key is required.');
    }

    return new Honcho({
      apiKey: config.apiKey.trim(),
      baseURL: config.baseURL.trim(),
      workspaceId: config.workspaceId.trim(),
      environment: 'production',
      timeout: 10000,
      maxRetries: 1,
    });
  }

  private ensureUserPeer(client: Honcho, config: HonchoMemoryConfig): Promise<Peer> {
    return client.peer(config.userPeerId, {
      metadata: {
        source: 'agent-club',
        role: 'user',
      },
      configuration: { observeMe: true },
    });
  }

  private rememberCapture(key: string): void {
    this.captured.add(key);
    if (this.captured.size <= CAPTURED_LIMIT) {
      return;
    }

    const first = this.captured.values().next();
    if (!first.done) {
      this.captured.delete(first.value);
    }
  }
}

export const honchoMemoryService = new HonchoMemoryService();
