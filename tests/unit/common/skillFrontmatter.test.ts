import { describe, expect, it } from 'vitest';
import { parseSkillFrontmatter } from '@/common/skills/skillFrontmatter';

describe('parseSkillFrontmatter', () => {
  it('parses requiredEnv list block', () => {
    const content = `---
name: moltbook
description: Social network
requiredEnv:
  - MOLTBOOK_API_KEY
  - MOLTBOOK_AGENT_NAME
---
Body`;

    expect(parseSkillFrontmatter(content).requiredEnv).toEqual(['MOLTBOOK_API_KEY', 'MOLTBOOK_AGENT_NAME']);
  });

  it('parses inline requiredEnv array', () => {
    const content = `---
name: demo
requiredEnv: [FOO_API_KEY]
---`;

    expect(parseSkillFrontmatter(content).requiredEnv).toEqual(['FOO_API_KEY']);
  });
});
