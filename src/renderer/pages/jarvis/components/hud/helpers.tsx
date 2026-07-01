/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// Shared HUD helpers — ported 1:1 from jarvis-hud components/HUD.tsx.
// Pure presentational utilities + the CountUp / Sparkline / SectionTitle
// primitives every panel reuses. No data fetching here.
// ---------------------------------------------------------------------------

import React, { useEffect, useRef, useState } from 'react';
import type { Metric } from '../../vault/vaultState';

export function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(n) >= 10_000) return Math.round(n / 1000) + 'K';
  if (Math.abs(n) >= 1_000) return (n / 1000).toFixed(1) + 'K';
  return String(Math.round(n));
}

export function fmtFull(n: number): string {
  return n.toLocaleString('en-US');
}

export function useClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function findMetric(metrics: Metric[], source: string, metric: string): Metric | null {
  return metrics.find((m) => m.source === source && m.metric === metric) ?? null;
}

// relative age of an ISO timestamp; stale = older than two missed 6h pulls
export function fmtAge(ts: string | null): { label: string; stale: boolean } {
  if (!ts) return { label: '—', stale: true };
  const ms = Date.now() - Date.parse(ts);
  if (Number.isNaN(ms)) return { label: '—', stale: true };
  const stale = ms > 13 * 3600 * 1000;
  const m = Math.floor(ms / 60000);
  if (m < 1) return { label: 'now', stale };
  if (m < 60) return { label: `${m}m`, stale };
  const h = Math.floor(m / 60);
  if (h < 48) return { label: `${h}h`, stale };
  return { label: `${Math.floor(h / 24)}d`, stale };
}

export function fmtDur(s: number): string {
  if (s < 100) return `${s}s`;
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
}

// task callouts speak stopwatch ("0:42") — fmtDur is for completed-run feed lines
export function fmtClock(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function noteAgeDays(date: string): number {
  const ms = Date.now() - Date.parse(`${date}T12:00:00`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function parseHHMM(t: string): number {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : -1;
}

export function nowHHMMSS(): string {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':');
}

// animated count-up
export function CountUp({ value, full = false }: { value: number; full?: boolean }): React.ReactElement {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    if (from === value) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const dur = 1400;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      setDisplay(from + (value - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{full ? fmtFull(Math.round(display)) : fmt(display)}</>;
}

// inline sparkline from metric history — real data, no fake bars
export function Sparkline({ points }: { points: number[] }): React.ReactElement {
  if (points.length < 2) return <div className="spark spark-flat" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const W = 100;
  const H = 16;
  const path = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * W;
      const y = H - 2 - ((v - min) / range) * (H - 4);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = points[points.length - 1];
  const lastY = H - 2 - ((last - min) / range) * (H - 4);
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      <circle cx={W} cy={lastY} r="1.8" fill="currentColor" />
    </svg>
  );
}

// section heading — typographic, no box
export function SectionTitle({ title, tick, href }: { title: string; tick?: string; href?: string }): React.ReactElement {
  return (
    <div className="sec-title">
      {href ? (
        <a className="sec-link" href={href} target="_blank" rel="noreferrer">
          {title} ↗
        </a>
      ) : (
        <span>{title}</span>
      )}
      {tick && <span className="tick">{tick}</span>}
    </div>
  );
}
