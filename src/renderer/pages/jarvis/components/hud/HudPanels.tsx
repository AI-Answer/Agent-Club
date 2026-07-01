/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// HudPanels — convenience composition wiring the ported HUD panels to the
// vault poll + voicePipeline. The integration phase rewrites index.tsx and may
// either mount this directly or copy its wiring; it intentionally does NOT own
// the orb (GraphCore), the scrims, the grain, or the push-to-talk key
// handling — those stay in index.tsx. Everything here is presentational glue.
//
// Layout mirrors jarvis-hud's HUD root: TopBar, hud-left (Vitals / Priorities /
// Documents), hud-center (Callouts), hud-right (CommandDeck / Schedule /
// AudioIO / Wire), hud-bottom (Objective), and the report overlay.
// ---------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReportOverlay from '../ReportOverlay';
import { readVaultMarkdown, toggleTop3 } from '../../vault/vaultState';
import type { TranscriptLine, VoiceStatus } from '../../services/voicePipeline';
import type { CoreMode } from './types';
import { useVaultPoll } from './useVaultPoll';
import TopBar from './TopBar';
import Vitals from './Vitals';
import Priorities from './Priorities';
import Documents from './Documents';
import CommandDeck from './CommandDeck';
import Schedule from './Schedule';
import AudioIO from './AudioIO';
import Wire from './Wire';
import Objective from './Objective';
import Callouts, { useCallouts } from './Callouts';

/** Map the voicePipeline status onto the orb/chrome CoreMode. */
export function statusToCoreMode(status: VoiceStatus): CoreMode {
  switch (status) {
    case 'listening':
      return 'listening';
    case 'speaking':
      return 'speaking';
    case 'thinking':
      return 'working';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

export interface HudPanelsProps {
  /** Live voice status → core mode (TopBar chip + AudioIO wave). */
  voiceStatus?: VoiceStatus;
  /** Voice transcript (reserved for panels that surface it; bound here so the
   *  integration phase has the seam ready). */
  transcript?: TranscriptLine[];
  /** Forward a deck skill to Hermes. Integration supplies this with a bound
   *  conversation_id; omit to keep the deck a pure queue-file writer. */
  onDeckSendMessage?: (skill: string) => void | Promise<void>;
  /** Poll interval override (ms). */
  pollMs?: number;
  /** Monotonic counter bumped by the HUD's Esc handler (index.tsx owns Esc).
   *  Each change closes any open report overlay — the report state lives here,
   *  so the parent signals rather than reaching into it. */
  escapeSignal?: number;
  /** Utility controls (music / disengage) rendered in the TopBar right cell. */
  topControls?: React.ReactNode;
}

const HudPanels: React.FC<HudPanelsProps> = ({ voiceStatus = 'idle', onDeckSendMessage, pollMs = 5000, escapeSignal = 0, topControls }) => {
  const { state, error, refresh } = useVaultPoll(pollMs);
  const { callouts, dismiss, clear } = useCallouts(state);
  const [report, setReport] = useState<{ path: string; content: string } | null>(null);

  // Esc (handled in index.tsx) closes the report overlay. Skip the initial
  // mount so a report can't be force-closed before it's ever opened.
  const escapeSeenRef = useRef(escapeSignal);
  useEffect(() => {
    if (escapeSignal === escapeSeenRef.current) return;
    escapeSeenRef.current = escapeSignal;
    setReport(null);
  }, [escapeSignal]);
  // rolling status log — integration may surface this in a feed panel; kept in
  // a ref so logging doesn't trigger re-renders of the whole HUD.
  const feedRef = useRef<string[]>([]);

  const mode = useMemo(() => statusToCoreMode(voiceStatus), [voiceStatus]);

  const pushLine = useCallback((text: string) => {
    feedRef.current = [...feedRef.current.slice(-30), text];
  }, []);

  const openReport = useCallback(
    async (path: string) => {
      const content = await readVaultMarkdown(path);
      if (content === null) {
        pushLine(`couldn't open ${path}`);
        return;
      }
      setReport({ path, content });
    },
    [pushLine],
  );

  const toggleDirective = useCallback(
    async (index: number, done: boolean) => {
      const ok = await toggleTop3(index, done);
      if (ok) await refresh();
      else pushLine('directive update failed');
    },
    [refresh, pushLine],
  );

  const onQueued = useCallback(
    (skill: string, ok: boolean) => {
      pushLine(ok ? `intent queued → ${skill}` : `queue write FAILED → ${skill}`);
    },
    [pushLine],
  );

  return (
    <div className="hud">
      <TopBar state={state} online={!error} mode={mode} controls={topControls} />

      <div className="hud-left">
        {state && <Vitals state={state} />}
        {state && <Priorities state={state} onToggle={toggleDirective} />}
        {state && <Documents state={state} onOpen={openReport} />}
      </div>

      <Callouts callouts={callouts} onOpenReport={openReport} onDismiss={dismiss} onClear={clear} />

      <div className="hud-right">
        <CommandDeck state={state} onQueued={onQueued} onSendMessage={onDeckSendMessage} />
        {state && <Schedule state={state} />}
        <AudioIO mode={mode} />
        {state && <Wire state={state} onOpen={openReport} />}
      </div>

      <div className="hud-bottom">{state && <Objective state={state} />}</div>

      {report && <ReportOverlay report={report} onClose={() => setReport(null)} />}
    </div>
  );
};

export default HudPanels;
