/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

/** WebSocket feed from the optional local voice sidecar (wake word + hands-free STT). */
const WAKE_WS_URL = 'ws://127.0.0.1:3108/events';

export type VoiceSidecarWakeHandlers = {
  onHello: (wakeArmed: boolean) => void;
  onWake: () => void;
  onTranscript: (text: string) => void;
  onWakeEnd: () => void;
};

/**
 * Maintain a resilient WebSocket to the sidecar /events endpoint. The sidecar
 * owns mic capture after "Hey Jarvis"; the app only reacts to wake/transcript
 * events (pattern from jarvis-hud voiceClient).
 */
export function connectVoiceSidecarWake(handlers: VoiceSidecarWakeHandlers): () => void {
  if (typeof WebSocket === 'undefined') return () => {};

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const scheduleReconnect = (ms: number) => {
    if (closed) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, ms);
  };

  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(WAKE_WS_URL);
    } catch {
      scheduleReconnect(10_000);
      return;
    }

    ws.onmessage = (ev) => {
      let e: { type?: string; text?: string; wake?: boolean };
      try {
        e = JSON.parse(String(ev.data)) as { type?: string; text?: string; wake?: boolean };
      } catch {
        return;
      }
      if (e.type === 'hello') handlers.onHello(Boolean(e.wake));
      else if (e.type === 'wake') handlers.onWake();
      else if (e.type === 'transcript') {
        handlers.onWakeEnd();
        const text = (e.text ?? '').trim();
        if (text) handlers.onTranscript(text);
      } else if (e.type === 'wake_timeout' || e.type === 'wake_error') {
        handlers.onWakeEnd();
      }
    };

    ws.onclose = () => {
      ws = null;
      scheduleReconnect(5_000);
    };
    ws.onerror = () => ws?.close();
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
  };
}
