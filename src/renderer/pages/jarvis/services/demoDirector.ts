/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DEMO-ONLY (hardcoded for a recording session — safe to delete after).
 *
 * When the user opens with the "good morning jarvis" trigger phrase, the
 * voice pipeline bypasses Hermes entirely and plays a pre-rendered morning
 * briefing (cloned Jarvis voice) while a local cue server switches apps and
 * screens in time with the audio. See ~/Downloads/jarvis-reel-director.
 */

import { useEffect, useState } from 'react';

const DEMO_SERVER = 'http://127.0.0.1:8765';

const TRIGGER_RE = /good\s+morning[,!.\s]*jarvis|hey\s+jarvis.*(day|looking)/i;

/** Full text of the pre-rendered briefing, shown in the transcript while it plays. */
export const DEMO_BRIEFING_TEXT =
  'Good morning, sir. Here is your Sunday. ' +
  'First up: your Skool community — I am opening it now. Check the posts and respond to what came in. ' +
  'Then, here is your calendar. Your main event: the webinar, from 2 to 4. Good luck up there, sir. ' +
  'After that, we continue filming the JEV course at 4:15. ' +
  'And… I see you are in the middle of the webinar. Hi, everyone. Let us start things off with Friday — the assistant.';

export function isDemoTrigger(text: string): boolean {
  return TRIGGER_RE.test(text);
}

/** Fetch the pre-rendered briefing audio from the local cue server. */
export async function fetchDemoAudioBytes(): Promise<number[]> {
  const res = await fetch(`${DEMO_SERVER}/audio`);
  if (!res.ok) throw new Error(`demo audio fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  return Array.from(new Uint8Array(buf));
}

/** Kick off the screen-switching cue timeline (audio muted server-side). */
export function startDemoCues(): void {
  void fetch(`${DEMO_SERVER}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mute: true }),
  }).catch((e) => console.warn('[jarvis:demo] cue server unreachable', e));
}

export type DemoPhase = 'idle' | 'listening' | 'speaking';

/**
 * Current phase of the external performance runner (perform.sh / start.sh) —
 * drives the orb through listening glow -> speaking glow even though the
 * briefing audio plays outside the app.
 */
export function useDemoPhase(pollMs = 500): DemoPhase {
  const [demoPhase, setDemoPhase] = useState<DemoPhase>('idle');
  useEffect(() => {
    let alive = true;
    const tick = async (): Promise<void> => {
      try {
        const res = await fetch(`${DEMO_SERVER}/status`);
        const data = (await res.json()) as { running?: boolean; phase?: DemoPhase };
        if (!alive) return;
        if (data.phase === 'listening' || data.phase === 'speaking') setDemoPhase(data.phase);
        else setDemoPhase(data.running ? 'speaking' : 'idle');
      } catch {
        if (alive) setDemoPhase('idle');
      }
    };
    void tick();
    const id = window.setInterval((): void => void tick(), pollMs);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [pollMs]);
  return demoPhase;
}
