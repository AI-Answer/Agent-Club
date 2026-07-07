/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './jarvis.css';

import GraphCore, { type CoreMode } from './components/GraphCore';
import ControlStatus from './components/ControlStatus';
import QuickActions from './components/QuickActions';
import SetupGuide from './components/SetupGuide';
import TopBar from './components/TopBar';
import VoiceConsole from './components/VoiceConsole';
import { useControlBridge } from './services/controlBridge';
import { HERMES_VOICE_MODEL, useVoicePipeline, type VoiceStatus } from './services/voicePipeline';

function statusToCoreMode(status: VoiceStatus): CoreMode {
  switch (status) {
    case 'listening':
      return 'listening';
    case 'speaking':
      return 'speaking';
    case 'thinking':
      return 'working';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

const JarvisPage: React.FC = () => {
  const navigate = useNavigate();
  const control = useControlBridge(true);
  const voice = useVoicePipeline(HERMES_VOICE_MODEL, { computerControlEngaged: control.engaged });
  const { status, hermesInstalled, analyser, micAnalyser, activity, speechSupported, sttBlocked, startListening, stopListening, cancelListening, stopSpeaking, sendText, recheck } = voice;

  const mode = useMemo(() => statusToCoreMode(status), [status]);

  const [rescans, setRescans] = useState(0);
  const needsSetup = !hermesInstalled && (status === 'offline' || (status === 'checking' && rescans > 0));

  const onRescan = useCallback(() => {
    setRescans((n) => n + 1);
    recheck();
  }, [recheck]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      cancelListening();
      stopSpeaking();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelListening, stopSpeaking]);

  const getLevel = useCallback((): number | null => {
    if (status === 'listening') {
      // Raw mic input reads far quieter than already-loud synthesized
      // speech on a frequency-bin average, so the orb barely moved. Use
      // time-domain RMS instead — the same metric the mic's own
      // voice-activity detector uses (VAD_SPEECH_RMS = 0.025 counts as
      // "speech"), with a gain that maps normal talking volume into a
      // visually meaningful 0..1 range.
      const an = micAnalyser;
      if (!an) return null;
      const buf = new Uint8Array(an.fftSize);
      an.getByteTimeDomainData(buf);
      let sumSq = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / buf.length);
      const MIC_GAIN = 6;
      return Math.min(1, rms * MIC_GAIN);
    }
    // Speaking: reflect Jarvis's own spoken output (already at full,
    // normalized digital volume, so a frequency-bin average reads well).
    const an = analyser;
    if (!an) return null;
    const buf = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    return sum / buf.length / 255;
  }, [analyser, micAnalyser, status]);

  useEffect(() => {
    if (!hermesInstalled || sttBlocked) return;
    const isTyping = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null;
      const tag = el?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable === true;
    };
    const down = (e: KeyboardEvent) => {
      if (voice.voiceMode || e.code !== 'Space' || e.repeat || isTyping(e.target)) return;
      e.preventDefault();
      startListening();
    };
    const up = (e: KeyboardEvent) => {
      if (voice.voiceMode || e.code !== 'Space' || isTyping(e.target)) return;
      e.preventDefault();
      stopListening();
    };
    // If the window loses focus while Space is held (alt-tab, a system
    // dialog, clicking another app), the keyup never reaches us and the mic
    // is left recording forever — the next press then lands on an already-
    // stuck capture. Force-release on blur/hide as a safety net.
    const releaseOnFocusLoss = () => stopListening();
    const onVisibilityChange = () => {
      if (document.hidden) stopListening();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', releaseOnFocusLoss);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', releaseOnFocusLoss);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [hermesInstalled, sttBlocked, startListening, stopListening, voice.voiceMode]);

  return (
    <main className='jarvis-stage'>
      <GraphCore mode={mode} bgMode='depth' getLevel={getLevel} toolActive={Boolean(activity)} />

      <div className='scrim scrim-l' aria-hidden='true' />
      <div className='scrim scrim-r' aria-hidden='true' />
      <div className='scrim scrim-b' aria-hidden='true' />
      <div className='scrim scrim-t' aria-hidden='true' />

      <div className='jarvis-topbar'>
        <TopBar mode={mode} online={hermesInstalled && status !== 'offline' && status !== 'checking'} onExit={() => navigate('/guid')} />
      </div>

      {hermesInstalled && (
        <aside className='jarvis-dock boot-stagger' style={{ animationDelay: '0.2s' }}>
          <VoiceConsole voice={voice} />
          <QuickActions onSend={sendText} disabled={status === 'offline' || status === 'checking'} />
          <ControlStatus control={control} voice={voice} />
        </aside>
      )}

      {needsSetup && (
        <div className='jarvis-setup-wrap boot-stagger' style={{ animationDelay: '0.2s' }}>
          <SetupGuide onRescan={onRescan} scanning={status === 'checking'} scannedEmpty={rescans > 0} />
        </div>
      )}

      <div className='grain' aria-hidden='true' />
    </main>
  );
};

export default JarvisPage;
