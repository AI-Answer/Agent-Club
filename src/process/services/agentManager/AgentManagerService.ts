import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { randomBytes } from 'crypto';
import { app } from 'electron';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { ipcBridge } from '@/common';
import {
  AGENT_MANAGER_LOCAL_CODE,
  AGENT_MANAGER_LOCAL_EMAIL,
  AGENT_MANAGER_NAME,
  AGENT_MANAGER_WORKSPACE_SLUG,
} from '@/common/config/appBrand';
import type { AgentManagerStatus } from '@/common/types/agentManager';

const DEFAULT_FRONTEND_PORT = '3330';
const DEFAULT_BACKEND_PORT = '18330';
const DEFAULT_POSTGRES_PORT = '55432';
const POSTGRES_PASSWORD = 'multica';
const AGENT_MANAGER_DAEMON_PROFILE = 'agent-club';
const AGENT_MANAGER_DAEMON_ID = 'agent-club-local-runtime';
const AGENT_MANAGER_DAEMON_DEVICE_NAME = 'Agent Club';
const AGENT_MANAGER_DAEMON_HEALTH_PORT = 20509;

const HOMEBREW_BIN_PATHS = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
  '/opt/homebrew/opt/postgresql@17/bin',
  '/usr/local/opt/postgresql@17/bin',
];

type CommandResult = {
  stdout: string;
  stderr: string;
};

export class AgentManagerService {
  private processes = new Set<ChildProcess>();
  private startPromise: Promise<AgentManagerStatus> | null = null;
  private status: AgentManagerStatus = this.createStatus('idle', 'Agent-Manager is idle');

  getStatus(): AgentManagerStatus {
    return this.status;
  }

  async start(): Promise<AgentManagerStatus> {
    if (process.env.AGENT_MANAGER_AUTOSTART === '0') {
      this.updateStatus('disabled', 'Agent-Manager autostart is disabled');
      return this.status;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    if (this.status.state === 'ready') {
      return this.status;
    }

    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = null;
    });

    return this.startPromise;
  }

  async restart(): Promise<AgentManagerStatus> {
    await this.stop();
    return this.start();
  }

  async stop(): Promise<void> {
    if (this.processes.size === 0) {
      if (this.status.state !== 'idle') {
        this.updateStatus('idle', 'Agent-Manager is stopped');
      }
      return;
    }

    this.updateStatus('stopping', 'Stopping Agent-Manager');
    const processes = Array.from(this.processes);
    this.processes.clear();

    await Promise.all(
      processes.map(
        (child) =>
          new Promise<void>((resolve) => {
            if (child.killed || child.exitCode !== null) {
              resolve();
              return;
            }

            const timeout = setTimeout(() => {
              this.killProcessTree(child, 'SIGKILL');
              resolve();
            }, 5000);

            child.once('exit', () => {
              clearTimeout(timeout);
              resolve();
            });

            try {
              this.killProcessTree(child, 'SIGTERM');
            } catch {
              clearTimeout(timeout);
              resolve();
            }
          })
      )
    );

    this.updateStatus('idle', 'Agent-Manager is stopped');
  }

  private async startInternal(): Promise<AgentManagerStatus> {
    this.updateStatus('starting', 'Preparing Agent-Manager');

    try {
      const repoDir = this.resolveRepoDir();
      if (!fs.existsSync(repoDir)) {
        throw new Error(`Multica checkout not found at ${repoDir}`);
      }

      const runtimeDir = path.join(repoDir, '.agent-club');
      fs.mkdirSync(runtimeDir, { recursive: true });
      fs.mkdirSync(path.join(runtimeDir, 'uploads'), { recursive: true });

      const env = this.buildEnv(repoDir, runtimeDir);
      await this.ensureDependencies(repoDir, env);
      await this.ensurePostgres(repoDir, runtimeDir, env);

      this.updateStatus('starting', 'Running Agent-Manager migrations');
      await this.runCommand('go', ['run', './cmd/migrate', 'up'], path.join(repoDir, 'server'), env, 'migrate', 120000);
      await this.seedLocalWorkspace(repoDir, env);

      const backendHealthUrl = `${env.NEXT_PUBLIC_API_URL}/health`;
      if (await this.isHttpAvailable(backendHealthUrl, 1000)) {
        console.log('[AgentManager] reusing existing Agent-Manager backend');
      } else {
        this.updateStatus('starting', 'Starting Agent-Manager backend');
        this.spawnManaged('go', ['run', './cmd/server'], path.join(repoDir, 'server'), env, 'backend');
      }
      await this.waitForHttp(backendHealthUrl, 90000);

      await this.ensureLocalDaemonProfile(repoDir, env);
      await this.stopExistingLocalDaemon();
      this.updateStatus('starting', 'Starting Agent-Manager local runtime');
      this.spawnManaged(
        'go',
        [
          'run',
          './cmd/multica',
          '--profile',
          AGENT_MANAGER_DAEMON_PROFILE,
          'daemon',
          'start',
          '--foreground',
          '--daemon-id',
          AGENT_MANAGER_DAEMON_ID,
          '--device-name',
          AGENT_MANAGER_DAEMON_DEVICE_NAME,
          '--runtime-name',
          'Agent Club Runtime',
          '--poll-interval',
          '5s',
          '--heartbeat-interval',
          '15s',
          '--max-concurrent-tasks',
          '6',
        ],
        path.join(repoDir, 'server'),
        this.buildDaemonEnv(env, runtimeDir),
        'daemon'
      );
      await this.waitForLocalDaemonReady(45000);
      await this.syncLocalRuntimeAgents(repoDir, env);

      const frontendUrl = this.getFrontendUrl();
      const frontendPort = Number(env.FRONTEND_PORT || DEFAULT_FRONTEND_PORT);
      if (await this.isPortOpen('127.0.0.1', frontendPort, 500)) {
        if (await this.tryWaitForHttp(frontendUrl, 15000)) {
          console.log('[AgentManager] reusing existing Agent-Manager web UI');
        } else {
          throw new Error(`Agent-Manager web port ${frontendPort} is in use but ${frontendUrl} is not responding`);
        }
      } else {
        this.updateStatus('starting', 'Starting Agent-Manager web UI');
        this.spawnManaged('pnpm', ['dev:web'], repoDir, env, 'web');
      }
      await this.waitForHttp(frontendUrl, 120000);

      this.updateStatus('ready', 'Agent-Manager is running');
      void this.prewarmFrontendRoutes();
      return this.status;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updateStatus('error', 'Agent-Manager failed to start', message);
      return this.status;
    }
  }

  private resolveRepoDir(): string {
    const override = process.env.AGENT_MANAGER_DIR;
    if (override) {
      return override;
    }

    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'agent-manager');
    }

    return path.join(process.cwd(), 'apps', 'agent-manager');
  }

  private buildEnv(repoDir: string, runtimeDir: string): NodeJS.ProcessEnv {
    const frontendPort = process.env.AGENT_MANAGER_FRONTEND_PORT || DEFAULT_FRONTEND_PORT;
    const backendPort = process.env.AGENT_MANAGER_BACKEND_PORT || DEFAULT_BACKEND_PORT;
    const postgresPort = process.env.AGENT_MANAGER_POSTGRES_PORT || DEFAULT_POSTGRES_PORT;
    const frontendUrl = `http://localhost:${frontendPort}`;
    const backendUrl = `http://localhost:${backendPort}`;
    const wsUrl = `ws://localhost:${backendPort}/ws`;
    const pathValue = this.withToolPaths(process.env.PATH || '');

    return {
      ...process.env,
      PATH: pathValue,
      POSTGRES_DB: 'multica',
      POSTGRES_USER: 'multica',
      POSTGRES_PASSWORD,
      POSTGRES_PORT: postgresPort,
      DATABASE_URL: `postgres://multica:${POSTGRES_PASSWORD}@127.0.0.1:${postgresPort}/multica?sslmode=disable`,
      PORT: backendPort,
      FRONTEND_PORT: frontendPort,
      FRONTEND_ORIGIN: frontendUrl,
      MULTICA_APP_URL: frontendUrl,
      MULTICA_SERVER_URL: wsUrl,
      NEXT_PUBLIC_API_URL: backendUrl,
      NEXT_PUBLIC_WS_URL: wsUrl,
      REMOTE_API_URL: backendUrl,
      GOOGLE_REDIRECT_URI: `${frontendUrl}/auth/callback`,
      ALLOWED_ORIGINS: `${frontendUrl},http://localhost:5173,http://127.0.0.1:5173`,
      CORS_ALLOWED_ORIGINS: `${frontendUrl},http://localhost:5173,http://127.0.0.1:5173`,
      LOCAL_UPLOAD_DIR: path.join(runtimeDir, 'uploads'),
      LOCAL_UPLOAD_BASE_URL: backendUrl,
      JWT_SECRET: this.getJwtSecret(runtimeDir),
      MULTICA_DEV_VERIFICATION_CODE: AGENT_MANAGER_LOCAL_CODE,
      AGENT_CLUB_AUTO_LOGIN: '1',
      AGENT_CLUB_AUTO_LOGIN_EMAIL: AGENT_MANAGER_LOCAL_EMAIL,
      ALLOW_SIGNUP: 'true',
      APP_ENV: '',
      RESEND_API_KEY: '',
      MULTICA_CODEX_PATH: process.env.MULTICA_CODEX_PATH || 'codex',
      MULTICA_CODEX_WORKDIR: repoDir,
    };
  }

  private buildDaemonEnv(env: NodeJS.ProcessEnv, runtimeDir: string): NodeJS.ProcessEnv {
    return {
      ...env,
      MULTICA_SERVER_URL: env.NEXT_PUBLIC_API_URL || this.getBackendUrl(),
      MULTICA_DAEMON_ID: AGENT_MANAGER_DAEMON_ID,
      MULTICA_DAEMON_DEVICE_NAME: AGENT_MANAGER_DAEMON_DEVICE_NAME,
      MULTICA_AGENT_RUNTIME_NAME: 'Agent Club Runtime',
      MULTICA_DAEMON_POLL_INTERVAL: '5s',
      MULTICA_DAEMON_HEARTBEAT_INTERVAL: '15s',
      MULTICA_WORKSPACES_ROOT: path.join(runtimeDir, 'workspaces'),
      MULTICA_LAUNCHED_BY: 'desktop',
      MULTICA_CODEX_PATH: env.MULTICA_CODEX_PATH || 'codex',
    };
  }

  private async ensureLocalDaemonProfile(repoDir: string, env: NodeJS.ProcessEnv): Promise<void> {
    const workspaceId = await this.getLocalWorkspaceId(repoDir, env);
    const token = await this.createLocalSessionToken(env);
    const profileDir = path.join(os.homedir(), '.multica', 'profiles', AGENT_MANAGER_DAEMON_PROFILE);
    const configPath = path.join(profileDir, 'config.json');

    fs.mkdirSync(profileDir, { recursive: true });
    const config = {
      server_url: env.NEXT_PUBLIC_API_URL || this.getBackendUrl(),
      app_url: this.getFrontendUrl(),
      workspace_id: workspaceId,
      token,
    };

    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(configPath, 0o600);
  }

  private async getLocalWorkspaceId(repoDir: string, env: NodeJS.ProcessEnv): Promise<string> {
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(`${AGENT_MANAGER_NAME} database URL is not configured`);
    }

    const psql = this.getPostgresCommand('psql');
    const result = await this.runCommand(
      psql,
      [
        '-v',
        'ON_ERROR_STOP=1',
        databaseUrl,
        '-tAc',
        `SELECT id FROM workspace WHERE slug = '${AGENT_MANAGER_WORKSPACE_SLUG}' LIMIT 1`,
      ],
      repoDir,
      env,
      `${AGENT_MANAGER_NAME} local workspace lookup`,
      30000
    );
    const workspaceId = result.stdout.trim().split(/\s+/)[0];
    if (!workspaceId) {
      throw new Error(`${AGENT_MANAGER_NAME} local workspace was not created`);
    }
    return workspaceId;
  }

  private async createLocalSessionToken(env: NodeJS.ProcessEnv): Promise<string> {
    const response = await fetch(`${env.NEXT_PUBLIC_API_URL || this.getBackendUrl()}/auth/agent-club`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: AGENT_MANAGER_LOCAL_EMAIL }),
    });

    if (!response.ok) {
      throw new Error(`Agent-Manager local login returned ${response.status}`);
    }

    const payload = (await response.json()) as { token?: string };
    if (!payload.token) {
      throw new Error('Agent-Manager local login did not return a token');
    }
    return payload.token;
  }

  private async stopExistingLocalDaemon(): Promise<void> {
    const healthUrl = `http://127.0.0.1:${AGENT_MANAGER_DAEMON_HEALTH_PORT}/health`;
    const shutdownUrl = `http://127.0.0.1:${AGENT_MANAGER_DAEMON_HEALTH_PORT}/shutdown`;

    try {
      const response = await fetch(healthUrl, { method: 'GET' });
      if (!response.ok) {
        return;
      }

      const health = (await response.json()) as { status?: string; daemon_id?: string };
      if (health.status !== 'running' || health.daemon_id !== AGENT_MANAGER_DAEMON_ID) {
        return;
      }

      await this.fetchWithTimeout(shutdownUrl, 5000, 'POST');
      await this.waitForPortClosed('127.0.0.1', AGENT_MANAGER_DAEMON_HEALTH_PORT, 10000);
    } catch {
      // No prior Agent-Manager daemon is running.
    }
  }

  private async waitForLocalDaemonReady(timeoutMs: number): Promise<void> {
    const startedAt = Date.now();
    const healthUrl = `http://127.0.0.1:${AGENT_MANAGER_DAEMON_HEALTH_PORT}/health`;

    while (Date.now() - startedAt < timeoutMs) {
      try {
        const response = await fetch(healthUrl, { method: 'GET' });
        if (response.ok) {
          const health = (await response.json()) as { status?: string; daemon_id?: string };
          if (health.status === 'running' && health.daemon_id === AGENT_MANAGER_DAEMON_ID) {
            return;
          }
        }
      } catch {
        // Daemon is still booting.
      }
      await this.delay(1000);
    }

    throw new Error('Timed out waiting for Agent-Manager local runtime');
  }

  private async syncLocalRuntimeAgents(repoDir: string, env: NodeJS.ProcessEnv): Promise<void> {
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(`${AGENT_MANAGER_NAME} database URL is not configured`);
    }

    const psql = this.getPostgresCommand('psql');
    await this.runCommand(
      psql,
      ['-v', 'ON_ERROR_STOP=1', databaseUrl],
      repoDir,
      env,
      `${AGENT_MANAGER_NAME} runtime agent sync`,
      60000,
      this.getLocalRuntimeAgentSyncSql()
    );
  }

  private getLocalRuntimeAgentSyncSql(): string {
    return `
WITH workspace_selected AS (
  SELECT id FROM workspace WHERE slug = '${AGENT_MANAGER_WORKSPACE_SLUG}' LIMIT 1
),
app_user AS (
  SELECT id FROM "user" WHERE email = '${AGENT_MANAGER_LOCAL_EMAIL}' LIMIT 1
),
runtime_seed AS (
  SELECT
    r.workspace_id,
    r.id AS runtime_id,
    r.provider,
    CASE r.provider
      WHEN 'codex' THEN 'Codex Builder'
      WHEN 'claude' THEN 'Claude Assistant'
      WHEN 'openclaw' THEN 'OpenClaw Operator'
      WHEN 'gemini' THEN 'Gemini Analyst'
      WHEN 'opencode' THEN 'OpenCode Builder'
      ELSE initcap(r.provider) || ' Agent'
    END AS name,
    CASE r.provider
      WHEN 'codex' THEN 'Runs implementation tasks through the Codex runtime bundled with Agent Club.'
      WHEN 'claude' THEN 'Runs planning and implementation tasks through the Claude runtime detected by Agent Club.'
      WHEN 'openclaw' THEN 'Runs OpenClaw workflows from the local Agent Club runtime.'
      WHEN 'gemini' THEN 'Runs research and analysis tasks through the Gemini runtime detected by Agent Club.'
      WHEN 'opencode' THEN 'Runs coding tasks through the OpenCode runtime detected by Agent Club.'
      ELSE 'Runs tasks through the local Agent Club runtime provider.'
    END AS description,
    CASE r.provider
      WHEN 'codex' THEN 'Keep edits scoped, run focused checks, and report concrete results back to Agent Club.'
      WHEN 'claude' THEN 'Plan clearly, execute carefully, and keep Agent Club tasks updated with concise progress notes.'
      WHEN 'openclaw' THEN 'Operate local OpenClaw workflows and keep task state synchronized with Agent Club.'
      WHEN 'gemini' THEN 'Gather context, compare options, and summarize findings for Agent Club tasks.'
      ELSE 'Use the local runtime to complete Agent Club tasks and keep task state current.'
    END AS instructions,
    CASE r.provider
      WHEN 'codex' THEN 'gpt-5-codex'
      ELSE NULL
    END AS model
  FROM agent_runtime r
  JOIN workspace_selected w ON w.id = r.workspace_id
  WHERE r.daemon_id = '${AGENT_MANAGER_DAEMON_ID}'
    AND r.status = 'online'
)
INSERT INTO agent (
  workspace_id,
  name,
  description,
  avatar_url,
  runtime_mode,
  runtime_config,
  runtime_id,
  visibility,
  status,
  max_concurrent_tasks,
  owner_id,
  instructions,
  custom_env,
  custom_args,
  mcp_config,
  model
)
SELECT
  runtime_seed.workspace_id,
  runtime_seed.name,
  runtime_seed.description,
  NULL,
  'local',
  jsonb_build_object('managedBy', 'Agent Club', 'source', 'aionui-runtime', 'provider', runtime_seed.provider),
  runtime_seed.runtime_id,
  'workspace',
  'idle',
  3,
  app_user.id,
  runtime_seed.instructions,
  '{}'::jsonb,
  '[]'::jsonb,
  NULL::jsonb,
  runtime_seed.model
FROM runtime_seed
CROSS JOIN app_user
ON CONFLICT (workspace_id, name) DO UPDATE
  SET description = EXCLUDED.description,
      runtime_config = EXCLUDED.runtime_config,
      runtime_id = EXCLUDED.runtime_id,
      visibility = 'workspace',
      status = 'idle',
      max_concurrent_tasks = EXCLUDED.max_concurrent_tasks,
      owner_id = EXCLUDED.owner_id,
      instructions = EXCLUDED.instructions,
      custom_env = EXCLUDED.custom_env,
      custom_args = EXCLUDED.custom_args,
      mcp_config = EXCLUDED.mcp_config,
      model = EXCLUDED.model,
      archived_at = NULL,
      archived_by = NULL,
      updated_at = NOW();
`;
  }

  private getJwtSecret(runtimeDir: string): string {
    const secretPath = path.join(runtimeDir, 'jwt-secret');
    if (fs.existsSync(secretPath)) {
      return fs.readFileSync(secretPath, 'utf-8').trim();
    }

    const secret = randomBytes(32).toString('hex');
    fs.writeFileSync(secretPath, secret, { mode: 0o600 });
    return secret;
  }

  private withToolPaths(pathValue: string): string {
    const existing = new Set(pathValue.split(path.delimiter).filter(Boolean));
    const additions = HOMEBREW_BIN_PATHS.filter((item) => fs.existsSync(item) && !existing.has(item));
    return [...additions, pathValue].filter(Boolean).join(path.delimiter);
  }

  private async ensureDependencies(repoDir: string, env: NodeJS.ProcessEnv): Promise<void> {
    this.assertCommand('pnpm', ['--version'], 'pnpm is required to start Agent-Manager.');
    this.assertCommand('go', ['version'], 'Go is required to start the Agent-Manager backend.');

    if (fs.existsSync(path.join(repoDir, 'node_modules', '.modules.yaml'))) {
      return;
    }

    this.updateStatus('starting', 'Installing Agent-Manager dependencies');
    await this.runCommand('pnpm', ['install'], repoDir, env, 'pnpm install', 240000);
  }

  private async ensurePostgres(repoDir: string, runtimeDir: string, env: NodeJS.ProcessEnv): Promise<void> {
    const postgresPort = Number(env.POSTGRES_PORT || DEFAULT_POSTGRES_PORT);
    const pgBin = this.getPostgresCommand('postgres');
    const initdb = this.getPostgresCommand('initdb');
    const psql = this.getPostgresCommand('psql');
    const createdb = this.getPostgresCommand('createdb');
    const pgDataDir = path.join(runtimeDir, 'postgres-data');
    const passwordPath = path.join(runtimeDir, 'postgres-password');

    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(passwordPath, `${POSTGRES_PASSWORD}\n`, { mode: 0o600 });

    if (!fs.existsSync(path.join(pgDataDir, 'PG_VERSION'))) {
      this.updateStatus('starting', 'Initializing Agent-Manager database');
      await this.runCommand(
        initdb,
        ['-D', pgDataDir, '-U', 'multica', '--pwfile', passwordPath, '--auth-local=trust', '--auth-host=md5'],
        repoDir,
        env,
        'postgres init',
        120000
      );
    }

    if (!(await this.isPortOpen('127.0.0.1', postgresPort, 500))) {
      this.updateStatus('starting', 'Starting Agent-Manager database');
      this.spawnManaged(
        pgBin,
        ['-D', pgDataDir, '-h', '127.0.0.1', '-p', String(postgresPort)],
        repoDir,
        env,
        'postgres'
      );
      await this.waitForPort('127.0.0.1', postgresPort, 60000);
    }

    const dbCheck = await this.runCommand(
      psql,
      [
        '-h',
        '127.0.0.1',
        '-p',
        String(postgresPort),
        '-U',
        'multica',
        '-d',
        'postgres',
        '-tAc',
        "SELECT 1 FROM pg_database WHERE datname='multica'",
      ],
      repoDir,
      { ...env, PGPASSWORD: POSTGRES_PASSWORD },
      'postgres check',
      30000
    );

    if (!dbCheck.stdout.trim().includes('1')) {
      await this.runCommand(
        createdb,
        ['-h', '127.0.0.1', '-p', String(postgresPort), '-U', 'multica', 'multica'],
        repoDir,
        { ...env, PGPASSWORD: POSTGRES_PASSWORD },
        'postgres createdb',
        30000
      );
    }
  }

  private assertCommand(command: string, args: string[], message: string): void {
    const result = spawnSync(command, args, {
      env: { ...process.env, PATH: this.withToolPaths(process.env.PATH || '') },
    });
    if (result.error || result.status !== 0) {
      throw new Error(message);
    }
  }

  private getPostgresCommand(command: string): string {
    const candidates = [
      command,
      path.join('/opt/homebrew/opt/postgresql@17/bin', command),
      path.join('/usr/local/opt/postgresql@17/bin', command),
    ];

    for (const candidate of candidates) {
      const result = spawnSync(candidate, ['--version'], {
        env: { ...process.env, PATH: this.withToolPaths(process.env.PATH || '') },
      });
      if (!result.error && result.status === 0) {
        return candidate;
      }
    }

    throw new Error(`PostgreSQL command not found: ${command}`);
  }

  private killProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
    if (child.killed || child.exitCode !== null) {
      return;
    }

    if (process.platform !== 'win32' && child.pid) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {
        // Fall back to the root process if the process group is already gone.
      }
    }

    child.kill(signal);
  }

  private spawnManaged(
    command: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    label: string
  ): ChildProcess {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    this.processes.add(child);

    child.stdout?.on('data', (chunk: Buffer) => this.logChild(label, chunk));
    child.stderr?.on('data', (chunk: Buffer) => this.logChild(label, chunk));
    child.on('exit', (code, signal) => {
      this.processes.delete(child);
      console.log(`[AgentManager:${label}] exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
      if (this.status.state === 'ready' && label !== 'postgres') {
        void this.handleManagedProcessExitWhileReady(label, code, signal);
      }
    });

    child.on('error', (error) => {
      this.processes.delete(child);
      this.updateStatus('error', `Failed to start Agent-Manager ${label}`, error.message);
    });

    return child;
  }

  private async seedLocalWorkspace(repoDir: string, env: NodeJS.ProcessEnv): Promise<void> {
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(`${AGENT_MANAGER_NAME} database URL is not configured`);
    }

    this.updateStatus('starting', 'Preparing local Agent-Manager workspace');

    const psql = this.getPostgresCommand('psql');
    await this.runCommand(
      psql,
      ['-v', 'ON_ERROR_STOP=1', databaseUrl],
      repoDir,
      env,
      `${AGENT_MANAGER_NAME} local workspace seed`,
      60000,
      this.getLocalWorkspaceSeedSql()
    );
  }

  private getLocalWorkspaceSeedSql(): string {
    return `
WITH app_user AS (
  INSERT INTO "user" (name, email, avatar_url, onboarded_at, starter_content_state, language)
  VALUES ('Agent Club', '${AGENT_MANAGER_LOCAL_EMAIL}', NULL, NOW(), 'imported', 'en')
  ON CONFLICT (email) DO UPDATE
    SET name = EXCLUDED.name,
        onboarded_at = COALESCE("user".onboarded_at, NOW()),
        starter_content_state = COALESCE("user".starter_content_state, 'imported'),
        updated_at = NOW()
  RETURNING id
),
workspace_upsert AS (
  INSERT INTO workspace (name, slug, description, context, settings, repos, issue_prefix, issue_counter)
  VALUES (
    'Agent Club',
    '${AGENT_MANAGER_WORKSPACE_SLUG}',
    'Local Agent-Manager workspace bundled with Agent Club.',
    'Agent Club is the local operating workspace for bundled applications, agents, and task management.',
    '{"agentClub":true,"managedBy":"Agent Club"}'::jsonb,
    '[]'::jsonb,
    'AC',
    20
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        context = EXCLUDED.context,
        settings = EXCLUDED.settings,
        issue_prefix = EXCLUDED.issue_prefix,
        issue_counter = GREATEST(workspace.issue_counter, EXCLUDED.issue_counter),
        updated_at = NOW()
  RETURNING id
),
member_upsert AS (
  INSERT INTO member (workspace_id, user_id, role)
  SELECT workspace_upsert.id, app_user.id, 'owner'
  FROM workspace_upsert, app_user
  ON CONFLICT (workspace_id, user_id) DO UPDATE
    SET role = 'owner'
  RETURNING id, workspace_id, user_id
),
runtime_upsert AS (
  INSERT INTO agent_runtime (
    workspace_id,
    daemon_id,
    name,
    runtime_mode,
    provider,
    status,
    device_info,
    metadata,
    last_seen_at,
    owner_id,
    timezone,
    visibility
  )
  SELECT
    workspace_upsert.id,
    'agent-club-local-runtime',
    'Agent Club Local Runtime',
    'local',
    'codex',
    'online',
    'Agent Club bundled local runtime',
    '{"managedBy":"Agent Club"}'::jsonb,
    NOW(),
    app_user.id,
    'America/New_York',
    'public'
  FROM workspace_upsert, app_user
  ON CONFLICT (workspace_id, daemon_id, provider) DO UPDATE
    SET name = EXCLUDED.name,
        status = 'online',
        device_info = EXCLUDED.device_info,
        metadata = EXCLUDED.metadata,
        last_seen_at = NOW(),
        owner_id = EXCLUDED.owner_id,
        timezone = EXCLUDED.timezone,
        visibility = EXCLUDED.visibility,
        updated_at = NOW()
  RETURNING id, workspace_id
),
seed_agents(name, description, instructions, model, max_tasks) AS (
  VALUES
    ('Coordinator', 'Plans work and routes tasks across Agent Club.', 'Keep Agent Club work organized, break goals into clear tasks, and route execution to the right agent.', 'gpt-5-codex', 4),
    ('Builder', 'Implements application and automation changes.', 'Focus on concrete implementation work, test changes, and keep edits scoped to the active Agent Club workspace.', 'gpt-5-codex', 3),
    ('Researcher', 'Collects context for tools, integrations, and workflows.', 'Gather precise context, summarize tradeoffs, and attach useful references to tasks before execution begins.', 'gpt-5', 2)
),
agent_upsert AS (
  INSERT INTO agent (
    workspace_id,
    name,
    description,
    avatar_url,
    runtime_mode,
    runtime_config,
    runtime_id,
    visibility,
    status,
    max_concurrent_tasks,
    owner_id,
    instructions,
    custom_env,
    custom_args,
    mcp_config,
    model
  )
  SELECT
    runtime_upsert.workspace_id,
    seed_agents.name,
    seed_agents.description,
    NULL,
    'local',
    '{"managedBy":"Agent Club"}'::jsonb,
    runtime_upsert.id,
    'workspace',
    'idle',
    seed_agents.max_tasks,
    app_user.id,
    seed_agents.instructions,
    '{}'::jsonb,
    '[]'::jsonb,
    NULL::jsonb,
    seed_agents.model
  FROM seed_agents, runtime_upsert, app_user
  ON CONFLICT (workspace_id, name) DO UPDATE
    SET description = EXCLUDED.description,
        runtime_config = EXCLUDED.runtime_config,
        runtime_id = EXCLUDED.runtime_id,
        visibility = 'workspace',
        status = 'idle',
        max_concurrent_tasks = EXCLUDED.max_concurrent_tasks,
        owner_id = EXCLUDED.owner_id,
        instructions = EXCLUDED.instructions,
        custom_env = EXCLUDED.custom_env,
        custom_args = EXCLUDED.custom_args,
        mcp_config = EXCLUDED.mcp_config,
        model = EXCLUDED.model,
        archived_at = NULL,
        archived_by = NULL,
        updated_at = NOW()
  RETURNING id, name, workspace_id
),
project_existing AS (
  SELECT project.id
  FROM project, workspace_upsert
  WHERE project.workspace_id = workspace_upsert.id
    AND project.title = 'Agent Club Operating Board'
  LIMIT 1
),
project_created AS (
  INSERT INTO project (workspace_id, title, description, icon, status, lead_type, lead_id, priority)
  SELECT
    workspace_upsert.id,
    'Agent Club Operating Board',
    'Default task board for Agent Club apps, agents, and bundled workflows.',
    NULL,
    'in_progress',
    'member',
    member_upsert.id,
    'high'
  FROM workspace_upsert, member_upsert
  WHERE NOT EXISTS (SELECT 1 FROM project_existing)
  RETURNING id
),
project_selected AS (
  SELECT id FROM project_created
  UNION ALL
  SELECT id FROM project_existing
  LIMIT 1
),
issue_seed(title, description, status, priority, agent_name, number, position) AS (
  VALUES
    ('Review bundled applications', 'Keep track of which local tools are bundled into Agent Club and whether each one starts correctly.', 'todo', 'medium', 'Coordinator', 1, 1),
    ('Maintain Agent-Manager workspace', 'Use this board for task management, agents, and application planning inside the bundled Multica instance.', 'in_progress', 'high', 'Builder', 2, 2),
    ('Document next integrations', 'Capture candidates for the next apps or automations that should be added to Agent Club.', 'todo', 'low', 'Researcher', 3, 3)
)
INSERT INTO issue (
  workspace_id,
  title,
  description,
  status,
  priority,
  assignee_type,
  assignee_id,
  creator_type,
  creator_id,
  acceptance_criteria,
  context_refs,
  position,
  number,
  project_id
)
SELECT
  workspace_upsert.id,
  issue_seed.title,
  issue_seed.description,
  issue_seed.status,
  issue_seed.priority,
  'agent',
  agent_upsert.id,
  'member',
  member_upsert.id,
  '[]'::jsonb,
  '[]'::jsonb,
  issue_seed.position,
  issue_seed.number,
  project_selected.id
FROM issue_seed
JOIN agent_upsert ON agent_upsert.name = issue_seed.agent_name
CROSS JOIN workspace_upsert
CROSS JOIN member_upsert
CROSS JOIN project_selected
ON CONFLICT (workspace_id, number) DO UPDATE
  SET title = EXCLUDED.title,
      description = EXCLUDED.description,
      status = EXCLUDED.status,
      priority = EXCLUDED.priority,
      assignee_type = EXCLUDED.assignee_type,
      assignee_id = EXCLUDED.assignee_id,
      acceptance_criteria = EXCLUDED.acceptance_criteria,
      context_refs = EXCLUDED.context_refs,
      position = EXCLUDED.position,
      project_id = EXCLUDED.project_id,
      updated_at = NOW();

UPDATE project
SET icon = NULL,
    updated_at = NOW()
WHERE title = 'Agent Club Operating Board'
  AND workspace_id = (SELECT id FROM workspace WHERE slug = '${AGENT_MANAGER_WORKSPACE_SLUG}');
`;
  }

  private async runCommand(
    command: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    label: string,
    timeoutMs: number,
    input?: string
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, env, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
      if (input && child.stdin) {
        child.stdin.end(input);
      }
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        this.logChild(label, chunk);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        this.logChild(label, chunk);
      });
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`${label} failed with exit code ${code}: ${stderr || stdout}`));
        }
      });
    });
  }

  private async prewarmFrontendRoutes(): Promise<void> {
    const frontendUrl = this.getFrontendUrl();
    const routes = [
      '/agent-club-boot?next=%2Fagent-club%2Fissues',
      '/agent-club/issues',
      '/agent-club/projects',
      '/agent-club/agents',
      '/agent-club/runtimes',
      '/agent-club/inbox',
      '/agent-club/my-issues',
      '/agent-club/autopilots',
      '/agent-club/squads',
      '/agent-club/skills',
    ];

    console.log('[AgentManager] prewarming common Agent-Manager screens');

    for (const route of routes) {
      const url = `${frontendUrl}${route}`;
      try {
        await this.fetchWithTimeout(url, 30000);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[AgentManager] prewarm skipped ${route}: ${message}`);
      }
    }

    console.log('[AgentManager] common Agent-Manager screens prewarmed');
  }

  private async fetchWithTimeout(url: string, timeoutMs: number, method: 'GET' | 'POST' = 'GET'): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { method, signal: controller.signal });
      if (response.status >= 500) {
        throw new Error(`${url} returned ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private async isHttpAvailable(url: string, timeoutMs: number): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { method: 'GET', signal: controller.signal });
        return response.status < 500;
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return false;
    }
  }

  private async tryWaitForHttp(url: string, timeoutMs: number): Promise<boolean> {
    try {
      await this.waitForHttp(url, timeoutMs);
      return true;
    } catch {
      return false;
    }
  }

  private async handleManagedProcessExitWhileReady(
    label: string,
    code: number | null,
    signal: NodeJS.Signals | null
  ): Promise<void> {
    if (label === 'web' && (await this.isHttpAvailable(this.getFrontendUrl(), 5000))) {
      console.log('[AgentManager:web] exited, but Agent-Manager web UI is still available');
      return;
    }

    this.updateStatus('error', 'Agent-Manager process exited', `${label} exited with code ${code ?? signal}`);
  }

  private async waitForHttp(url: string, timeoutMs: number): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const response = await fetch(url, { method: 'GET' });
        if (response.status < 500) {
          return;
        }
      } catch {
        // Server is still booting.
      }
      await this.delay(1000);
    }
    throw new Error(`Timed out waiting for ${url}`);
  }

  private async waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (await this.isPortOpen(host, port, 750)) {
        return;
      }
      await this.delay(500);
    }
    throw new Error(`Timed out waiting for ${host}:${port}`);
  }

  private async waitForPortClosed(host: string, port: number, timeoutMs: number): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (!(await this.isPortOpen(host, port, 750))) {
        return;
      }
      await this.delay(500);
    }
    throw new Error(`Timed out waiting for ${host}:${port} to close`);
  }

  private isPortOpen(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const done = (value: boolean) => {
        socket.destroy();
        resolve(value);
      };
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
      socket.connect(port, host);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getFrontendUrl(): string {
    const frontendPort = process.env.AGENT_MANAGER_FRONTEND_PORT || DEFAULT_FRONTEND_PORT;
    return `http://localhost:${frontendPort}`;
  }

  private getBackendUrl(): string {
    const backendPort = process.env.AGENT_MANAGER_BACKEND_PORT || DEFAULT_BACKEND_PORT;
    return `http://localhost:${backendPort}`;
  }

  private createStatus(state: AgentManagerStatus['state'], message?: string, detail?: string): AgentManagerStatus {
    return {
      state,
      url: this.getFrontendUrl(),
      backendUrl: this.getBackendUrl(),
      message,
      detail,
      updatedAt: Date.now(),
    };
  }

  private updateStatus(state: AgentManagerStatus['state'], message?: string, detail?: string): void {
    this.status = this.createStatus(state, message, detail);
    console.log(`[AgentManager] ${state}: ${message || ''}${detail ? ` (${detail})` : ''}`);
    ipcBridge.agentManager.statusChanged.emit(this.status);
  }

  private logChild(label: string, chunk: Buffer): void {
    const lines = chunk
      .toString()
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
    lines.forEach((line) => console.log(`[AgentManager:${label}] ${line}`));
  }
}
