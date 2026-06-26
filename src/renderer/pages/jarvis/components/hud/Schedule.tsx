/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// Schedule — today's timed agenda with a live NOW marker on the current block
// and a focus line. Ported 1:1 from jarvis-hud components/HUD.tsx (Schedule).
// ---------------------------------------------------------------------------

import React, { memo } from 'react';
import type { VaultState } from '../../vault/vaultState';
import { SectionTitle, useClock, noteAgeDays, parseHHMM } from './helpers';

const Schedule = memo(function Schedule({ state, hot }: { state: VaultState; hot?: boolean }): React.ReactElement | null {
  const d = state.daily;
  const now = useClock();
  if (!d || d.schedule.length === 0) return null;
  const nowMin = now && d.isToday ? now.getHours() * 60 + now.getMinutes() : -1;
  const items = d.schedule.map((s) => ({ ...s, min: parseHHMM(s.time) }));
  // current block = latest item that has started
  let currentIdx = -1;
  if (nowMin >= 0) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].min >= 0 && items[i].min <= nowMin) currentIdx = i;
    }
  }
  const ageDays = d.isToday ? 0 : noteAgeDays(d.date);
  return (
    <section
      className={`block boot-stagger ${d.isToday ? '' : 'note-stale'} ${hot ? 'voice-hot' : ''}`}
      style={{ animationDelay: '0.34s' }}
    >
      <SectionTitle
        title="Schedule"
        tick={d.isToday ? 'TODAY' : `${ageDays}D OLD`}
        href="https://calendar.google.com/calendar/u/0/r/day"
      />
      <div className="sched">
        {items.map((s, i) => (
          <div
            key={`${s.time}-${i}`}
            className={`sched-row ${i === currentIdx ? 'now' : ''} ${currentIdx >= 0 && i < currentIdx ? 'past' : ''}`}
          >
            <span className="t">{s.time}</span>
            <span className="i">{s.item}</span>
            {i === currentIdx && <span className="now-tag">NOW</span>}
          </div>
        ))}
      </div>
      {d.focus && <div className="focus-line">focus · {d.focus}</div>}
    </section>
  );
});

export default Schedule;
