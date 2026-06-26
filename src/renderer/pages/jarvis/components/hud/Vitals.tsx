/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// Vitals — social metrics, latest-video views, Claude 5h window. Count-up
// values + SVG sparklines from real metric history. Ported 1:1 from
// jarvis-hud components/HUD.tsx (Vitals + VitalLabel + SOCIAL_DEFS).
// ---------------------------------------------------------------------------

import React, { memo } from 'react';
import type { Metric, VaultState } from '../../vault/vaultState';
import { CountUp, Sparkline, SectionTitle, fmt, fmtAge, findMetric } from './helpers';

const SOCIAL_DEFS: { source: string; metric: string; label: string }[] = [
  { source: 'youtube', metric: 'subscribers', label: 'YT Subscribers' },
  { source: 'instagram', metric: 'followers', label: 'Instagram' },
];

function VitalLabel({ m, label }: { m: Metric; label: string }): React.ReactElement {
  const age = fmtAge(m.timestamp);
  return (
    <span className="label">
      <i className={`status-dot ${m.status !== 'ok' ? m.status : ''}`} />
      {label}
      {m.status === 'mock' && <span className="sim-tag">SIM</span>}
      <span className={`age ${age.stale ? 'stale' : ''}`}>{age.label}</span>
    </span>
  );
}

const Vitals = memo(function Vitals({ state, hot }: { state: VaultState; hot?: boolean }): React.ReactElement {
  const metrics = state.metrics;
  const tokens = findMetric(metrics, 'claude_code', 'tokens_5h');
  const vidMetric = findMetric(metrics, 'youtube', 'latest_video_views');
  const v = state.latestVideo;

  // auto-calibrating cap: 100% = the biggest 5h window ever recorded —
  // no plan constant to maintain, tightens itself as heavy days land
  const tokenPeak = tokens ? Math.max(...tokens.history.map((h) => h.value), tokens.value) : null;

  const vidDays = v ? Math.max((Date.now() - Date.parse(v.published_at)) / 86_400_000, 0.25) : null;
  const vidPerDay = v && vidDays ? v.views / vidDays : null;

  return (
    <section className={`block boot-stagger ${hot ? 'voice-hot' : ''}`} style={{ animationDelay: '0.1s' }}>
      <SectionTitle title="System Vitals" tick="AUDIENCE.LINK" />
      {SOCIAL_DEFS.map((def) => {
        const m = findMetric(metrics, def.source, def.metric);
        if (!m) return null;
        const dw = m.deltaWeek;
        const deltaCls = !dw ? 'zero' : dw < 0 ? 'neg' : '';
        const age = fmtAge(m.timestamp);
        return (
          <div className={`vital ${age.stale ? 'is-stale' : ''}`} key={`${def.source}:${def.metric}`}>
            <VitalLabel m={m} label={def.label} />
            <span className="value">
              <CountUp value={m.value} />
            </span>
            <span className={`delta ${deltaCls}`}>
              {dw === null ? '—' : dw === 0 ? 'steady /wk' : `${dw > 0 ? '▲' : '▼'} ${fmt(Math.abs(dw))} /wk`}
            </span>
            <div className="spark-row">
              <Sparkline points={m.history.map((h) => h.value)} />
            </div>
          </div>
        );
      })}

      {v && vidMetric && (
        <div className={`vital ${fmtAge(vidMetric.timestamp).stale ? 'is-stale' : ''}`}>
          <VitalLabel m={vidMetric} label="Latest Video" />
          <span className="value">
            <CountUp value={v.views} />
          </span>
          <span className="delta">{vidPerDay !== null ? `≈${fmt(vidPerDay)} /day` : '—'}</span>
          <div className="spark-row">
            <Sparkline points={vidMetric.history.map((h) => h.value)} />
          </div>
        </div>
      )}

      {tokens && tokenPeak !== null && tokenPeak > 0 && (
        <div className={`vital ${fmtAge(tokens.timestamp).stale ? 'is-stale' : ''}`}>
          <VitalLabel m={tokens} label="Claude 5h Window" />
          <span className="value">
            <CountUp value={(tokens.value / tokenPeak) * 100} full />
            <span className="unit-pct">%</span>
          </span>
          <span className="delta">
            {fmt(tokens.value)} of {fmt(tokenPeak)} peak
          </span>
          <div className="spark-row">
            <Sparkline points={tokens.history.map((h) => h.value)} />
          </div>
        </div>
      )}
    </section>
  );
});

export default Vitals;
