/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const VAULT_ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type VaultEntry = {
  key: string;
  value: string;
};

export function parseVaultEntries(content: string): VaultEntry[] {
  const entries: VaultEntry[] = [];
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!VAULT_ENV_KEY_PATTERN.test(key)) {
      continue;
    }

    const value = line.slice(separatorIndex + 1);
    entries.push({ key, value });
  }

  return entries;
}

export function buildVaultContent(entries: VaultEntry[]): string {
  return entries
    .filter((entry) => entry.key.trim().length > 0)
    .map((entry) => `${entry.key.trim()}=${entry.value}`)
    .join('\n')
    .concat(entries.length > 0 ? '\n' : '');
}

export function collectMissingVaultKeys(requiredKeys: string[], configuredKeys: string[]): string[] {
  const configured = new Set(configuredKeys.map((key) => key.trim()).filter(Boolean));
  return [...new Set(requiredKeys.map((key) => key.trim()).filter(Boolean))].filter((key) => !configured.has(key));
}

export function collectRequiredEnvForSkillNames(
  skills: Array<{ name: string; requiredEnv?: string[] }>,
  selectedSkillNames: string[]
): string[] {
  const selected = new Set(selectedSkillNames);
  const required = new Set<string>();

  for (const skill of skills) {
    if (!selected.has(skill.name) || !skill.requiredEnv?.length) {
      continue;
    }
    for (const envKey of skill.requiredEnv) {
      if (VAULT_ENV_KEY_PATTERN.test(envKey)) {
        required.add(envKey);
      }
    }
  }

  return [...required].sort((a, b) => a.localeCompare(b));
}

export function buildSkillVaultEnvHints(
  skills: Array<{ name: string; requiredEnv?: string[] }>,
  configuredKeys: string[]
): string {
  const configured = new Set(configuredKeys);
  const lines: string[] = [];

  for (const skill of skills) {
    if (!skill.requiredEnv?.length) {
      continue;
    }

    for (const envKey of skill.requiredEnv) {
      if (!configured.has(envKey)) {
        lines.push(`- ${skill.name} requires ${envKey} (not configured in Agent Vault yet)`);
      } else {
        lines.push(`- ${skill.name}: ${envKey} is configured in Agent Vault (do not ask the user to paste it in chat)`);
      }
    }
  }

  if (!lines.length) {
    return '';
  }

  return `[Skill Environment]
${lines.join('\n')}`;
}

/**
 * Short block for agent system prompts: how CLI/dotenv skills should load Agent Club secrets.
 * Uses only facts from runtime (vault file path + enabled flag).
 */
export function buildAgentClubVaultRunnerHint(params: { enabled: boolean; filePath: string }): string {
  const filePath = params.filePath.trim();
  if (!filePath) {
    return '';
  }

  if (params.enabled) {
    return `[Agent Club secrets]
Agent Vault is enabled. User secrets are stored in dotenv format at:
${filePath}
The environment variable AGENT_CLUB_VAULT_ENV_FILE is set to this path for this agent run.

When a skill script accepts a dotenv file (for example --env, --dotenv, or a documented ".env" path), pass this file so the script reads the same keys as Agent Club, for example:
  --env "$AGENT_CLUB_VAULT_ENV_FILE"
Vault keys are also present in the shell environment for this run. Do not ask the user to paste a secret that is already configured in the vault.

For project-only overrides, a workspace .env may still exist; it is separate from Agent Vault unless you merge them intentionally.`;
  }

  return `[Agent Club secrets]
Agent Vault is disabled: secrets are not injected into agent or CLI environments. Enable Agent Vault in Settings > Security after saving keys so skills can use environment variables or the file at:
${filePath}
`;
}
