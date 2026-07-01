/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// Callouts — the report/task cards that branch off the core (max 4 anchor
// slots around the orb). kind "doc" opens the overlay, "link" opens a source
// in a new tab, "task" is a live run (elapsed / ~eta bar) that morphs into its
// doc card on completion.
//
// Ported from jarvis-hud components/HUD.tsx (the hud-center callouts block +
// the addCallout / run-tracking effects, extracted into useCallouts so the
// composition gets the same behavior without owning the state machine).
// ---------------------------------------------------------------------------

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { VaultState } from '../../vault/vaultState';
import { fmtClock } from './helpers';

export interface Callout {
  id: number;
  kind: 'doc' | 'link' | 'task';
  target: string;
  label: string;
  slot: number;
  startedAt?: number;
  etaS?: number | null;
  phase?: 'working' | 'done' | 'failed';
}

export interface CalloutsApi {
  callouts: Callout[];
  /** Add a doc/link callout (deduped by target). */
  addCallout: (target: string, label: string, kind?: 'doc' | 'link') => void;
  /** Dismiss one card. */
  dismiss: (id: number) => void;
  /** Clear all cards. */
  clear: () => void;
}

const SLOTS = [0, 1, 2, 3];

/**
 * Owns the callout lifecycle: report reveals (doc/link) + live task tracking
 * driven by vault `state.runs`. Ported from the HUD.tsx effects; the
 * composition feeds it the polled vault state.
 */
export function useCallouts(state: VaultState | null): CalloutsApi {
  const [callouts, setCallouts] = useState<Callout[]>([]);
  const seq = useRef(0);

  const addCallout = useCallback((target: string, label: string, kind: 'doc' | 'link' = 'doc') => {
    setCallouts((cur) => {
      if (cur.some((c) => c.target === target)) return cur; // already on screen
      const used = new Set(cur.map((c) => c.slot));
      const free = SLOTS.find((s) => !used.has(s));
      const entry = { id: ++seq.current, kind, target, label };
      // all four slots taken → oldest non-working card yields its slot
      if (free === undefined) {
        const victim = cur.find((c) => !(c.kind === 'task' && c.phase === 'working')) ?? cur[0];
        return [...cur.filter((c) => c !== victim), { ...entry, slot: victim.slot }];
      }
      return [...cur, { ...entry, slot: free }];
    });
  }, []);

  const dismiss = useCallback((id: number) => {
    setCallouts((cur) => cur.filter((c) => c.id !== id));
  }, []);

  const clear = useCallback(() => setCallouts([]), []);

  // task callouts — active runs branch off the core; on completion the card
  // morphs IN PLACE into the deliverable card (same slot, no jump).
  useEffect(() => {
    if (!state) return;
    setCallouts((cur) => {
      let next = cur;
      for (const r of state.runs) {
        const existing = next.find((c) => c.kind === 'task' && c.target === `run:${r.id}`);
        if (r.status === 'running' && !existing) {
          const used = new Set(next.map((c) => c.slot));
          const free = SLOTS.find((s) => !used.has(s));
          const entry: Callout = {
            id: ++seq.current,
            kind: 'task',
            target: `run:${r.id}`,
            label: r.label ?? r.skill.replace(/-/g, ' '),
            startedAt: r.ts_started ? Date.parse(r.ts_started) : Date.now(),
            etaS: state.etas[r.skill] ?? null,
            phase: 'working',
            slot: 0,
          };
          if (free === undefined) {
            const victim = next.find((c) => !(c.kind === 'task' && c.phase === 'working')) ?? next[0];
            next = [...next.filter((c) => c !== victim), { ...entry, slot: victim.slot }];
          } else {
            next = [...next, { ...entry, slot: free }];
          }
        } else if (existing && existing.phase === 'working' && r.status !== 'running') {
          next =
            r.status === 'ok' && r.deliverable_path
              ? next.map((c) =>
                  c === existing
                    ? {
                        ...c,
                        kind: (r.link ? 'link' : 'doc') as 'link' | 'doc',
                        target: r.link ?? r.deliverable_path!,
                        phase: undefined,
                      }
                    : c,
                )
              : next.map((c) =>
                  c === existing ? { ...c, phase: r.status === 'ok' ? ('done' as const) : ('failed' as const) } : c,
                );
        }
      }
      return next;
    });
  }, [state]);

  // ok-but-no-deliverable tasks flash COMPLETE, then clear themselves
  useEffect(() => {
    if (!callouts.some((c) => c.phase === 'done')) return;
    const id = setTimeout(() => setCallouts((cur) => cur.filter((c) => c.phase !== 'done')), 6000);
    return () => clearTimeout(id);
  }, [callouts]);

  // 1s re-render while a task works — elapsed + bar width derive from Date.now()
  const taskWorking = callouts.some((c) => c.kind === 'task' && c.phase === 'working');
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!taskWorking) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [taskWorking]);

  return { callouts, addCallout, dismiss, clear };
}

export default function Callouts({
  callouts,
  onOpenReport,
  onDismiss,
  onClear,
}: {
  callouts: Callout[];
  onOpenReport: (path: string) => void;
  onDismiss: (id: number) => void;
  onClear: () => void;
}): React.ReactElement {
  return (
    <div className="hud-center">
      {callouts.map((c) => {
        const isTask = c.kind === 'task';
        const elapsed = isTask && c.startedAt ? Math.max(0, Math.floor((Date.now() - c.startedAt) / 1000)) : 0;
        // ETA is silent: the bar fills toward the median (capped at 95) and
        // degrades to the indeterminate sweep once elapsed passes it.
        const overdue = c.etaS != null && elapsed >= c.etaS;
        const pct = isTask && c.etaS && !overdue ? Math.min(95, (elapsed / c.etaS) * 100) : null;
        return (
          <div key={c.id} className={`callout slot-${c.slot}`}>
            <i className="br br-a" aria-hidden="true" />
            <i className="br br-b" aria-hidden="true" />
            <div
              className={`callout-box${isTask ? ` task ${c.phase ?? ''}` : ''}`}
              {...(!isTask && {
                role: 'button',
                tabIndex: 0,
                onClick: () =>
                  c.kind === 'link' ? window.open(c.target, '_blank', 'noopener') : onOpenReport(c.target),
              })}
            >
              <span className="callout-dot" />
              <span className="callout-text">
                <span className="callout-label">{c.label}</span>
                {isTask ? (
                  <span className="task-meta">
                    <span className={`task-bar${pct === null && c.phase === 'working' ? ' indet' : ''}`}>
                      <i
                        style={
                          c.phase !== 'working' ? { width: '100%' } : pct !== null ? { width: `${pct}%` } : undefined
                        }
                      />
                    </span>
                    <span className="task-time">
                      {c.phase === 'working'
                        ? `${fmtClock(elapsed)} · working`
                        : c.phase === 'failed'
                          ? `failed · ${fmtClock(elapsed)}`
                          : `complete · ${fmtClock(elapsed)}`}
                    </span>
                  </span>
                ) : (
                  <span className="callout-file">
                    {c.kind === 'link'
                      ? c.target.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] + ' ↗'
                      : c.target.split('/').pop()}
                  </span>
                )}
              </span>
              <button
                className="callout-x"
                aria-label="dismiss"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(c.id);
                }}
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
      {callouts.length > 1 && (
        <button className="callout-clear" onClick={onClear}>
          clear all ×{callouts.length}
        </button>
      )}
    </div>
  );
}
