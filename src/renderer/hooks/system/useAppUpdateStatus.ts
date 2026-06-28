/**
 * @license
 * Copyright 2025 Agent Club (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { ipcBridge } from '@/common';
import type { AutoUpdateStatus } from '@/common/update/updateTypes';
import { isElectronDesktop } from '@/renderer/utils/platform';

export type AppUpdateStatus = {
  updateAvailable: boolean;
  latestVersion?: string;
  checked: boolean;
};

const INITIAL_STATUS: AppUpdateStatus = {
  updateAvailable: false,
  checked: false,
};

/**
 * Tracks whether a newer app version is available (GitHub releases + electron-updater).
 */
export function useAppUpdateStatus(): AppUpdateStatus {
  const [status, setStatus] = useState<AppUpdateStatus>(INITIAL_STATUS);

  useEffect(() => {
    if (!isElectronDesktop()) {
      return undefined;
    }

    let cancelled = false;

    const runManualCheck = async () => {
      const includePrerelease = localStorage.getItem('update.includePrerelease') === 'true';
      try {
        const res = await ipcBridge.update.check.invoke({ includePrerelease });
        if (cancelled || !res?.success || !res.data) {
          return;
        }
        setStatus({
          updateAvailable: res.data.updateAvailable,
          latestVersion: res.data.latest?.version,
          checked: true,
        });
      } catch (error) {
        console.warn('[useAppUpdateStatus] Manual update check failed:', error);
        if (!cancelled) {
          setStatus((prev) => ({ ...prev, checked: true }));
        }
      }
    };

    const timer = window.setTimeout(() => {
      void runManualCheck();
    }, 3500);

    const removeListener = ipcBridge.autoUpdate.status.on((evt: AutoUpdateStatus) => {
      if (!evt) return;

      switch (evt.status) {
        case 'available':
        case 'downloaded':
          setStatus({
            updateAvailable: true,
            latestVersion: evt.version,
            checked: true,
          });
          break;
        case 'not-available':
          setStatus({
            updateAvailable: false,
            checked: true,
          });
          break;
        default:
          break;
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      removeListener();
    };
  }, []);

  return status;
}

export const openUpdateModal = () => {
  window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { source: 'titlebar' } }));
};
