import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { TMessage } from '@/common/chat/chatLib';
import type { AgentBackend } from '@/common/types/acpTypes';
import {
  DEFAULT_HONCHO_MEMORY_CONFIG,
  type HonchoMemoryConfig,
  type HonchoMemorySnapshot,
  type HonchoSetupResult,
} from '@/common/types/memory';
import { Honcho, type Peer } from '@honcho-ai/sdk';
import { ProcessConfig } from '@process/utils/initStorage';

type CapturableMessage = {
  message: TMessage;
  backend?: AgentBackend;
};

type HonchoCliConfig = {
  apiKey?: string;
  environmentUrl?: string;
  workspaceId?: string;
  peerId?: string;
};

const CAPTURED_LIMIT = 2000;
const execFileAsync = promisify(execFile);
const CHIEF_OF_STAFF_MEMORY_QUERY = [
  "Act as Sam's personal chief of staff using Honcho memory as the source of truth.",
  'Based only on memory, return concise guidance for:',
  '1. what Sam likely needs to focus on next,',
  '2. what an agent can take off his plate,',
  '3. what clarity Sam should see when he needs to reorient.',
  'Mark thin evidence plainly and do not invent private facts.',
].join(' ');

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

function readHonchoCliConfig(): Partial<HonchoMemoryConfig> {
  try {
    const configPath = path.join(os.homedir(), '.honcho', 'config.json');
    if (!fs.existsSync(configPath)) {
      return {};
    }

    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as HonchoCliConfig;
    return {
      provider: 'honcho',
      enabled: Boolean(parsed.apiKey),
      apiKey: parsed.apiKey,
      baseURL: parsed.environmentUrl,
      workspaceId: parsed.workspaceId,
      userPeerId: parsed.peerId,
    };
  } catch (error) {
    console.warn('[HonchoMemory] Failed to read ~/.honcho/config.json:', error);
    return {};
  }
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

function normalizePeerCard(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  if (value && typeof value === 'object') {
    const record = value as { peerCard?: unknown; card?: unknown; conclusions?: unknown };
    return normalizePeerCard(record.peerCard || record.card || record.conclusions);
  }

  return [];
}

class HonchoMemoryService {
  private captured = new Set<string>();

  async getConfig(overrides?: Partial<HonchoMemoryConfig>): Promise<HonchoMemoryConfig> {
    const stored = (await ProcessConfig.get('memory.honcho')) as Partial<HonchoMemoryConfig> | undefined;
    return normalizeConfig({ ...readHonchoCliConfig(), ...stored, ...overrides });
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

    try {
      const client = this.createClient(config);
      const peer = await this.withTimeout<Peer | undefined>(this.ensureUserPeer(client, config), 4000, undefined);
      if (!peer) {
        throw new Error('Honcho peer lookup timed out.');
      }
      const [cardResult, representationResult, chiefBriefResult, queueResult] = await Promise.allSettled([
        this.withTimeout(peer.getCard(), 6000, []),
        this.withTimeout(
          peer.representation({
            searchQuery:
              'personal source of truth, active goals, commitments, priorities, preferences, work style, recurring projects, automation opportunities',
            maxConclusions: 50,
          }),
          7000,
          null
        ),
        this.withTimeout(
          peer.chat(CHIEF_OF_STAFF_MEMORY_QUERY, { reasoningLevel: 'medium' }),
          9000,
          'Honcho memory is connected, but the chief-of-staff reasoning pass took too long for this dashboard load.'
        ),
        this.withTimeout(client.queueStatus({ observer: peer }), 3000, undefined),
      ]);

      if (cardResult.status === 'rejected' && representationResult.status === 'rejected') {
        const reason = cardResult.reason || representationResult.reason;
        throw reason instanceof Error ? reason : new Error(String(reason));
      }

      return {
        configured: true,
        enabled: config.enabled,
        provider: config.provider,
        workspaceId: config.workspaceId,
        userPeerId: config.userPeerId,
        representation: representationResult.status === 'fulfilled' ? representationResult.value : null,
        peerCard: cardResult.status === 'fulfilled' ? cardResult.value ?? [] : [],
        chiefOfStaffBrief:
          chiefBriefResult.status === 'fulfilled' && chiefBriefResult.value ? chiefBriefResult.value : null,
        queueStatus: queueResult.status === 'fulfilled' ? queueResult.value : undefined,
        updatedAt: Date.now(),
      };
    } catch (error) {
      const cliSnapshot = await this.getCliSnapshot(config);
      if (cliSnapshot) {
        return cliSnapshot;
      }

      throw error;
    }
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

  private async getCliSnapshot(config: HonchoMemoryConfig): Promise<HonchoMemorySnapshot | null> {
    try {
      const { stdout } = await execFileAsync('honcho', ['peer', 'card', config.userPeerId, '--json'], {
        timeout: 7000,
        maxBuffer: 1024 * 1024,
      });
      const peerCard = normalizePeerCard(JSON.parse(stdout));
      if (!peerCard.length) {
        return null;
      }

      return {
        configured: true,
        enabled: config.enabled,
        provider: config.provider,
        workspaceId: config.workspaceId,
        userPeerId: config.userPeerId,
        representation: null,
        peerCard,
        chiefOfStaffBrief:
          'Honcho SDK was slow, so Agent Club used the local Honcho CLI peer card as the source of truth for this dashboard load.',
        updatedAt: Date.now(),
      };
    } catch (error) {
      console.warn('[HonchoMemory] CLI fallback failed:', error);
      return null;
    }
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
      timeout: 12000,
      maxRetries: 0,
    });
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((resolve) => {
        setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
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
