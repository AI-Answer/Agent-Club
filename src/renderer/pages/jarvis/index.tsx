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
  const { status, hermesInstalled, analyser, speechSupported, sttBlocked, startListening, stopListening, cancelListening, stopSpeaking, sendText, recheck } = voice;

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
    const an = analyser;
    if (!an) return null;
    const buf = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    return sum / buf.length / 255;
  }, [analyser]);

  useEffect(() => {
    if (!hermesInstalled || !speechSupported || sttBlocked) return;
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
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [hermesInstalled, speechSupported, sttBlocked, startListening, stopListening, voice.voiceMode]);

  return (
    <main className='jarvis-stage'>
      <GraphCore mode={mode} bgMode='depth' getLevel={getLevel} />

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
