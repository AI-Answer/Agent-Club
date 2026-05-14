export interface AgentVaultConfig {
  enabled: boolean;
  filePath?: string;
  keyCount?: number;
  keys?: string[];
  updatedAt?: number;
}

export interface AgentVaultState {
  enabled: boolean;
  content: string;
  filePath: string;
  keyCount: number;
  keys: string[];
  updatedAt?: number;
  mcpServerName: string;
}

export interface AgentVaultSaveRequest {
  enabled: boolean;
  content: string;
}

export interface OnePasswordSecurityConfig {
  enabled: boolean;
  resolveReferences: boolean;
  account?: string;
  serviceAccountToken?: string;
  updatedAt?: number;
}

export interface OnePasswordSecurityPublicConfig {
  enabled: boolean;
  resolveReferences: boolean;
  account?: string;
  hasServiceAccountToken: boolean;
  updatedAt?: number;
}

export interface OnePasswordSecuritySaveRequest {
  enabled: boolean;
  resolveReferences: boolean;
  account?: string;
  serviceAccountToken?: string;
  keepExistingToken?: boolean;
  clearServiceAccountToken?: boolean;
}

export interface OnePasswordCliStatus {
  installed: boolean;
  version?: string;
  error?: string;
}

export interface SecuritySettingsState {
  agentVault: AgentVaultState;
  onePassword: OnePasswordSecurityPublicConfig;
}
