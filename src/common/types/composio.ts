export interface ComposioToolRouterSetupRequest {
  apiKey: string;
  userId: string;
}

export interface ComposioToolRouterSetupResult {
  sessionId: string;
  mcpUrl: string;
  mcpType: 'http';
  proxyScriptPath: string;
  toolRouterTools: string[];
}
