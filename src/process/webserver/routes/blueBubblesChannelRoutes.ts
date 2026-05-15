/**
 * @license
 * Copyright 2025 Agent Club (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { apiRateLimiter } from '../middleware/security';
import { getActiveImessagePlugin } from '@process/channels/plugins/imessage/BlueBubblesWebhookState';
import { ImessagePlugin } from '@process/channels/plugins/imessage/ImessagePlugin';

function parseBody(req: Request): Record<string, unknown> | null {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body as Record<string, unknown>;
  }
  return null;
}

function extractGuid(req: Request, body: Record<string, unknown> | null): string {
  const headerGuid = req.header('x-bluebubbles-guid') || req.header('x-bluebubbles-password');
  const queryGuid = req.query.guid || req.query.password || req.query.token;
  const bodyGuid = body?.guid || body?.password || body?.token;
  return String(headerGuid || queryGuid || bodyGuid || '');
}

function wrapAsync(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

/**
 * BlueBubbles webhook endpoint for Hermes iMessage traffic.
 *
 * BlueBubbles posts inbound iMessage events here. The endpoint is intentionally
 * unauthenticated by JWT because BlueBubbles is an external server; access is
 * gated by the same server password/guid used for REST API calls.
 */
export function registerBlueBubblesChannelRoutes(app: Express): void {
  app.post(ImessagePlugin.getWebhookPath(), apiRateLimiter, wrapAsync(blueBubblesWebhookHandler));
}

async function blueBubblesWebhookHandler(req: Request, res: Response): Promise<void> {
  const plugin = getActiveImessagePlugin();
  if (!plugin || !plugin.isRunning()) {
    res.status(503).json({ ok: false, message: 'iMessage channel plugin is not running' });
    return;
  }

  const body = parseBody(req);
  if (!body) {
    res.status(400).json({ ok: false, message: 'invalid JSON body' });
    return;
  }

  if (!plugin.verifyWebhookGuid(extractGuid(req, body))) {
    res.status(403).json({ ok: false, message: 'invalid BlueBubbles guid' });
    return;
  }

  try {
    const result = await plugin.handleWebhookPayload(body);
    res.json({ ok: true, accepted: result.accepted, reason: result.reason });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ ok: false, message });
  }
}
