/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PeekabooDesktopControlPermissionGate } from '@/common/types/peekaboo';
import type { ControlBridge } from '../services/controlBridge';
import type { VoicePipeline } from '../services/voicePipeline';
import { JARVIS_COLORS, withAlpha } from './theme';

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

const EngageToggle: React.FC<{ engaged: boolean; disabled?: boolean; label: string; onClick: () => void }> = ({ engaged, disabled, label, onClick }) => {
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
      {label.toUpperCase()}
    </button>
  );
};

interface ControlStatusProps {
  control: ControlBridge;
  voice: VoicePipeline;
}

const ControlStatus: React.FC<ControlStatusProps> = ({ control, voice }) => {
  const { t } = useTranslation();
  const { engaged, setEngaged, permissions, error, requesting, requestPermissions, openPermissionSettings } = control;
  const { hermesInstalled, status, sessionMcpCount } = voice;

  const hermes = useMemo<{ tone: Tone; value: string }>(() => {
    if (status === 'checking') return { tone: 'wait', value: 'PROBING' };
    if (!hermesInstalled) return { tone: 'off', value: 'OFFLINE' };
    return { tone: 'ok', value: 'LINKED' };
  }, [status, hermesInstalled]);

  const wire = useMemo<{ tone: Tone; value: string; pulse: boolean }>(() => {
    if (!hermesInstalled) return { tone: 'off', value: 'STANDBY', pulse: false };
    if (status === 'checking') return { tone: 'pending', value: 'SYNCING', pulse: true };
    return { tone: 'ok', value: `${sessionMcpCount} IN SESSION`, pulse: false };
  }, [hermesInstalled, sessionMcpCount, status]);

  const acc = permissions?.accessibility;
  const scr = permissions?.screenRecording;
  const sessionBusy = status === 'checking';

  return (
    <div className='flex flex-col gap-9px rounded-12px border border-[#00e5ff]/25 bg-[#00e5ff]/4 px-14px py-12px'>
      <div className='flex items-center justify-between'>
        <span className='font-mono text-10px font-600 tracking-[0.24em] text-[#7fdfff]'>TOOLS // CONTROL</span>
        <span
          className='font-mono text-8px font-600 tracking-[0.18em]'
          style={{ color: engaged ? JARVIS_COLORS.danger : withAlpha('#7fdfff', 0.5) }}
        >
          {engaged ? 'COMPUTER-USE ARMED' : 'COMPUTER-USE DISARMED'}
        </span>
      </div>

      <div className='flex flex-col gap-7px rounded-8px border border-[#00e5ff]/15 bg-[#03060f]/60 px-10px py-9px'>
        <Row label='HERMES' value={hermes.value} tone={hermes.tone} pulse={hermes.tone === 'wait'} />
        <Row label='MCP SESSION' value={wire.value} tone={wire.tone} pulse={wire.pulse} />

        <Row label='ACCESSIBILITY' value={gateValue(acc)} tone={gateTone(acc)}>
          {acc && acc.supported && acc.granted !== true ? (
            <GrantButton label={t('jarvis.control.grant').toUpperCase()} disabled={requesting} onClick={requestPermissions} />
          ) : null}
        </Row>

        <Row label='SCREEN REC' value={gateValue(scr)} tone={gateTone(scr)}>
          {scr && scr.supported && scr.granted !== true ? (
            <GrantButton label={t('jarvis.control.grant').toUpperCase()} disabled={requesting} onClick={() => openPermissionSettings('screen_recording')} />
          ) : null}
        </Row>

        <Row label='COMPUTER CONTROL' value={sessionBusy ? 'WORKING' : engaged ? 'ARMED' : 'DISARMED'} tone={engaged ? 'off' : 'wait'} pulse={sessionBusy}>
          <EngageToggle
            engaged={engaged}
            disabled={sessionBusy || !hermesInstalled}
            label={engaged ? t('jarvis.control.disengage') : t('jarvis.control.engage')}
            onClick={() => setEngaged(!engaged)}
          />
        </Row>
      </div>

      <p className='font-mono text-8px leading-relaxed tracking-[0.06em] text-[#7fdfff]/45'>
        {!hermesInstalled ? t('jarvis.control.installHint') : engaged ? t('jarvis.control.armedHint') : t('jarvis.control.disarmedHint')}
      </p>
      {error ? <p className='font-mono text-8px tracking-[0.06em] text-[#ff8da0]/70'>{error}</p> : null}
    </div>
  );
};

export default ControlStatus;
