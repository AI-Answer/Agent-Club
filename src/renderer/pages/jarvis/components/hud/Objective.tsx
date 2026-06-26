/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// Objective (Primary Directive) — a fresh upload (<48h) takes the board as a
// live velocity battle; otherwise the long campaign toward the next subscriber
// milestone, with a projected arrival date from the real weekly delta. Ported
// 1:1 from jarvis-hud components/HUD.tsx (Objective + MILESTONES helpers).
// ---------------------------------------------------------------------------

import React, { memo } from 'react';
import type { VaultState } from '../../vault/vaultState';
import { CountUp, fmt, fmtFull, findMetric } from './helpers';

const MILESTONES = [100_000, 250_000, 500_000, 1_000_000, 2_000_000];
const nextMilestone = (subs: number) => MILESTONES.find((m) => m > subs) ?? Math.ceil(subs / 1_000_000 + 1) * 1_000_000;
const LIVE_DEPLOY_H = 48;

const Objective = memo(function Objective({ state, hot }: { state: VaultState; hot?: boolean }): React.ReactElement {
  const subs = findMetric(state.metrics, 'youtube', 'subscribers');
  const v = state.latestVideo;

  const ageH = v?.published_at ? (Date.now() - Date.parse(v.published_at)) / 3_600_000 : null;
  const liveDeploy = v !== null && ageH !== null && ageH >= 0 && ageH <= LIVE_DEPLOY_H;

  const deployLine = v && (
    <div className="video-title">
      latest deploy ·{' '}
      <a href={v.url} target="_blank" rel="noreferrer">
        <b>{v.title}</b>
      </a>{' '}
      — {fmtFull(v.views)} views
    </div>
  );

  if (liveDeploy && v && ageH !== null) {
    const days = Math.max(ageH / 24, 0.25);
    const perDay = Math.round(v.views / days);
    const windowPct = Math.min((ageH / LIVE_DEPLOY_H) * 100, 100);
    return (
      <section className={`objective boot-stagger ${hot ? 'voice-hot' : ''}`} style={{ animationDelay: '0.58s' }}>
        <div className="obj-label">Primary Directive · Live Deploy</div>
        <div className="big">
          <CountUp value={v.views} full />
          <span className="unit">VIEWS</span>
        </div>
        <div className="progress">
          <i style={{ width: `${windowPct}%` }} />
        </div>
        <div className="sub">
          <span>
            velocity <b>{fmtFull(perDay)}/day</b>
          </span>
          <span>
            live <b>{Math.round(ageH)}h</b>
          </span>
          <span>
            spotlight <b>{Math.max(LIVE_DEPLOY_H - Math.round(ageH), 0)}h left</b>
          </span>
        </div>
        {deployLine}
      </section>
    );
  }

  const target = subs ? nextMilestone(subs.value) : MILESTONES[0];
  const pct = subs ? Math.min((subs.value / target) * 100, 100) : 0;
  // honest clock: at the current weekly pace, when does the next plaque land?
  const eta =
    subs && subs.deltaWeek && subs.deltaWeek > 0
      ? new Date(Date.now() + ((target - subs.value) / subs.deltaWeek) * 7 * 86_400_000).toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        })
      : null;
  return (
    <section className={`objective boot-stagger ${hot ? 'voice-hot' : ''}`} style={{ animationDelay: '0.58s' }}>
      <div className="obj-label">Primary Directive · Road to {fmt(target)}</div>
      <div className="big">
        {subs ? <CountUp value={subs.value} full /> : '—'}
        <span className="unit">SUBS</span>
      </div>
      <div className="progress">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="sub">
        <span>
          target <b>{fmtFull(target)}</b>
        </span>
        <span>
          this week <b>{subs?.deltaWeek ? `+${fmtFull(subs.deltaWeek)}` : '—'}</b>
        </span>
        <span>
          {eta ? (
            <>
              at this pace <b>{eta}</b>
            </>
          ) : (
            <b>{pct.toFixed(1)}%</b>
          )}
        </span>
      </div>
      {deployLine}
    </section>
  );
});

export default Objective;
