/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import { mcpService } from '@/common/adapter/ipcBridge';
import { ConfigStorage, type IMcpServer, type IMcpTool } from '@/common/config/storage';

export const PEEKABOO_SERVER_NAME = 'peekaboo';

/** Mirror of the tool list registered by ToolsSettings/PeekabooMcpSetup. */
const PEEKABOO_TOOLS: IMcpTool[] = [
  { name: 'image', description: 'Capture screenshots and visual state from the Mac.' },
  { name: 'see', description: 'Read visible UI and accessibility context before taking action.' },
  { name: 'click', description: 'Click visible UI targets during a supervised Hermes run.' },
  { name: 'type', description: 'Type into the focused app only after operator approval.' },
  { name: 'hotkey', description: 'Press keyboard shortcuts such as Cmd+L or Cmd+K.' },
  { name: 'scroll', description: 'Scroll the current window or view.' },
  { name: 'set_value', description: 'Set values on supported accessibility controls.' },
  { name: 'perform_action', description: 'Invoke supported native accessibility actions.' },
];

const buildPeekabooOriginalJson = (proxyScriptPath: string): string =>
  JSON.stringify(
    {
      mcpServers: {
        [PEEKABOO_SERVER_NAME]: { command: 'node', args: [proxyScriptPath] },
      },
    },
    null,
    2
  );

/** Build the Peekaboo stdio MCP server entry for session injection. */
export const buildPeekabooServer = (proxyScriptPath: string): IMcpServer => {
  const now = Date.now();
  return {
    id: `${PEEKABOO_SERVER_NAME}-builtin`,
    name: PEEKABOO_SERVER_NAME,
    description: 'Built-in Peekaboo desktop control MCP packaged with Agent Club for supervised Hermes sessions.',
    enabled: true,
    builtin: true,
    transport: { type: 'stdio', command: 'node', args: [proxyScriptPath] },
    tools: PEEKABOO_TOOLS,
    status: 'connected',
    createdAt: now,
    updatedAt: now,
    originalJson: buildPeekabooOriginalJson(proxyScriptPath),
  };
};

/**
 * Resolve the MCP servers to inject into the Jarvis Hermes ACP session.
 * Includes all enabled user servers (Peekaboo excluded unless engaged).
 */
export async function resolveJarvisSessionMcpServers(computerControlEngaged: boolean): Promise<IMcpServer[]> {
  let userServers: IMcpServer[] = [];
  try {
    const stored = await ConfigStorage.get('mcp.config');
    if (Array.isArray(stored)) {
      userServers = stored.filter((s) => s && s.enabled !== false);
    }
  } catch (err) {
    console.warn('[jarvis] failed to read mcp.config', err);
  }

  const servers = userServers.filter((s) => s.name.toLowerCase() !== PEEKABOO_SERVER_NAME);

  if (computerControlEngaged) {
    try {
      const setup = await mcpService.getPeekabooDesktopControlSetup.invoke();
      const proxyScriptPath = setup.success ? setup.data?.proxyScriptPath : undefined;
      if (proxyScriptPath) {
        servers.push(buildPeekabooServer(proxyScriptPath));
      }
    } catch (err) {
      console.warn('[jarvis] failed to resolve Peekaboo for session injection', err);
    }
  }

  return servers;
}
