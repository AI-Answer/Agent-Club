/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// 5s vault poll — renderer replacement for jarvis-hud's useVaultState (which
// fetched GET /api/state). Here it calls the async getVaultState() from the
// Foundation vault port. Returns the latest snapshot, an error flag (any
// rejected pull), and a manual refresh (used after a mutation like a
// Directive toggle so the UI reflects the write immediately).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { getVaultState, type VaultState } from '../../vault/vaultState';

export function useVaultPoll(intervalMs = 5000): {
  state: VaultState | null;
  error: boolean;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<VaultState | null>(null);
  const [error, setError] = useState(false);

  const pull = useCallback(async () => {
    try {
      const next = await getVaultState();
      setState(next);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const run = () => {
      void pull();
    };
    run();
    const id = setInterval(() => {
      if (alive) run();
    }, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pull, intervalMs]);

  return { state, error, refresh: pull };
}
