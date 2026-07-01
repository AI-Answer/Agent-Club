/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * JARVIS control bridge (renderer-only).
 *
 * When Jarvis Mode activates and Hermes is installed, this hook pre-wires the
 * user's NON-Peekaboo tools into Hermes so a spoken command can drive existing
 * integrations with no extra setup:
 *
 *   1. Read the user's enabled MCP servers from ConfigStorage('mcp.config').
 *   2. Sync that (Peekaboo-excluded) set to the Hermes ACP agent via
 *      `mcpService.syncMcpToAgents`.
 *   3. Surface the Peekaboo Accessibility + Screen Recording permission state
 *      and expose grant actions (`requestPeekabooDesktopControlPermissions` /
 *      `openPeekabooPermissionSettings`).
 *
 * The bundled Peekaboo (computer-use) stdio MCP is NOT armed automatically.
 * Registering + syncing Peekaboo to Hermes — which lets a spoken command click /
 * type / control the Mac — happens ONLY after the operator flips the explicit
 * "ENGAGE CONTROL" toggle (`setEngaged(true)`). Disengaging re-syncs the
 * Peekaboo-excluded set so computer control is removed from Hermes again.
 *
 * No core-bridge edits: everything reuses existing IPC. The base pre-wire runs
 * once per activation (idempotent guard) and all async work is cancelled on
 * unmount.
 */
import { mcpService, acpConversation } from '@/common/adapter/ipcBridge';
import { ConfigStorage } from '@/common/config/storage';
import type { IMcpServer, IMcpTool } from '@/common/config/storage';
import type { PeekabooDesktopControlPermissionPane, PeekabooDesktopControlPermissionStatus } from '@/common/types/peekaboo';
import { useCallback, useEffect, useRef, useState } from 'react';

const HERMES_BACKEND = 'hermes';
const PEEKABOO_SERVER_NAME = 'peekaboo';

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

/** Build (or reuse) the Peekaboo stdio MCP server entry. */
const buildPeekabooServer = (existing: IMcpServer | undefined, proxyScriptPath: string): IMcpServer => {
  const now = Date.now();
  return {
    id: existing?.id || `${PEEKABOO_SERVER_NAME}-builtin`,
    name: PEEKABOO_SERVER_NAME,
    description: 'Built-in Peekaboo desktop control MCP packaged with Agent Club for supervised Hermes sessions.',
    enabled: true,
    builtin: true,
    transport: { type: 'stdio', command: 'node', args: [proxyScriptPath] },
    tools: existing?.tools?.length ? existing.tools : PEEKABOO_TOOLS,
    status: existing?.status || 'disconnected',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    originalJson: buildPeekabooOriginalJson(proxyScriptPath),
  };
};

export type ControlLinkState = 'checking' | 'offline' | 'wiring' | 'ready' | 'error';

export interface ControlBridge {
  /** Hermes ACP agent presence. */
  hermesInstalled: boolean;
  /** Overall MCP pre-wire link state. */
  linkState: ControlLinkState;
  /** Number of MCP servers pre-wired to Hermes (Peekaboo only when engaged). */
  syncedCount: number;
  /** Whether the bundled Peekaboo computer-control MCP is wired to Hermes. */
  peekabooWired: boolean;
  /**
   * Operator opt-in: whether computer control (Peekaboo) is engaged. Defaults to
   * OFF — Peekaboo is only registered + synced to Hermes after this flips ON.
   */
  engaged: boolean;
  /** Whether engaging is currently in flight (registering/removing Peekaboo). */
  engaging: boolean;
  /** Arm/disarm Peekaboo computer control. */
  setEngaged: (next: boolean) => void;
  /** Latest Peekaboo permission snapshot (Accessibility + Screen Recording). */
  permissions: PeekabooDesktopControlPermissionStatus | null;
  /** Last non-fatal error, if any. */
  error: string | null;
  /** Whether a permission request / settings open is in flight. */
  requesting: boolean;
  /** Re-read the Peekaboo permission snapshot. */
  refreshPermissions: () => void;
  /** Prompt for Accessibility, opening System Settings if still ungranted. */
  requestPermissions: () => void;
  /** Open a specific macOS permission pane for Agent Club. */
  openPermissionSettings: (pane: PeekabooDesktopControlPermissionPane) => void;
}

/**
 * Drives the control pre-wire once Jarvis is active. Pass `active=false` (e.g.
 * before the HUD has mounted) to defer all IPC.
 */
export function useControlBridge(active: boolean): ControlBridge {
  const [hermesInstalled, setHermesInstalled] = useState(false);
  const [linkState, setLinkState] = useState<ControlLinkState>('checking');
  const [syncedCount, setSyncedCount] = useState(0);
  const [peekabooWired, setPeekabooWired] = useState(false);
  const [engaged, setEngagedState] = useState(false);
  const [engaging, setEngaging] = useState(false);
  const [permissions, setPermissions] = useState<PeekabooDesktopControlPermissionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  // Idempotency: only run the wire-up once per active session.
  const wiredRef = useRef(false);
  const mountedRef = useRef(true);
  // Resolved Hermes agent + the base (Peekaboo-excluded) server set, captured by
  // the base pre-wire so the ENGAGE toggle can re-sync with/without Peekaboo.
  const hermesRef = useRef<{ backend: string; name: string; cliPath?: string } | null>(null);
  const baseServersRef = useRef<IMcpServer[]>([]);
  const engagedRef = useRef(false);

  const loadPermissions = useCallback(async () => {
    try {
      const result = await mcpService.getPeekabooDesktopControlPermissions.invoke();
      if (mountedRef.current && result.success && result.data) {
        setPermissions(result.data);
      }
    } catch (err) {
      console.warn('[jarvis] failed to load Peekaboo permissions', err);
    }
  }, []);

  const refreshPermissions = useCallback(() => {
    void loadPermissions();
  }, [loadPermissions]);

  const requestPermissions = useCallback(() => {
    void (async () => {
      setRequesting(true);
      setError(null);
      try {
        const result = await mcpService.requestPeekabooDesktopControlPermissions.invoke();
        if (!result.success || !result.data) {
          throw new Error(result.msg || 'Could not request macOS Accessibility permission.');
        }
        let nextStatus = result.data.status;
        if (nextStatus.isMac && nextStatus.accessibility.granted !== true) {
          const settings = await mcpService.openPeekabooPermissionSettings.invoke({ pane: 'accessibility' });
          if (settings.success && settings.data) nextStatus = settings.data;
        }
        if (mountedRef.current) setPermissions(nextStatus);
      } catch (err) {
        if (mountedRef.current) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mountedRef.current) setRequesting(false);
      }
    })();
  }, []);

  const openPermissionSettings = useCallback(
    (pane: PeekabooDesktopControlPermissionPane) => {
      void (async () => {
        setRequesting(true);
        setError(null);
        try {
          const result = await mcpService.openPeekabooPermissionSettings.invoke({ pane });
          if (!result.success) {
            throw new Error(result.msg || 'Could not open macOS permission settings.');
          }
          if (mountedRef.current && result.data) setPermissions(result.data);
        } catch (err) {
          if (mountedRef.current) setError(err instanceof Error ? err.message : String(err));
        } finally {
          if (mountedRef.current) setRequesting(false);
          void loadPermissions();
        }
      })();
    },
    [loadPermissions]
  );

  // Pre-wire the NON-Peekaboo MCP set to Hermes, once, when Jarvis becomes active.
  // Peekaboo (computer control) is intentionally NOT armed here — see setEngaged.
  useEffect(() => {
    mountedRef.current = true;
    if (!active || wiredRef.current) {
      return () => {
        mountedRef.current = false;
      };
    }

    void (async () => {
      try {
        // 1. Is Hermes available as an ACP agent?
        const agentsRes = await acpConversation.getAvailableAgents.invoke();
        const agents = (agentsRes.success && agentsRes.data) || [];
        const hermes = agents.find((a) => a.backend === HERMES_BACKEND);
        if (!mountedRef.current) return;
        setHermesInstalled(!!hermes);
        if (!hermes) {
          setLinkState('offline');
          return;
        }
        hermesRef.current = { backend: hermes.backend, name: hermes.name, cliPath: hermes.cliPath };

        setLinkState('wiring');
        // Lock before any await-heavy work so re-renders don't double-fire.
        wiredRef.current = true;

        // 2. User's enabled MCP servers (defensive: tolerate empty/missing).
        //    Peekaboo is EXCLUDED from the base set — it is only added on engage.
        let userServers: IMcpServer[] = [];
        try {
          const stored = await ConfigStorage.get('mcp.config');
          if (Array.isArray(stored)) userServers = stored.filter((s) => s && s.enabled !== false);
        } catch (err) {
          console.warn('[jarvis] failed to read mcp.config', err);
        }
        userServers = userServers.filter((s) => s.name.toLowerCase() !== PEEKABOO_SERVER_NAME);
        baseServersRef.current = userServers;

        // 3. Sync the base set to the Hermes agent (only Hermes — keep it scoped).
        if (userServers.length > 0) {
          const syncRes = await mcpService.syncMcpToAgents.invoke({
            mcpServers: userServers,
            agents: [{ backend: hermes.backend, name: hermes.name, cliPath: hermes.cliPath }],
          });
          if (!mountedRef.current) return;
          if (syncRes.success) {
            setSyncedCount(userServers.length);
            setLinkState('ready');
          } else {
            setError(syncRes.msg || 'MCP pre-wire failed.');
            setLinkState('error');
          }
        } else {
          // Nothing to wire (no enabled non-Peekaboo servers).
          setSyncedCount(0);
          setLinkState('ready');
        }

        // 4. Surface permissions for the HUD.
        await loadPermissions();
      } catch (err) {
        if (!mountedRef.current) return;
        wiredRef.current = false; // allow a retry on next activation
        setError(err instanceof Error ? err.message : 'Control pre-wire failed.');
        setLinkState('error');
      }
    })();

    return () => {
      mountedRef.current = false;
    };
  }, [active, loadPermissions]);

  // Operator opt-in: arm/disarm Peekaboo computer control by re-syncing Hermes
  // with or without the bundled computer-use MCP. Default OFF.
  const setEngaged = useCallback((next: boolean) => {
    if (engagedRef.current === next) return;
    const hermes = hermesRef.current;
    if (!hermes) {
      setError('Hermes is not linked — cannot engage computer control.');
      return;
    }
    void (async () => {
      setEngaging(true);
      setError(null);
      try {
        const baseServers = baseServersRef.current;
        let servers: IMcpServer[] = baseServers;
        let peekabooReady = false;

        if (next) {
          // Resolve + add Peekaboo only on engage.
          const setup = await mcpService.getPeekabooDesktopControlSetup.invoke();
          const proxyScriptPath = setup.success ? setup.data?.proxyScriptPath : undefined;
          if (!proxyScriptPath) {
            throw new Error(setup.msg || 'Peekaboo computer-control setup is unavailable.');
          }
          const peekabooServer = buildPeekabooServer(undefined, proxyScriptPath);
          servers = [...baseServers, peekabooServer];
          peekabooReady = true;
        }

        if (servers.length > 0) {
          const syncRes = await mcpService.syncMcpToAgents.invoke({
            mcpServers: servers,
            agents: [{ backend: hermes.backend, name: hermes.name, cliPath: hermes.cliPath }],
          });
          if (!syncRes.success) throw new Error(syncRes.msg || 'Failed to sync computer control to Hermes.');
        }

        if (!mountedRef.current) return;
        engagedRef.current = next;
        setEngagedState(next);
        setPeekabooWired(peekabooReady);
        setSyncedCount(servers.length);
      } catch (err) {
        if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to toggle computer control.');
      } finally {
        if (mountedRef.current) setEngaging(false);
      }
    })();
  }, []);

  return {
    hermesInstalled,
    linkState,
    syncedCount,
    peekabooWired,
    engaged,
    engaging,
    setEngaged,
    permissions,
    error,
    requesting,
    refreshPermissions,
    requestPermissions,
    openPermissionSettings,
  };
}
