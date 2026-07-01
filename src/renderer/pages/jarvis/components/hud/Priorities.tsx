/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// Priorities (Directives) — today's Top-3 checkboxes. Clicking a row on
// today's note flips it via the vault toggleTop3() writer (wired through the
// `onToggle` prop by the composition). Ported 1:1 from jarvis-hud
// components/HUD.tsx (Priorities).
// ---------------------------------------------------------------------------

import React, { memo } from 'react';
import type { VaultState } from '../../vault/vaultState';
import { SectionTitle, noteAgeDays } from './helpers';

const Priorities = memo(function Priorities({
  state,
  hot,
  onToggle,
}: {
  state: VaultState;
  hot?: boolean;
  onToggle: (index: number, done: boolean) => void;
}): React.ReactElement {
  const d = state.daily;
  const ageDays = d && !d.isToday ? noteAgeDays(d.date) : 0;
  const veryStale = ageDays > 2;
  return (
    <section
      className={`block boot-stagger ${!d || d.isToday ? '' : 'note-stale'} ${hot ? 'voice-hot' : ''}`}
      style={{ animationDelay: '0.18s' }}
    >
      <SectionTitle title="Directives" tick="TOP.3" />
      {d ? (
        <>
          {!d.isToday && <div className={`stale-banner ${veryStale ? 'err' : ''}`}>⚠ note is {ageDays}d old — run /today</div>}
          {d.top3.map((p, i) => (
            <div
              className={`prio ${p.done ? 'done' : ''} ${d.isToday ? 'clickable' : ''}`}
              key={i}
              role={d.isToday ? 'button' : undefined}
              title={d.isToday ? (p.done ? 'mark open' : 'mark done') : undefined}
              onClick={d.isToday ? () => onToggle(i, !p.done) : undefined}
            >
              <span className="box">{p.done ? '■' : '□'}</span>
              <span>{p.text}</span>
            </div>
          ))}
          <div className="prio-date">{d.isToday ? 'today' : `carried · ${d.date}`}</div>
        </>
      ) : (
        <div className="prio dim">no daily note found</div>
      )}
    </section>
  );
});

export default Priorities;
