/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import type { TProviderWithModel } from '@/common/config/storage';
import { useVoicePipeline, type VoicePipeline } from '../services/voicePipeline';
import { JARVIS_COLORS, withAlpha } from './theme';

/**
 * Hermes voice console for the JARVIS HUD: a push-to-talk mic control, a live
 * transcript area, and a speaking pulse driven by the pipeline AnalyserNode.
 * When Hermes is not installed it renders a tasteful OFFLINE state instead.
 *
 * Hermes is a built-in ACP backend that owns its own auth/model, so a
 * placeholder TProviderWithModel is sufficient for conversation.create.
 */
const HERMES_VOICE_MODEL: TProviderWithModel = {
  id: 'hermes-voice',
  name: 'Hermes',
  platform: 'hermes',
  baseUrl: '',
  apiKey: '',
  useModel: 'default',
};

const statusLabel: Record<string, string> = {
  checking: 'INITIALIZING',
  offline: 'HERMES OFFLINE',
  idle: 'STANDBY',
  listening: 'LISTENING',
  thinking: 'PROCESSING',
  speaking: 'SPEAKING',
  error: 'FAULT',
};

/**
 * Presentational voice console. The integration phase (index.tsx) owns a single
 * shared voicePipeline (so the orb level, HUD chrome mode, and this console all
 * read the same Hermes conversation) and passes it in via `voice`. Rendered
 * standalone (no prop) it owns its own pipeline for backward compatibility.
 */
const VoiceConsoleView: React.FC<{ voice: VoicePipeline }> = ({ voice }) => {
  const { status, hermesInstalled, transcript, level, error, speechSupported } = voice;

  // 0..1 pulse strength; while listening, show a steady glow even pre-audio.
  const pulse = useMemo(() => {
    if (status === 'speaking') return 0.35 + level * 0.65;
    if (status === 'listening') return 0.5;
    return 0.15;
  }, [status, level]);

  const cyan = JARVIS_COLORS.cyan;

  if (!hermesInstalled && status === 'offline') {
    return (
      <div className='rounded-12px border border-[#ff5470]/40 bg-[#ff5470]/5 px-16px py-14px'>
        <div className='flex items-center gap-10px'>
          <span className='h-8px w-8px rounded-full bg-[#ff5470] shadow-[0_0_10px_#ff5470]' />
          <span className='font-mono text-11px font-600 tracking-[0.22em] text-[#ff8da0]'>HERMES OFFLINE</span>
        </div>
        <p className='mt-8px font-mono text-10px leading-relaxed tracking-[0.08em] text-[#ff8da0]/70'>install Hermes to engage voice</p>
        {error && <p className='mt-4px font-mono text-9px tracking-[0.06em] text-[#ff8da0]/50'>{error}</p>}
      </div>
    );
  }

  const micActive = status === 'listening';
  const micDisabled = status === 'checking' || !speechSupported;

  return (
    <div className='flex flex-col gap-12px rounded-12px border border-[#00e5ff]/25 bg-[#00e5ff]/4 px-16px py-14px'>
      {/* header row: status + speaking pulse */}
      <div className='flex items-center justify-between'>
        <span className='font-mono text-10px font-600 tracking-[0.24em] text-[#7fdfff]'>VOICE LINK // {statusLabel[status] ?? status.toUpperCase()}</span>
        <span
          className='h-10px w-10px rounded-full transition-all duration-75'
          style={{
            background: cyan,
            transform: `scale(${0.7 + pulse * 1.1})`,
            boxShadow: `0 0 ${4 + pulse * 22}px ${withAlpha(cyan, 0.4 + pulse * 0.6)}`,
            opacity: 0.4 + pulse * 0.6,
          }}
          aria-hidden='true'
        />
      </div>

      {/* live transcript */}
      <div className='max-h-160px min-h-64px overflow-y-auto rounded-8px border border-[#00e5ff]/15 bg-[#03060f]/60 px-12px py-10px'>
        {transcript.length === 0 ? (
          <p className='font-mono text-10px tracking-[0.08em] text-[#7fdfff]/40'>{micActive ? 'listening...' : 'hold the mic and speak'}</p>
        ) : (
          <div className='flex flex-col gap-6px'>
            {transcript.slice(-8).map((line) => (
              <div key={line.id} className='flex gap-8px'>
                <span className='shrink-0 font-mono text-9px font-600 tracking-[0.18em]' style={{ color: line.role === 'user' ? withAlpha(JARVIS_COLORS.amber, 0.85) : withAlpha(cyan, 0.85) }}>
                  {line.role === 'user' ? 'YOU' : 'JARVIS'}
                </span>
                <span className='font-mono text-10px leading-snug tracking-[0.03em]' style={{ color: line.final ? '#d6f6ff' : withAlpha('#d6f6ff', 0.55) }}>
                  {line.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* push-to-talk control */}
      <button
        type='button'
        disabled={micDisabled}
        onPointerDown={(e) => {
          e.preventDefault();
          voice.startListening();
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          voice.stopListening();
        }}
        onPointerLeave={() => {
          if (micActive) voice.stopListening();
        }}
        className='flex items-center justify-center gap-10px rounded-8px border px-16px py-10px font-mono text-11px font-600 tracking-[0.2em] transition-all'
        style={{
          cursor: micDisabled ? 'not-allowed' : 'pointer',
          opacity: micDisabled ? 0.4 : 1,
          borderColor: micActive ? withAlpha(cyan, 0.8) : withAlpha(cyan, 0.4),
          background: micActive ? withAlpha(cyan, 0.18) : withAlpha(cyan, 0.05),
          color: micActive ? JARVIS_COLORS.cyanBright : '#7fdfff',
          boxShadow: micActive ? `0 0 18px ${withAlpha(cyan, 0.5)}` : 'none',
        }}
      >
        <span
          className='h-9px w-9px rounded-full'
          style={{
            background: micActive ? JARVIS_COLORS.cyanBright : cyan,
            boxShadow: micActive ? `0 0 12px ${cyan}` : 'none',
          }}
        />
        {micActive ? 'RELEASE TO SEND' : 'HOLD TO SPEAK'}
      </button>

      {!speechSupported && <p className='font-mono text-9px tracking-[0.06em] text-[#ff8da0]/70'>speech recognition unavailable in this runtime</p>}
      {error && status !== 'offline' && <p className='font-mono text-9px tracking-[0.06em] text-[#ff8da0]/70'>{error}</p>}
    </div>
  );
};

/** Self-contained variant used when no shared pipeline is supplied. */
const SelfHostedVoiceConsole: React.FC = () => {
  const voice = useVoicePipeline(HERMES_VOICE_MODEL);
  return <VoiceConsoleView voice={voice} />;
};

interface VoiceConsoleProps {
  /** Shared pipeline from the HUD composition; omit to self-host one. */
  voice?: VoicePipeline;
}

const VoiceConsole: React.FC<VoiceConsoleProps> = ({ voice }) => (voice ? <VoiceConsoleView voice={voice} /> : <SelfHostedVoiceConsole />);

export { HERMES_VOICE_MODEL };
export default VoiceConsole;
