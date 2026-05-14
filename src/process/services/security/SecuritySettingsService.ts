import type { IMcpServer } from '@/common/config/storage';
import type {
  AgentVaultConfig,
  AgentVaultSaveRequest,
  AgentVaultState,
  OnePasswordCliInstallResult,
  OnePasswordCliStatus,
  OnePasswordConnectionStatus,
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
  ensureAgentVaultFileExists,
  getAgentVaultRuntimeStateSync,
  saveAgentVaultRuntimeState,
} from './agentVaultRuntime';

const execFileAsync = promisify(execFile);
const ONE_PASSWORD_CLI_DOCS_URL = 'https://www.1password.dev/cli/get-started';
const ONE_PASSWORD_INSTALL_COMMAND = 'brew install 1password-cli';

const DEFAULT_ONE_PASSWORD_CONFIG: OnePasswordSecurityConfig = {
  enabled: false,
  resolveReferences: true,
};

const trimCommandOutput = (value: string, maxLength = 4000): string => {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
};

const commandErrorMessage = (error: unknown): string => {
  const commandError = error as { message?: string; stderr?: string; stdout?: string };
  return trimCommandOutput(
    [commandError.stderr, commandError.stdout, commandError.message].filter(Boolean).join('\n')
  );
};

const parseJsonArrayLength = (value: string): number | undefined => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.length : undefined;
  } catch {
    return undefined;
  }
};

const withOnePasswordEnv = (
  env: NodeJS.ProcessEnv,
  config: OnePasswordSecurityConfig
): NodeJS.ProcessEnv => ({
  ...env,
  ...(config.enabled && config.serviceAccountToken?.trim()
    ? { OP_SERVICE_ACCOUNT_TOKEN: config.serviceAccountToken.trim() }
    : {}),
  ...(config.enabled && config.account?.trim() ? { OP_ACCOUNT: config.account.trim() } : {}),
});

const findCommandPath = async (command: string): Promise<string | undefined> => {
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which';

  try {
    const { stdout } = await execFileAsync(lookupCommand, [command], {
      env: getEnhancedEnv(),
      timeout: 10_000,
    });

    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
  } catch {
    return undefined;
  }
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

  async prepareAgentVaultFile(): Promise<SecuritySettingsState> {
    await ensureAgentVaultFileExists();
    return this.getState();
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
        path: await findCommandPath('op'),
      };
    } catch (error) {
      return {
        installed: false,
        error: commandErrorMessage(error),
      };
    }
  }

  async installOnePasswordCli(): Promise<OnePasswordCliInstallResult> {
    const existing = await this.testOnePasswordCli();
    if (existing.installed) {
      return {
        ...existing,
        docsUrl: ONE_PASSWORD_CLI_DOCS_URL,
        installStarted: false,
        method: 'already-installed',
      };
    }

    if (process.platform !== 'darwin') {
      return {
        installed: false,
        docsUrl: ONE_PASSWORD_CLI_DOCS_URL,
        installStarted: false,
        method: 'manual',
        error: 'Automatic 1Password CLI install is currently available on macOS. Open the setup guide for this platform.',
      };
    }

    const brewPath = await findCommandPath('brew');
    if (!brewPath) {
      return {
        installed: false,
        docsUrl: ONE_PASSWORD_CLI_DOCS_URL,
        installStarted: false,
        method: 'manual',
        error: 'Homebrew was not found. Install Homebrew or use the 1Password setup guide.',
      };
    }

    try {
      const { stdout, stderr } = await execFileAsync('brew', ['install', '1password-cli'], {
        env: getEnhancedEnv(),
        maxBuffer: 5 * 1024 * 1024,
        timeout: 5 * 60_000,
      });
      const installed = await this.testOnePasswordCli();

      return {
        ...installed,
        docsUrl: ONE_PASSWORD_CLI_DOCS_URL,
        installStarted: true,
        method: 'homebrew',
        command: ONE_PASSWORD_INSTALL_COMMAND,
        output: trimCommandOutput([stdout, stderr].filter(Boolean).join('\n')),
      };
    } catch (error) {
      const installed = await this.testOnePasswordCli();
      return {
        ...installed,
        docsUrl: ONE_PASSWORD_CLI_DOCS_URL,
        installStarted: true,
        method: 'homebrew',
        command: ONE_PASSWORD_INSTALL_COMMAND,
        error: commandErrorMessage(error),
      };
    }
  }

  async testOnePasswordConnection(): Promise<OnePasswordConnectionStatus> {
    const cli = await this.testOnePasswordCli();
    if (!cli.installed) {
      return {
        ...cli,
        connected: false,
      };
    }

    const onePassword = await this.getOnePasswordConfig();
    const env = withOnePasswordEnv(getEnhancedEnv(), onePassword);

    try {
      const { stdout } = await execFileAsync('op', ['vault', 'list', '--format=json'], {
        env,
        maxBuffer: 1024 * 1024,
        timeout: 30_000,
      });
      const vaultCount = parseJsonArrayLength(stdout);

      return {
        ...cli,
        connected: true,
        vaultCount,
        details:
          vaultCount === undefined
            ? '1Password CLI connected.'
            : `1Password CLI can reach ${vaultCount} vault${vaultCount === 1 ? '' : 's'}.`,
      };
    } catch (vaultError) {
      try {
        const { stdout } = await execFileAsync('op', ['account', 'list', '--format=json'], {
          env,
          maxBuffer: 1024 * 1024,
          timeout: 30_000,
        });
        const accountCount = parseJsonArrayLength(stdout);

        return {
          ...cli,
          connected: accountCount !== undefined && accountCount > 0,
          accountCount,
          details:
            accountCount === undefined
              ? '1Password account command responded.'
              : `1Password CLI can see ${accountCount} account${accountCount === 1 ? '' : 's'}.`,
        };
      } catch {
        return {
          ...cli,
          connected: false,
          error: commandErrorMessage(vaultError),
        };
      }
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
