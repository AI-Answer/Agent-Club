/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';
import { ipcBridge } from '@/common';

export const PROTOCOL_SCHEME = 'agentclub';
export const LEGACY_PROTOCOL_SCHEMES = ['aionui'] as const;
const ACCEPTED_PROTOCOL_SCHEMES = [PROTOCOL_SCHEME, ...LEGACY_PROTOCOL_SCHEMES] as const;

export const isDeepLinkUrl = (value?: string | null): value is string => {
  return typeof value === 'string' && ACCEPTED_PROTOCOL_SCHEMES.some((scheme) => value.startsWith(`${scheme}://`));
};

/**
 * Parse an Agent Club deep link URL into action and params.
 * Supports two formats:
 *   1. agentclub://add-provider?baseUrl=xxx&apiKey=xxx
 *   2. agentclub://provider/add?v=1&data=<base64 JSON>  (one-api / new-api style)
 */
export const parseDeepLinkUrl = (url: string): { action: string; params: Record<string, string> } | null => {
  try {
    const parsed = new URL(url);
    const scheme = parsed.protocol.replace(/:$/, '');
    if (!ACCEPTED_PROTOCOL_SCHEMES.includes(scheme as (typeof ACCEPTED_PROTOCOL_SCHEMES)[number])) return null;

    const hostname = parsed.hostname || '';
    const pathname = parsed.pathname.replace(/^\/+/, '');
    const action = pathname ? `${hostname}/${pathname}` : hostname;

    const params: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    // If data param exists, decode base64 JSON and merge into params
    if (params.data) {
      try {
        const json = JSON.parse(Buffer.from(params.data, 'base64').toString('utf-8'));
        if (json && typeof json === 'object') {
          Object.assign(params, json);
        }
      } catch {
        // Ignore decode errors
      }
      delete params.data;
    }

    return { action, params };
  } catch {
    return null;
  }
};

let mainWindowRef: BrowserWindow | null = null;
let pendingDeepLinkUrl: string | null = process.argv.find(isDeepLinkUrl) || null;

export const setDeepLinkMainWindow = (win: BrowserWindow): void => {
  mainWindowRef = win;
};

export const getPendingDeepLinkUrl = (): string | null => pendingDeepLinkUrl;

export const clearPendingDeepLinkUrl = (): void => {
  pendingDeepLinkUrl = null;
};

/**
 * Send the deep-link payload to the renderer via IPC bridge.
 * If the window isn't ready yet, queue it.
 */
export const handleDeepLinkUrl = (url: string): void => {
  const parsed = parseDeepLinkUrl(url);
  if (!parsed) return;

  if (!mainWindowRef || mainWindowRef.isDestroyed()) {
    pendingDeepLinkUrl = url;
    return;
  }

  ipcBridge.deepLink.received.emit(parsed);
};
