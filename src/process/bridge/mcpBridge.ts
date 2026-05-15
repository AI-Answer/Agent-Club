/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { mcpService } from '@process/services/mcpServices/McpService';
import { mcpOAuthService } from '@process/services/mcpServices/McpOAuthService';
import { getPlatformServices } from '@/common/platform';
import path from 'path';

const COMPOSIO_TOOL_ROUTER_SESSION_URL = 'https://backend.composio.dev/api/v3.1/tool_router/session';
const PEEKABOO_PACKAGE_NAME = '@steipete/peekaboo';
const PEEKABOO_PACKAGE_VERSION = '3.1.2';

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const getBuiltinMcpBaseDir = (): string => {
  const mainModuleDir =
    typeof require !== 'undefined' && require.main?.filename ? path.dirname(require.main.filename) : __dirname;
  const baseDir = path.basename(mainModuleDir) === 'chunks' ? path.dirname(mainModuleDir) : mainModuleDir;
  if (getPlatformServices().paths.isPackaged()) {
    return baseDir.replace('app.asar', 'app.asar.unpacked');
  }
  return baseDir;
};

const getBuiltinMcpScriptPath = (scriptName: string): string =>
  path.resolve(getBuiltinMcpBaseDir(), `${scriptName}.js`);

const validateComposioMcpUrl = (urlValue: unknown): string => {
  if (typeof urlValue !== 'string' || !urlValue.trim()) {
    throw new Error('Composio response did not include an MCP URL');
  }

  const url = new URL(urlValue);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('composio.dev')) {
    throw new Error('Composio response included an unexpected MCP URL');
  }
  return url.toString();
};

const parseComposioError = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string; suggested_fix?: string };
      message?: string;
    };
    return payload.error?.suggested_fix || payload.error?.message || payload.message || response.statusText;
  } catch {
    return response.statusText;
  }
};

export function initMcpBridge(): void {
  // MCP 服务相关 IPC 处理程序
  ipcBridge.mcpService.getAgentMcpConfigs.provider(async (agents) => {
    try {
      const result = await mcpService.getAgentMcpConfigs(agents);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error getting MCP configs',
      };
    }
  });

  ipcBridge.mcpService.testMcpConnection.provider(async (server) => {
    try {
      const result = await mcpService.testMcpConnection(server);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error testing MCP connection',
      };
    }
  });

  ipcBridge.mcpService.syncMcpToAgents.provider(async ({ mcpServers, agents }) => {
    try {
      const result = await mcpService.syncMcpToAgents(mcpServers, agents);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error syncing MCP to agents',
      };
    }
  });

  ipcBridge.mcpService.removeMcpFromAgents.provider(async ({ mcpServerName, agents }) => {
    try {
      const result = await mcpService.removeMcpFromAgents(mcpServerName, agents);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error removing MCP from agents',
      };
    }
  });

  ipcBridge.mcpService.createComposioToolRouterSession.provider(async ({ apiKey, userId }) => {
    const trimmedApiKey = apiKey?.trim();
    const trimmedUserId = userId?.trim() || 'agent-club';

    if (!trimmedApiKey) {
      return { success: false, msg: 'Composio API key is required' };
    }

    try {
      const response = await getPlatformServices().network.fetch(COMPOSIO_TOOL_ROUTER_SESSION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': trimmedApiKey,
        },
        body: JSON.stringify({ user_id: trimmedUserId }),
      });

      if (!response.ok) {
        const msg = await parseComposioError(response);
        return { success: false, msg: `Composio rejected the setup request: ${msg}` };
      }

      const payload = (await response.json()) as {
        session_id?: string;
        mcp?: { type?: string; url?: string };
        tool_router_tools?: string[];
      };

      const sessionId = payload.session_id;
      if (!sessionId) {
        return { success: false, msg: 'Composio response did not include a session id' };
      }

      return {
        success: true,
        data: {
          sessionId,
          mcpUrl: validateComposioMcpUrl(payload.mcp?.url),
          mcpType: 'http',
          proxyScriptPath: getBuiltinMcpScriptPath('builtin-mcp-composio-tool-router'),
          toolRouterTools: Array.isArray(payload.tool_router_tools) ? payload.tool_router_tools : [],
        },
      };
    } catch (error) {
      return {
        success: false,
        msg: errorMessage(error),
      };
    }
  });

  ipcBridge.mcpService.getPeekabooDesktopControlSetup.provider(async () => {
    try {
      return {
        success: true,
        data: {
          proxyScriptPath: getBuiltinMcpScriptPath('builtin-mcp-peekaboo'),
          packageName: PEEKABOO_PACKAGE_NAME,
          packageVersion: PEEKABOO_PACKAGE_VERSION,
        },
      };
    } catch (error) {
      return {
        success: false,
        msg: errorMessage(error),
      };
    }
  });

  // OAuth 相关 IPC 处理程序
  ipcBridge.mcpService.checkOAuthStatus.provider(async (server) => {
    try {
      const result = await mcpOAuthService.checkOAuthStatus(server);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error checking OAuth status',
      };
    }
  });

  ipcBridge.mcpService.loginMcpOAuth.provider(async ({ server, config }) => {
    try {
      const result = await mcpOAuthService.login(server, config);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error during OAuth login',
      };
    }
  });

  ipcBridge.mcpService.logoutMcpOAuth.provider(async (serverName) => {
    try {
      await mcpOAuthService.logout(serverName);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error during OAuth logout',
      };
    }
  });

  ipcBridge.mcpService.getAuthenticatedServers.provider(async () => {
    try {
      const result = await mcpOAuthService.getAuthenticatedServers();
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error getting authenticated servers',
      };
    }
  });
}
