export type MemoryProvider = 'honcho' | 'supermemory';

export interface HonchoMemoryConfig {
  provider: MemoryProvider;
  enabled: boolean;
  apiKey: string;
  baseURL: string;
  workspaceId: string;
  userPeerId: string;
  captureUserMessages: boolean;
  captureAgentMessages: boolean;
  includeHiddenMessages?: boolean;
  lastVerifiedAt?: number;
}

export interface HonchoSetupResult {
  configured: boolean;
  workspaceId: string;
  userPeerId: string;
  peerCardCount: number;
  representationAvailable: boolean;
  message: string;
}

export interface HonchoMemorySnapshot {
  configured: boolean;
  enabled: boolean;
  provider: MemoryProvider;
  workspaceId: string;
  userPeerId: string;
  representation: string | null;
  peerCard: string[];
  queueStatus?: unknown;
  updatedAt: number;
}

export const DEFAULT_HONCHO_MEMORY_CONFIG: HonchoMemoryConfig = {
  provider: 'honcho',
  enabled: false,
  apiKey: '',
  baseURL: 'https://api.honcho.dev',
  workspaceId: 'agent-club',
  userPeerId: 'user',
  captureUserMessages: true,
  captureAgentMessages: true,
  includeHiddenMessages: false,
};
