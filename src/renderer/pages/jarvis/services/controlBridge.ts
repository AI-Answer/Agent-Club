/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * JARVIS control bridge (renderer-only).
 *
 * Surfaces Peekaboo permission state and the operator opt-in toggle for
 * computer control. MCP servers are injected into the Hermes ACP session by
 * voicePipeline (session-level injection), not via McpService.syncMcpToAgents.
 */
import { mcpService } from '@/common/adapter/ipcBridge';
import type { PeekabooDesktopControlPermissionPane, PeekabooDesktopControlPermissionStatus } from '@/common/types/peekaboo';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ControlBridge {
  /** Operator opt-in: whether computer control (Peekaboo) is engaged. */
  engaged: boolean;
  /** Arm/disarm Peekaboo computer control (triggers session recreation in voicePipeline). */
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

export function useControlBridge(active: boolean): ControlBridge {
  const [engaged, setEngagedState] = useState(false);
  const [permissions, setPermissions] = useState<PeekabooDesktopControlPermissionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const mountedRef = useRef(true);

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

  useEffect(() => {
    mountedRef.current = true;
    if (active) void loadPermissions();
    return () => {
      mountedRef.current = false;
    };
  }, [active, loadPermissions]);

  const setEngaged = useCallback((next: boolean) => {
    setEngagedState(next);
  }, []);

  return {
    engaged,
    setEngaged,
    permissions,
    error,
    requesting,
    refreshPermissions,
    requestPermissions,
    openPermissionSettings,
  };
}
