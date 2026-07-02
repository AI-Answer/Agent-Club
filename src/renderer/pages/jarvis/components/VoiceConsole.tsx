/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { VoicePipeline, VoiceStatus } from '../services/voicePipeline';
import { JARVIS_COLORS, withAlpha } from './theme';

const VOICE_SETTINGS_ROUTE = '/settings/capabilities?tab=tools';
/** Pointer hold longer than this starts push-to-talk; shorter release toggles hands-free. */
const HOLD_THRESHOLD_MS = 280;

type MicVisualState = 'disabled' | 'idle' | 'handsFree' | 'ptt' | 'busy';

function micVisualState(status: VoiceStatus, voiceMode: boolean, micUsable: boolean, pttActive: boolean): MicVisualState {
  if (!micUsable || status === 'checking' || status === 'offline') return 'disabled';
  if (voiceMode) return 'handsFree';
  if (pttActive || status === 'listening') return 'ptt';
  if (status === 'thinking' || status === 'speaking') return 'busy';
  return 'idle';
}

const VoiceMicControl: React.FC<{
  voice: VoicePipeline;
  micUsable: boolean;
}> = ({ voice, micUsable }) => {
  const { t } = useTranslation();
  const { status, voiceMode, toggleVoiceMode, startListening, stopListening } = voice;
  const [pttActive, setPttActive] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerDownAtRef = useRef(0);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const visual = micVisualState(status, voiceMode, micUsable, pttActive);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!micUsable || voiceMode) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      pointerDownAtRef.current = Date.now();
      clearHoldTimer();
      holdTimerRef.current = setTimeout(() => {
        setPttActive(true);
        startListening();
      }, HOLD_THRESHOLD_MS);
    },
    [clearHoldTimer, micUsable, startListening, voiceMode]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!micUsable) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* capture may already be released */
      }
      clearHoldTimer();

      if (voiceMode) {
        return;
      }

      if (pttActive) {
        setPttActive(false);
        stopListening();
        return;
      }

      const elapsed = Date.now() - pointerDownAtRef.current;
      if (elapsed < HOLD_THRESHOLD_MS && status === 'idle') {
        toggleVoiceMode();
      }
    },
    [clearHoldTimer, micUsable, status, stopListening, toggleVoiceMode, voiceMode]
  );

  const onPointerCancel = useCallback(() => {
    clearHoldTimer();
    if (pttActive) {
      setPttActive(false);
      stopListening();
    }
  }, [clearHoldTimer, pttActive, stopListening]);

  useEffect(() => () => clearHoldTimer(), [clearHoldTimer]);

  useEffect(() => {
    if (status !== 'listening' && pttActive) setPttActive(false);
  }, [pttActive, status]);

  const label = useMemo(() => {
    switch (visual) {
      case 'handsFree':
        return t('jarvis.console.micHandsFreeActive');
      case 'ptt':
        return t('jarvis.console.micRelease');
      case 'busy':
        return t('jarvis.console.micHoldInterrupt');
      case 'disabled':
        return t('jarvis.console.micUnavailable');
      default:
        return t('jarvis.console.micIdle');
    }
  }, [t, visual]);

  const hint = useMemo(() => {
    if (!micUsable) return null;
    if (voiceMode) return t('jarvis.console.hintHandsFree');
    if (visual === 'ptt') return t('jarvis.console.hintPtt');
    if (visual === 'busy') return t('jarvis.console.hintBusy');
    return t('jarvis.console.hintIdle');
  }, [micUsable, t, visual, voiceMode]);

  const cyan = JARVIS_COLORS.cyan;
  const isActive = visual === 'handsFree' || visual === 'ptt';

  return (
    <div className='flex flex-col items-center gap-10px'>
      <button
        type='button'
        disabled={visual === 'disabled'}
        className={`voice-mic-btn ${isActive ? 'is-active' : ''} ${visual === 'ptt' ? 'is-ptt' : ''} ${visual === 'busy' ? 'is-busy' : ''}`}
        aria-pressed={voiceMode || visual === 'ptt'}
        aria-label={label}
        onPointerDown={voiceMode ? undefined : onPointerDown}
        onPointerUp={voiceMode ? undefined : onPointerUp}
        onPointerCancel={voiceMode ? undefined : onPointerCancel}
        onClick={voiceMode ? () => toggleVoiceMode() : undefined}
        style={{
          borderColor: isActive ? withAlpha(cyan, 0.85) : withAlpha(cyan, 0.45),
          boxShadow: isActive ? `0 0 28px ${withAlpha(cyan, 0.45)}` : 'none',
        }}
      >
        <span className='voice-mic-icon' aria-hidden='true' />
      </button>
      <p className='text-center font-mono text-10px font-600 tracking-[0.14em]' style={{ color: isActive ? JARVIS_COLORS.cyanBright : '#7fdfff' }}>
        {label.toUpperCase()}
      </p>
      {hint && <p className='text-center font-mono text-9px leading-relaxed tracking-[0.06em] text-[#7fdfff]/45'>{hint}</p>}
    </div>
  );
};

const VoiceConsoleView: React.FC<{ voice: VoicePipeline }> = ({ voice }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, transcript, level, error, speechSupported, sttEngine, sttBlocked, voiceMode, sendText } = voice;
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement | null>(null);

  const statusLabel: Record<string, string> = {
    checking: t('jarvis.status.checking'),
    offline: t('jarvis.status.offline'),
    idle: t('jarvis.status.idle'),
    listening: t('jarvis.status.listening'),
    thinking: t('jarvis.status.thinking'),
    speaking: t('jarvis.status.speaking'),
    error: t('jarvis.status.error'),
  };

  const pulse = useMemo(() => {
    if (status === 'speaking') return 0.35 + level * 0.65;
    if (status === 'listening') return 0.5;
    return 0.15;
  }, [status, level]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript]);

  const cyan = JARVIS_COLORS.cyan;
  const listening = status === 'listening';
  const micUsable = speechSupported && !sttBlocked;
  const composerDisabled = status === 'offline' || status === 'checking';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sendText(draft)) setDraft('');
  };

  const emptyHint = listening
    ? t('jarvis.console.emptyListening')
    : voiceMode
      ? t('jarvis.console.emptyVoiceMode')
      : t('jarvis.console.emptyIdle');

  return (
    <div className='flex flex-col gap-12px rounded-12px border border-[#00e5ff]/25 bg-[#03060f]/70 px-16px py-14px'>
      <div className='flex items-center justify-between'>
        <span className='font-mono text-10px font-600 tracking-[0.24em] text-[#7fdfff]'>
          {t('jarvis.console.title').toUpperCase()} // {(statusLabel[status] ?? status).toUpperCase()}
        </span>
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

      <div ref={logRef} role='log' aria-live='polite' className='max-h-180px min-h-64px overflow-y-auto rounded-8px border border-[#00e5ff]/15 bg-[#03060f]/60 px-12px py-10px'>
        {transcript.length === 0 ? (
          <p className='font-mono text-10px tracking-[0.08em] text-[#7fdfff]/40'>{emptyHint}</p>
        ) : (
          <div className='flex flex-col gap-6px'>
            {transcript.map((line) => (
              <div key={line.id} className='flex gap-8px'>
                <span className='shrink-0 font-mono text-9px font-600 tracking-[0.18em]' style={{ color: line.role === 'user' ? withAlpha(JARVIS_COLORS.amber, 0.85) : withAlpha(cyan, 0.85) }}>
                  {(line.role === 'user' ? t('jarvis.console.you') : t('jarvis.console.agent')).toUpperCase()}
                </span>
                <span className='font-mono text-10px leading-snug tracking-[0.03em]' style={{ color: line.final ? '#d6f6ff' : withAlpha('#d6f6ff', 0.55) }}>
                  {line.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {micUsable && <VoiceMicControl voice={voice} micUsable={micUsable} />}

      <form onSubmit={submit} className='flex items-center gap-8px border-t border-[#00e5ff]/12 pt-12px'>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('jarvis.console.inputPlaceholder')}
          className='min-w-0 flex-1 rounded-8px border border-[#00e5ff]/20 bg-[#03060f]/70 px-10px py-8px font-mono text-10px tracking-[0.04em] text-[#d6f6ff] outline-none placeholder:text-[#7fdfff]/35 focus:border-[#00e5ff]/50'
        />
        <button
          type='submit'
          disabled={!draft.trim() || composerDisabled}
          className='shrink-0 rounded-8px border px-12px py-8px font-mono text-9px font-700 tracking-[0.18em] transition-all'
          style={{
            cursor: !draft.trim() || composerDisabled ? 'not-allowed' : 'pointer',
            opacity: !draft.trim() || composerDisabled ? 0.4 : 1,
            borderColor: withAlpha(cyan, 0.5),
            background: withAlpha(cyan, 0.08),
            color: '#7fdfff',
          }}
        >
          {t('jarvis.console.send').toUpperCase()}
        </button>
      </form>

      {sttBlocked && <p className='font-mono text-9px leading-relaxed tracking-[0.06em] text-[#ffb547]/80'>{t('jarvis.console.sttBlocked')}</p>}
      {!speechSupported && <p className='font-mono text-9px leading-relaxed tracking-[0.06em] text-[#ffb547]/80'>{t('jarvis.console.speechUnsupported')}</p>}
      {sttEngine !== 'recorder' && (
        <div className='flex flex-col gap-6px'>
          {!sttBlocked && speechSupported && <p className='font-mono text-9px leading-relaxed tracking-[0.06em] text-[#ffb547]/80'>{t('jarvis.console.enableSttHint')}</p>}
          <button
            type='button'
            onClick={() => navigate(VOICE_SETTINGS_ROUTE)}
            className='w-fit rounded-6px border px-10px py-6px font-mono text-9px font-700 tracking-[0.16em] transition-all'
            style={{
              cursor: 'pointer',
              borderColor: withAlpha(JARVIS_COLORS.amber, 0.55),
              background: withAlpha(JARVIS_COLORS.amber, 0.08),
              color: JARVIS_COLORS.amber,
            }}
          >
            {t('jarvis.console.openVoiceSettings').toUpperCase()}
          </button>
        </div>
      )}
      {error && status !== 'offline' && <p className='font-mono text-9px tracking-[0.06em] text-[#ff8da0]/70'>{error}</p>}
    </div>
  );
};

interface VoiceConsoleProps {
  voice: VoicePipeline;
}

const VoiceConsole: React.FC<VoiceConsoleProps> = ({ voice }) => <VoiceConsoleView voice={voice} />;

export default VoiceConsole;
