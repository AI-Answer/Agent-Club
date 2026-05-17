/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type SkillFrontmatter = {
  name?: string;
  description?: string;
  requiredEnv?: string[];
};

const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseRequiredEnvBlock(frontmatter: string): string[] {
  const blockMatch = frontmatter.match(/^requiredEnv:\s*\n((?:[ \t]+-\s*.+\n?)+)/m);
  if (blockMatch) {
    return blockMatch[1]
      .split('\n')
      .map((line) => line.match(/^\s*-\s*['"]?([^'"\n]+)['"]?\s*$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => match[1].trim())
      .filter((key) => ENV_NAME_PATTERN.test(key));
  }

  const inlineMatch = frontmatter.match(/^requiredEnv:\s*\[([^\]]*)\]\s*$/m);
  if (inlineMatch) {
    return inlineMatch[1]
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter((key) => ENV_NAME_PATTERN.test(key));
  }

  const singleLineMatch = frontmatter.match(/^requiredEnv:\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?\s*$/m);
  if (singleLineMatch) {
    return [singleLineMatch[1].trim()];
  }

  return [];
}

export function parseSkillFrontmatter(content: string): SkillFrontmatter {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {};
  }

  const frontmatter = frontmatterMatch[1];
  const result: SkillFrontmatter = {};

  const nameMatch = frontmatter.match(/^name:\s*['"]?([^'"\n]+)['"]?\s*$/m);
  if (nameMatch) {
    result.name = nameMatch[1].trim();
  }

  const descMatch = frontmatter.match(/^description:\s*['"]?(.+?)['"]?\s*$/m);
  if (descMatch) {
    result.description = descMatch[1].trim();
  }

  const requiredEnv = parseRequiredEnvBlock(frontmatter);
  if (requiredEnv.length > 0) {
    result.requiredEnv = requiredEnv;
  }

  return result;
}
