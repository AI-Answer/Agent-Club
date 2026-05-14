import * as dotenv from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawnSync } from 'child_process';
import fs from 'fs';
import { z } from 'zod';
import { BUILTIN_AGENT_VAULT_NAME } from './constants';

const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function getVaultPath(): string {
  const filePath = process.env.AGENT_CLUB_VAULT_FILE || process.env.AGENT_CLUB_VAULT_ENV_FILE;
  if (!filePath) {
    throw new Error('Agent Club vault file path is not configured');
  }
  return filePath;
}

function readVaultValues(): Record<string, string> {
  if (process.env.AGENT_CLUB_VAULT_ENABLED === '0') {
    return {};
  }

  let content = '';
  try {
    content = fs.readFileSync(getVaultPath(), 'utf8');
  } catch {
    return {};
  }
  const parsed = dotenv.parse(content);
  return Object.fromEntries(
    Object.entries(parsed).filter(([key, value]) => ENV_NAME_PATTERN.test(key) && typeof value === 'string')
  );
}

function isOnePasswordReference(value: string): boolean {
  return value.trim().startsWith('op://');
}

function resolveOnePasswordReference(reference: string): string {
  const allowResolve = process.env.AGENT_CLUB_OP_RESOLVE === '1';
  if (!allowResolve) {
    throw new Error('1Password reference resolution is disabled in Agent Club Security settings');
  }

  const result = spawnSync('op', ['read', reference], {
    encoding: 'utf8',
    env: process.env,
    input: '',
    timeout: 30_000,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `op read exited with code ${result.status ?? 'unknown'}`);
  }

  return result.stdout.trimEnd();
}

async function main() {
  const server = new McpServer({
    name: BUILTIN_AGENT_VAULT_NAME,
    version: '1.0.0',
  });

  server.tool(
    'agent_vault_status',
    'Return Agent Club vault status, key count, vault path, and whether 1Password secret reference resolution is enabled.',
    {},
    async () => {
      const values = readVaultValues();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                enabled: process.env.AGENT_CLUB_VAULT_ENABLED !== '0',
                filePath: getVaultPath(),
                keyCount: Object.keys(values).length,
                onePasswordResolveEnabled: process.env.AGENT_CLUB_OP_RESOLVE === '1',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    'agent_vault_list_keys',
    'List key names available in the Agent Club vault without returning secret values.',
    {},
    async () => {
      const values = readVaultValues();
      const keys = Object.entries(values)
        .map(([key, value]) => ({ key, onePasswordReference: isOnePasswordReference(value) }))
        .sort((a, b) => a.key.localeCompare(b.key));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(keys, null, 2) }],
      };
    }
  );

  server.tool(
    'agent_vault_read_secret',
    'Read a single secret from the Agent Club vault by key. If the value is an op:// reference and 1Password is enabled, the resolved secret is returned.',
    {
      key: z.string().min(1).describe('Environment variable key to read from the Agent Club vault.'),
      resolve_1password: z.boolean().optional().describe('Resolve op:// references through 1Password CLI when possible.'),
    },
    async ({ key, resolve_1password }) => {
      const values = readVaultValues();
      if (!Object.prototype.hasOwnProperty.call(values, key)) {
        return {
          content: [{ type: 'text' as const, text: `Key not found: ${key}` }],
          isError: true,
        };
      }

      const rawValue = values[key];
      const shouldResolve = resolve_1password !== false && isOnePasswordReference(rawValue);
      const value = shouldResolve ? resolveOnePasswordReference(rawValue) : rawValue;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ key, value, resolvedFromOnePassword: shouldResolve }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    'agent_vault_read_1password_reference',
    'Resolve a 1Password op:// secret reference through 1Password CLI.',
    {
      reference: z.string().min(1).describe('A 1Password secret reference such as op://vault/item/field.'),
    },
    async ({ reference }) => {
      if (!isOnePasswordReference(reference)) {
        return {
          content: [{ type: 'text' as const, text: 'Reference must start with op://' }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ reference, value: resolveOnePasswordReference(reference) }, null, 2),
          },
        ],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(`[${BUILTIN_AGENT_VAULT_NAME}] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
