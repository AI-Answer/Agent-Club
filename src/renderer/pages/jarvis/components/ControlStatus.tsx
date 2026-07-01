/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import type { PeekabooDesktopControlPermissionGate } from '@/common/types/peekaboo';
import { useControlBridge } from '../services/controlBridge';
import { JARVIS_COLORS, withAlpha } from './theme';

/**
 * "TOOLS / CONTROL" HUD element. Surfaces the computer-control wiring that lets
 * a spoken Jarvis command act on screen:
 *   - Hermes link state (is the ACP agent that owns the tools present)
 *   - MCP pre-wire state (are the user's tools + Peekaboo synced to Hermes)
 *   - Peekaboo permission gates (Accessibility + Screen Recording) with GRANT
 *
 * Mounted in the HUD; the underlying hook runs the pre-wire once on activation
 * and tears down its async work on unmount.
 */

type Tone = 'ok' | 'pending' | 'off' | 'wait';

const TONE_COLOR: Record<Tone, string> = {
  ok: JARVIS_COLORS.teal,
  pending: JARVIS_COLORS.amber,
  off: JARVIS_COLORS.danger,
  wait: JARVIS_COLORS.cyanDim,
};

const Dot: React.FC<{ tone: Tone; pulse?: boolean }> = ({ tone, pulse }) => {
  const c = TONE_COLOR[tone];
  return (
    <span
      className={`h-6px w-6px shrink-0 rounded-full ${pulse ? 'animate-pulse' : ''}`}
      style={{ background: c, boxShadow: `0 0 6px ${c}` }}
      aria-hidden='true'
    />
  );
};

const Row: React.FC<{ label: string; value: string; tone: Tone; pulse?: boolean; children?: React.ReactNode }> = ({ label, value, tone, pulse, children }) => (
  <div className='flex items-center justify-between gap-8px'>
    <div className='flex min-w-0 items-center gap-7px'>
      <Dot tone={tone} pulse={pulse} />
      <span className='font-mono text-9px font-600 tracking-[0.18em] text-[#7fdfff]/80'>{label}</span>
    </div>
    <div className='flex items-center gap-8px'>
      <span className='truncate font-mono text-9px tracking-[0.1em]' style={{ color: withAlpha('#d6f6ff', 0.85) }}>
        {value}
      </span>
      {children}
    </div>
  </div>
);

const GrantButton: React.FC<{ label: string; disabled?: boolean; onClick: () => void }> = ({ label, disabled, onClick }) => (
  <button
    type='button'
    disabled={disabled}
    onClick={onClick}
    className='rounded-5px border px-7px py-2px font-mono text-8px font-700 tracking-[0.16em] transition-all'
    style={{
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      borderColor: withAlpha(JARVIS_COLORS.amber, 0.6),
      background: withAlpha(JARVIS_COLORS.amber, 0.1),
      color: JARVIS_COLORS.amber,
    }}
  >
    {label}
  </button>
);

const gateTone = (gate: PeekabooDesktopControlPermissionGate | undefined): Tone => {
  if (!gate || !gate.supported) return 'wait';
  return gate.granted === true ? 'ok' : 'pending';
};

const gateValue = (gate: PeekabooDesktopControlPermissionGate | undefined): string => {
  if (!gate) return '—';
  if (!gate.supported) return 'N/A';
  if (gate.granted === true) return 'GRANTED';
  if (gate.granted === false) return 'NEEDED';
  return 'UNKNOWN';
};

interface ControlStatusProps {
  /** Whether Jarvis Mode is active; drives the underlying pre-wire. */
  active?: boolean;
}

const EngageToggle: React.FC<{ engaged: boolean; disabled?: boolean; onClick: () => void }> = ({ engaged, disabled, onClick }) => {
  const accent = engaged ? JARVIS_COLORS.danger : JARVIS_COLORS.teal;
  return (
    <button
      type='button'
      disabled={disabled}
      onClick={onClick}
      aria-pressed={engaged}
      className='rounded-5px border px-7px py-2px font-mono text-8px font-700 tracking-[0.16em] transition-all'
      style={{
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        borderColor: withAlpha(accent, 0.6),
        background: withAlpha(accent, 0.1),
        color: accent,
      }}
    >
      {engaged ? 'DISENGAGE' : 'ENGAGE'}
    </button>
  );
};

const ControlStatus: React.FC<ControlStatusProps> = ({ active = true }) => {
  const control = useControlBridge(active);
  const { hermesInstalled, linkState, syncedCount, peekabooWired, engaged, engaging, setEngaged, permissions, error, requesting } = control;

  const hermes = useMemo<{ tone: Tone; value: string }>(() => {
    if (linkState === 'checking') return { tone: 'wait', value: 'PROBING' };
    if (!hermesInstalled) return { tone: 'off', value: 'OFFLINE' };
    return { tone: 'ok', value: 'LINKED' };
  }, [linkState, hermesInstalled]);

  const wire = useMemo<{ tone: Tone; value: string; pulse: boolean }>(() => {
    switch (linkState) {
      case 'wiring':
        return { tone: 'pending', value: 'SYNCING', pulse: true };
      case 'ready':
        return { tone: 'ok', value: `${syncedCount} SERVERS`, pulse: false };
      case 'error':
        return { tone: 'off', value: 'FAULT', pulse: false };
      case 'offline':
        return { tone: 'off', value: 'STANDBY', pulse: false };
      default:
        return { tone: 'wait', value: '—', pulse: false };
    }
  }, [linkState, syncedCount]);

  const acc = permissions?.accessibility;
  const scr = permissions?.screenRecording;

  return (
    <div className='flex flex-col gap-9px rounded-12px border border-[#00e5ff]/25 bg-[#00e5ff]/4 px-14px py-12px'>
      <div className='flex items-center justify-between'>
        <span className='font-mono text-10px font-600 tracking-[0.24em] text-[#7fdfff]'>TOOLS // CONTROL</span>
        <span
          className='font-mono text-8px font-600 tracking-[0.18em]'
          style={{ color: engaged && peekabooWired ? JARVIS_COLORS.danger : withAlpha('#7fdfff', 0.5) }}
        >
          {engaged && peekabooWired ? 'COMPUTER-USE ARMED' : 'COMPUTER-USE DISARMED'}
        </span>
      </div>

      <div className='flex flex-col gap-7px rounded-8px border border-[#00e5ff]/15 bg-[#03060f]/60 px-10px py-9px'>
        <Row label='HERMES' value={hermes.value} tone={hermes.tone} pulse={hermes.tone === 'wait'} />
        <Row label='MCP PRE-WIRE' value={wire.value} tone={wire.tone} pulse={wire.pulse} />

        <Row label='ACCESSIBILITY' value={gateValue(acc)} tone={gateTone(acc)}>
          {acc && acc.supported && acc.granted !== true ? (
            <GrantButton label='GRANT' disabled={requesting} onClick={control.requestPermissions} />
          ) : null}
        </Row>

        <Row label='SCREEN REC' value={gateValue(scr)} tone={gateTone(scr)}>
          {scr && scr.supported && scr.granted !== true ? (
            <GrantButton label='GRANT' disabled={requesting} onClick={() => control.openPermissionSettings('screen_recording')} />
          ) : null}
        </Row>

        <Row label='COMPUTER CONTROL' value={engaging ? 'WORKING' : engaged ? 'ARMED' : 'DISARMED'} tone={engaged ? 'off' : 'wait'} pulse={engaging}>
          <EngageToggle engaged={engaged} disabled={engaging || linkState === 'offline' || !hermesInstalled} onClick={() => setEngaged(!engaged)} />
        </Row>
      </div>

      <p className='font-mono text-8px leading-relaxed tracking-[0.06em] text-[#7fdfff]/45'>
        {!hermesInstalled
          ? 'install Hermes to enable spoken computer control'
          : engaged
            ? 'ARMED — spoken requests can drive the Mac via Peekaboo; disengage to disarm'
            : 'engage computer control to let spoken requests drive the Mac via Peekaboo'}
      </p>
      {error ? <p className='font-mono text-8px tracking-[0.06em] text-[#ff8da0]/70'>{error}</p> : null}
    </div>
  );
};

export default ControlStatus;
