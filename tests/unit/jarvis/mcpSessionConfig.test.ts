/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IMcpServer } from '@/common/config/storage';
import { mapMcpServersForSession } from '@/process/agent/acp/mcpSessionConfig';

const allCaps = { stdio: true, http: true, sse: true };

describe('mapMcpServersForSession', () => {
  it('maps enabled stdio servers when stdio capability is present', () => {
    const servers: IMcpServer[] = [
      {
        id: 's1',
        name: 'demo',
        enabled: true,
        transport: { type: 'stdio', command: 'node', args: ['server.js'] },
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const mapped = mapMcpServersForSession(servers, allCaps);
    expect(mapped).toEqual([
      {
        type: 'stdio',
        name: 'demo',
        command: 'node',
        args: ['server.js'],
        env: [],
      },
    ]);
  });

  it('skips stdio servers when the agent lacks stdio capability', () => {
    const servers: IMcpServer[] = [
      {
        id: 's1',
        name: 'demo',
        enabled: true,
        transport: { type: 'stdio', command: 'node', args: [] },
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    expect(mapMcpServersForSession(servers, { stdio: false, http: true, sse: true })).toEqual([]);
  });

  it('maps http and sse transports to the correct session shapes', () => {
    const servers: IMcpServer[] = [
      {
        id: 'h1',
        name: 'http-demo',
        enabled: true,
        transport: { type: 'http', url: 'https://example.com/mcp' },
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 's1',
        name: 'sse-demo',
        enabled: true,
        transport: { type: 'sse', url: 'https://example.com/sse' },
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const mapped = mapMcpServersForSession(servers, allCaps);
    expect(mapped).toEqual([
      { type: 'http', name: 'http-demo', url: 'https://example.com/mcp', headers: undefined },
      { type: 'sse', name: 'sse-demo', url: 'https://example.com/sse', headers: undefined },
    ]);
  });
});
