/**
 * Built-in stdio proxy for Composio Tool Router MCP.
 *
 * Composio exposes Tool Router sessions as Streamable HTTP MCP endpoints that
 * require an x-api-key header. Some local agent CLIs can only sync stdio MCP
 * servers or cannot preserve arbitrary HTTP headers, so this proxy presents a
 * local stdio MCP server and forwards tool list/call requests to Composio.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const SERVER_NAME = 'agent-club-composio-tool-router';

let remoteClientPromise: Promise<Client> | null = null;
let remoteClient: Client | null = null;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function getComposioUrl(): URL {
  const url = new URL(requireEnv('COMPOSIO_MCP_URL'));
  if (url.protocol !== 'https:') {
    throw new Error('COMPOSIO_MCP_URL must use https');
  }
  return url;
}

async function getRemoteClient(): Promise<Client> {
  if (remoteClient) return remoteClient;
  if (remoteClientPromise) return remoteClientPromise;

  remoteClientPromise = (async () => {
    const apiKey = requireEnv('COMPOSIO_API_KEY');
    const transport = new StreamableHTTPClientTransport(getComposioUrl(), {
      requestInit: {
        headers: {
          'x-api-key': apiKey,
        },
      },
    });

    const client = new Client(
      {
        name: SERVER_NAME,
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);
    remoteClient = client;
    return client;
  })().catch((error) => {
    remoteClientPromise = null;
    throw error;
  });

  return remoteClientPromise;
}

async function main() {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        'Use Composio Tool Router to search for tools, manage toolkit connections, and execute actions through Composio.',
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const client = await getRemoteClient();
    return client.listTools(request.params);
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const client = await getRemoteClient();
    return client.callTool(request.params);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const shutdown = async () => {
  try {
    await remoteClient?.close();
  } catch {
    // best effort
  }
};

process.on('SIGINT', () => {
  void shutdown().finally(() => process.exit(0));
});
process.on('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0));
});

main().catch((error) => {
  console.error(`[${SERVER_NAME}] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
