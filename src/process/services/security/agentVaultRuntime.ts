import * as dotenv from 'dotenv';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { getDataPath } from '@process/utils/utils';

const SECURITY_DIR = 'security';
const VAULT_FILE = 'agent-vault.env';
const VAULT_META_FILE = 'agent-vault.meta.json';
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

type AgentVaultMeta = {
  enabled?: boolean;
  updatedAt?: number;
};

type AgentVaultRuntimeState = {
  enabled: boolean;
  content: string;
  filePath: string;
  keyCount: number;
  keys: string[];
  values: Record<string, string>;
  updatedAt?: number;
};

let appliedKeys = new Set<string>();

export function getAgentVaultPaths(): { dir: string; filePath: string; metaPath: string } {
  const dir = path.join(getDataPath(), SECURITY_DIR);
  return {
    dir,
    filePath: path.join(dir, VAULT_FILE),
    metaPath: path.join(dir, VAULT_META_FILE),
  };
}

function readMetaSync(metaPath: string): AgentVaultMeta {
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as AgentVaultMeta;
  } catch {
    return { enabled: false };
  }
}

function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function parseAgentVaultContent(content: string): Record<string, string> {
  const parsed = dotenv.parse(normalizeContent(content));
  return Object.fromEntries(
    Object.entries(parsed).filter(([key, value]) => ENV_NAME_PATTERN.test(key) && typeof value === 'string')
  );
}

export function getAgentVaultRuntimeStateSync(): AgentVaultRuntimeState {
  const paths = getAgentVaultPaths();
  const meta = readMetaSync(paths.metaPath);
  let content = '';

  try {
    content = fs.readFileSync(paths.filePath, 'utf8');
  } catch {
    content = '';
  }

  const values = parseAgentVaultContent(content);
  const keys = Object.keys(values).sort((a, b) => a.localeCompare(b));

  return {
    enabled: meta.enabled === true,
    content,
    filePath: paths.filePath,
    keyCount: keys.length,
    keys,
    values,
    updatedAt: meta.updatedAt,
  };
}

export async function saveAgentVaultRuntimeState(params: {
  enabled: boolean;
  content: string;
}): Promise<AgentVaultRuntimeState> {
  const paths = getAgentVaultPaths();
  const normalized = normalizeContent(params.content);
  const updatedAt = Date.now();

  await fsp.mkdir(paths.dir, { recursive: true });
  await fsp.writeFile(paths.filePath, normalized, { encoding: 'utf8', mode: 0o600 });
  await fsp.chmod(paths.filePath, 0o600).catch(() => {});
  await fsp.writeFile(paths.metaPath, JSON.stringify({ enabled: params.enabled, updatedAt }, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  await fsp.chmod(paths.metaPath, 0o600).catch(() => {});

  return getAgentVaultRuntimeStateSync();
}

export function applyAgentVaultToProcessEnv(): AgentVaultRuntimeState {
  const state = getAgentVaultRuntimeStateSync();

  for (const key of appliedKeys) {
    delete process.env[key];
  }
  appliedKeys = new Set<string>();

  process.env.AGENT_CLUB_VAULT_ENV_FILE = state.filePath;
  process.env.AGENT_CLUB_VAULT_ENABLED = state.enabled ? '1' : '0';
  process.env.AGENT_CLUB_VAULT_KEYS = state.enabled ? state.keys.join(',') : '';

  if (state.enabled) {
    for (const [key, value] of Object.entries(state.values)) {
      process.env[key] = value;
      appliedKeys.add(key);
    }
  }

  return state;
}

export function getAgentVaultEnvForChildProcess(): Record<string, string> {
  const state = getAgentVaultRuntimeStateSync();
  if (!state.enabled) {
    return {
      AGENT_CLUB_VAULT_ENV_FILE: state.filePath,
      AGENT_CLUB_VAULT_ENABLED: '0',
      AGENT_CLUB_VAULT_KEYS: '',
    };
  }

  return {
    ...state.values,
    AGENT_CLUB_VAULT_ENV_FILE: state.filePath,
    AGENT_CLUB_VAULT_ENABLED: '1',
    AGENT_CLUB_VAULT_KEYS: state.keys.join(','),
  };
}
