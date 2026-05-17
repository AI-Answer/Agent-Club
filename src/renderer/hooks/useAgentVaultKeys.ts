import { ipcBridge } from '@/common';
import { useCallback, useEffect, useState } from 'react';

type AgentVaultSnapshot = {
  enabled: boolean;
  keys: string[];
  loading: boolean;
  refresh: () => Promise<void>;
};

export function useAgentVaultKeys(): AgentVaultSnapshot {
  const [enabled, setEnabled] = useState(false);
  const [keys, setKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ipcBridge.security.getState.invoke();
      if (!result.success || !result.data) {
        setEnabled(false);
        setKeys([]);
        return;
      }
      setEnabled(result.data.agentVault.enabled);
      setKeys(result.data.agentVault.keys);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { enabled, keys, loading, refresh };
}
