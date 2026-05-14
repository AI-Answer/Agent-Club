export type JourneyKitsSource = 'list' | 'search';
export type JourneyKitsVisibility = 'public' | 'private';

export interface JourneyKitSummary {
  kitRef: string;
  owner: string;
  slug: string;
  title: string;
  summary: string;
  description?: string;
  ownerDisplayName?: string;
  ownerAvatarUrl?: string;
  releaseTag?: string;
  visibility?: string;
  verifiedPublisher?: boolean;
  installCount?: number;
  setupDifficulty?: string;
  topTag?: string;
  securityScore?: number;
  completenessScore?: number;
}

export interface JourneyKitsSearchRequest {
  query?: string;
  limit?: number;
  sort?: 'popular' | 'newest' | 'updated';
}

export interface JourneyKitsSearchResult {
  kits: JourneyKitSummary[];
  total?: number;
  source: JourneyKitsSource;
}

export interface JourneyKitsInstallRequest {
  owner: string;
  slug: string;
}

export interface JourneyKitsInstallResult {
  kitRef: string;
  skillName: string;
  skillPath: string;
  filesWritten: number;
  alreadyExists?: boolean;
}

export interface JourneyKitsConfigPublic {
  author: string;
  visibility: JourneyKitsVisibility;
  hasApiKey: boolean;
  keyPrefix?: string;
}

export interface JourneyKitsConfigSaveRequest {
  apiKey?: string;
  clearApiKey?: boolean;
  author?: string;
  visibility?: JourneyKitsVisibility;
}

export interface JourneyKitsOwnKitsRequest {
  limit?: number;
  offset?: number;
}

export interface JourneyKitsOwnKitsResult {
  kits: JourneyKitSummary[];
  total?: number;
}

export interface JourneyKitsPublishSkillRequest {
  skillName: string;
  skillPath: string;
  author?: string;
  visibility?: JourneyKitsVisibility;
  releaseNotes?: string;
}

export interface JourneyKitsPublishResult {
  kitRef: string;
  owner?: string;
  slug?: string;
  revisionId?: string;
  reviewRequired?: boolean;
  message?: string;
  findings?: unknown[];
}

export interface JourneyKitsDeleteRequest {
  owner: string;
  slug: string;
}
