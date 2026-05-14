import type { IMcpServer } from '@/common/config/storage';
import type {
  AgentVaultConfig,
  AgentVaultSaveRequest,
  AgentVaultState,
  OnePasswordCliStatus,
  OnePasswordSecurityConfig,
  OnePasswordSecurityPublicConfig,
  OnePasswordSecuritySaveRequest,
  SecuritySettingsState,
} from '@/common/types/security';
import { getPlatformServices } from '@/common/platform';
import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { BUILTIN_AGENT_VAULT_ID, BUILTIN_AGENT_VAULT_NAME } from '@process/resources/builtinMcp/constants';
import { ProcessConfig } from '@process/utils/initStorage';
import { getEnhancedEnv } from '@process/utils/shellEnv';
import {
  applyAgentVaultToProcessEnv,
  getAgentVaultRuntimeStateSync,
  saveAgentVaultRuntimeState,
} from './agentVaultRuntime';

const execFileAsync = promisify(execFile);

const DEFAULT_ONE_PASSWORD_CONFIG: OnePasswordSecurityConfig = {
  enabled: false,
  resolveReferences: true,
};

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

const toPublicOnePasswordConfig = (config?: OnePasswordSecurityConfig): OnePasswordSecurityPublicConfig => ({
  enabled: config?.enabled === true,
  resolveReferences: config?.resolveReferences !== false,
  account: config?.account,
  hasServiceAccountToken: Boolean(config?.serviceAccountToken?.trim()),
  updatedAt: config?.updatedAt,
});

const toAgentVaultConfig = (state: AgentVaultState): AgentVaultConfig => ({
  enabled: state.enabled,
  filePath: state.filePath,
  keyCount: state.keyCount,
  keys: state.keys,
  updatedAt: state.updatedAt,
});

const buildVaultMcpEnv = (
  vault: AgentVaultState,
  onePassword: OnePasswordSecurityConfig
): Record<string, string> => {
  const env: Record<string, string> = {
    AGENT_CLUB_VAULT_FILE: vault.filePath,
    AGENT_CLUB_VAULT_ENABLED: vault.enabled ? '1' : '0',
    AGENT_CLUB_OP_RESOLVE: onePassword.enabled && onePassword.resolveReferences !== false ? '1' : '0',
  };

  if (onePassword.enabled && onePassword.serviceAccountToken?.trim()) {
    env.OP_SERVICE_ACCOUNT_TOKEN = onePassword.serviceAccountToken.trim();
  }
  if (onePassword.enabled && onePassword.account?.trim()) {
    env.OP_ACCOUNT = onePassword.account.trim();
  }

  return env;
};

const buildVaultOriginalJson = (scriptPath: string, env: Record<string, string>): string => {
  const redactedEnv = {
    ...env,
    ...(env.OP_SERVICE_ACCOUNT_TOKEN ? { OP_SERVICE_ACCOUNT_TOKEN: '<saved in Agent Club security settings>' } : {}),
  };

  return JSON.stringify(
    {
      mcpServers: {
        [BUILTIN_AGENT_VAULT_NAME]: {
          command: 'node',
          args: [scriptPath],
          env: redactedEnv,
        },
      },
    },
    null,
    2
  );
};

class SecuritySettingsService {
  private toAgentVaultState(): AgentVaultState {
    const runtime = getAgentVaultRuntimeStateSync();
    return {
      enabled: runtime.enabled,
      content: runtime.content,
      filePath: runtime.filePath,
      keyCount: runtime.keyCount,
      keys: runtime.keys,
      updatedAt: runtime.updatedAt,
      mcpServerName: BUILTIN_AGENT_VAULT_NAME,
    };
  }

  async getOnePasswordConfig(): Promise<OnePasswordSecurityConfig> {
    const stored = await ProcessConfig.get('security.onePassword').catch((): undefined => undefined);
    return {
      ...DEFAULT_ONE_PASSWORD_CONFIG,
      ...stored,
    };
  }

  async getState(): Promise<SecuritySettingsState> {
    await this.ensureAgentVaultMcpServer();
    return {
      agentVault: this.toAgentVaultState(),
      onePassword: toPublicOnePasswordConfig(await this.getOnePasswordConfig()),
    };
  }

  async saveAgentVault(request: AgentVaultSaveRequest): Promise<SecuritySettingsState> {
    await saveAgentVaultRuntimeState({
      enabled: request.enabled,
      content: request.content,
    });
    const vaultState = applyAgentVaultToProcessEnv();
    const agentVault = this.toAgentVaultState();
    await ProcessConfig.set('security.agentVault', toAgentVaultConfig(agentVault));
    await this.ensureAgentVaultMcpServer();

    console.log(
      `[Security] Agent vault ${vaultState.enabled ? 'enabled' : 'disabled'} with ${vaultState.keyCount} key(s)`
    );

    return this.getState();
  }

  async saveOnePassword(request: OnePasswordSecuritySaveRequest): Promise<SecuritySettingsState> {
    const existing = await this.getOnePasswordConfig();
    const nextToken = request.clearServiceAccountToken
      ? undefined
      : request.serviceAccountToken?.trim()
        ? request.serviceAccountToken.trim()
        : request.keepExistingToken
          ? existing.serviceAccountToken
          : undefined;

    const next: OnePasswordSecurityConfig = {
      enabled: request.enabled,
      resolveReferences: request.resolveReferences,
      account: request.account?.trim() || undefined,
      serviceAccountToken: nextToken,
      updatedAt: Date.now(),
    };

    await ProcessConfig.set('security.onePassword', next);
    await this.ensureAgentVaultMcpServer();
    return this.getState();
  }

  async testOnePasswordCli(): Promise<OnePasswordCliStatus> {
    try {
      const { stdout } = await execFileAsync('op', ['--version'], {
        env: getEnhancedEnv(),
        timeout: 10_000,
      });

      return {
        installed: true,
        version: stdout.trim(),
      };
    } catch (error) {
      return {
        installed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async ensureAgentVaultMcpServer(): Promise<IMcpServer> {
    const vault = this.toAgentVaultState();
    const onePassword = await this.getOnePasswordConfig();
    const scriptPath = getBuiltinMcpScriptPath('builtin-mcp-agent-vault');
    const env = buildVaultMcpEnv(vault, onePassword);
    const now = Date.now();
    const currentServers = (await ProcessConfig.get('mcp.config').catch((): IMcpServer[] => [])) || [];
    const existingIdx = currentServers.findIndex(
      (server) => server.id === BUILTIN_AGENT_VAULT_ID || server.name === BUILTIN_AGENT_VAULT_NAME
    );

    const server: IMcpServer = {
      id: BUILTIN_AGENT_VAULT_ID,
      name: BUILTIN_AGENT_VAULT_NAME,
      description: 'Built-in Agent Club vault for trusted agents. Provides local .env keys and optional 1Password op:// resolution.',
      enabled: vault.enabled,
      builtin: true,
      status: 'connected',
      transport: {
        type: 'stdio',
        command: 'node',
        args: [scriptPath],
        env,
      },
      createdAt: existingIdx >= 0 ? currentServers[existingIdx].createdAt : now,
      updatedAt: now,
      originalJson: buildVaultOriginalJson(scriptPath, env),
    };

    if (existingIdx >= 0) {
      currentServers[existingIdx] = {
        ...currentServers[existingIdx],
        ...server,
      };
    } else {
      currentServers.push(server);
    }

    await ProcessConfig.set('mcp.config', currentServers);
    return server;
  }
}

export const securitySettingsService = new SecuritySettingsService();
