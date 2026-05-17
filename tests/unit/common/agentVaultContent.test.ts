import { describe, expect, it } from 'vitest';
import {
  buildAgentClubVaultRunnerHint,
  collectMissingVaultKeys,
  collectRequiredEnvForSkillNames,
} from '@/common/skills/agentVaultContent';

describe('agentVaultContent', () => {
  it('collects missing vault keys for selected skills', () => {
    const missing = collectMissingVaultKeys(
      collectRequiredEnvForSkillNames(
        [
          { name: 'moltbook', requiredEnv: ['MOLTBOOK_API_KEY'] },
          { name: 'other', requiredEnv: ['OTHER_KEY'] },
        ],
        ['moltbook']
      ),
      ['MOLTBOOK_API_KEY']
    );

    expect(missing).toEqual([]);
  });
});

describe('buildAgentClubVaultRunnerHint', () => {
  it('includes path and --env example when enabled', () => {
    const text = buildAgentClubVaultRunnerHint({ enabled: true, filePath: '/tmp/agent-vault.env' });
    expect(text).toContain('/tmp/agent-vault.env');
    expect(text).toContain('AGENT_CLUB_VAULT_ENV_FILE');
    expect(text).toContain('--env "$AGENT_CLUB_VAULT_ENV_FILE"');
  });

  it('mentions disabled when vault off', () => {
    const text = buildAgentClubVaultRunnerHint({ enabled: false, filePath: '/tmp/agent-vault.env' });
    expect(text).toContain('disabled');
    expect(text).toContain('/tmp/agent-vault.env');
  });

  it('returns empty when file path is blank', () => {
    expect(buildAgentClubVaultRunnerHint({ enabled: true, filePath: '   ' })).toBe('');
  });
});
