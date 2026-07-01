/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// JARVIS Mode — the live HUD. Composes the ported Ember theme (jarvis.css) with
// the GraphCore 3D knowledge-graph orb as the centerpiece (wired to the shared
// voicePipeline), the ported HUD panels (TopBar / Vitals / Priorities /
// Documents / CommandDeck / Schedule / AudioIO / Wire / Objective / callouts,
// all bound to getVaultState() on a 5s poll inside HudPanels), the report
// overlay, and the EXISTING Hermes brain pieces: the push-to-talk VoiceConsole,
// the ENGAGE-CONTROL toggle (ControlStatus), and MusicButton.
//
// One voicePipeline instance is owned here and shared three ways so the orb
// level, the HUD chrome mode, the deck→Hermes seam, and the voice console all
// read the same Hermes conversation. GraphCore writes --accent-h to
// :root every frame, which tints all the Ember chrome.
// ---------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './jarvis.css';

import GraphCore from './components/GraphCore';
import ControlStatus from './components/ControlStatus';
import MusicButton from './components/MusicButton';
import VoiceConsole, { HERMES_VOICE_MODEL } from './components/VoiceConsole';
import { HudPanels, statusToCoreMode } from './components/hud';
import { useVoicePipeline } from './services/voicePipeline';

// Skill → spoken Hermes prompt. A deck press still drops a queue intent (the
// runner contract) AND runs the skill through the brain so its reply streams
// into the transcript / TTS. Kept terse and conversational.
const DECK_PROMPT: Record<string, string> = {
  'morning-report': 'Run the morning report and brief me on what matters today.',
  'inbox-brief': 'Give me a brief of my inbox — the highlights only.',
  'plan-today': "Plan my day. What are the top priorities right now?",
  'plan-tomorrow': 'Plan tomorrow for me based on what is outstanding.',
  'vault-cleanup': 'Run a vault cleanup pass and tell me what you tidied.',
};

const JarvisPage: React.FC = () => {
  const navigate = useNavigate();

  // Single shared pipeline (orb level + chrome mode + deck seam + console).
  const voice = useVoicePipeline(HERMES_VOICE_MODEL);
  const { status, hermesInstalled, analyser, startListening, stopListening, stopSpeaking, sendText } = voice;

  const mode = useMemo(() => statusToCoreMode(status), [status]);

  // Escape signal: bumped on every Esc press so HudPanels (which owns the report
  // overlay state) can close any open report. The HUD owns Esc — AudioIO shows
  // "ESC to stop" and ReportOverlay assumes the HUD handles Esc.
  const [escapeSignal, setEscapeSignal] = useState(0);

  // ESC: close any open report overlay + stop the voice pipeline (abort STT,
  // cancel speechSynthesis, stop the live TTS source). Cleaned up on unmount.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setEscapeSignal((n) => n + 1); // → HudPanels closes the report overlay
      stopListening();
      stopSpeaking();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stopListening, stopSpeaking]);

  // GraphCore pulls a 0..1 speech envelope while speaking; null falls back to
  // the synthetic envelope inside the orb. RMS from the pipeline AnalyserNode.
  const getLevel = useCallback((): number | null => {
    const an = analyser;
    if (!an) return null;
    const buf = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    return sum / buf.length / 255; // 0..1
  }, [analyser]);

  // Command Deck → Hermes seam (HudPanels also writes the queue intent file).
  const onDeckSendMessage = useCallback(
    (skill: string) => {
      sendText(DECK_PROMPT[skill] ?? `Run the ${skill.replace(/-/g, ' ')} skill.`);
    },
    [sendText],
  );

  // Push-to-talk: hold Space to record, release to send. Ignore repeats and
  // typing into inputs. Gated on Hermes being present and OFF while hands-free
  // voice mode is engaged (the loop owns the mic then). It remains a quick
  // one-shot alternative to the toggle.
  useEffect(() => {
    if (!hermesInstalled) return;
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
  }, [hermesInstalled, startListening, stopListening, voice.voiceMode]);

  // Utility controls (music + disengage) live in the TopBar's right cell, above
  // the clock, so they share the grid with it rather than floating on top.
  const topControls = (
    <>
      <MusicButton />
      <button type='button' className='jarvis-disengage' onClick={() => navigate('/guid')}>
        <span className='jarvis-disengage-dot' />
        DISENGAGE
      </button>
    </>
  );

  return (
    <main className='stage' style={{ zIndex: 9999 }}>
      {/* CENTERPIECE — 3D knowledge-graph orb. Writes --accent-h → tints chrome. */}
      <GraphCore mode={mode} bgMode='depth' getLevel={getLevel} />

      {/* edge scrims keep floating text legible over the orb */}
      <div className='scrim scrim-l' aria-hidden='true' />
      <div className='scrim scrim-r' aria-hidden='true' />
      <div className='scrim scrim-b' aria-hidden='true' />
      <div className='scrim scrim-t' aria-hidden='true' />

      {/* ported HUD: panels + callouts + report overlay, bound to getVaultState
          on a 5s poll. Voice status drives the chrome mode + AudioIO wave; the
          deck seam forwards skills to Hermes. */}
      <HudPanels voiceStatus={status} transcript={voice.transcript} onDeckSendMessage={onDeckSendMessage} escapeSignal={escapeSignal} topControls={topControls} />

      {/* KEPT Hermes brain UI — voice console (voice-mode toggle) + computer-
          control ENGAGE toggle. Floated bottom-left over the orb. */}
      <aside className='jarvis-hermes-dock'>
        <ControlStatus active />
        <VoiceConsole voice={voice} />
      </aside>

      {/* film grain over everything (purely atmospheric) */}
      <div className='grain' aria-hidden='true' />

      {/* layout for the kept-Hermes dock + top-right controls. Scoped here so the
          Ember theme stays untouched; uses the live --accent-h for the accent. */}
      <style>{`
        .jarvis-hermes-dock {
          position: absolute;
          left: 22px;
          bottom: 22px;
          z-index: 40;
          width: 320px;
          max-width: 34vw;
          display: flex;
          flex-direction: column;
          gap: 12px;
          pointer-events: auto;
        }
        .jarvis-disengage {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border-radius: 8px;
          border: 1px solid hsl(var(--accent-h) 60% 62% / 0.4);
          background: hsl(var(--accent-h) 60% 50% / 0.06);
          color: var(--ember-hot);
          font-family: var(--font-mono), monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.22em;
          padding: 8px 14px;
          cursor: pointer;
          transition: all 0.18s ease;
        }
        .jarvis-disengage:hover {
          background: hsl(var(--accent-h) 60% 50% / 0.16);
          color: var(--white-hot);
          box-shadow: 0 0 16px hsl(var(--accent-h) 60% 55% / 0.35);
        }
        .jarvis-disengage-dot {
          width: 5px;
          height: 5px;
          border-radius: 9999px;
          background: var(--err);
          box-shadow: 0 0 8px var(--err);
        }
      `}</style>
    </main>
  );
};

export default JarvisPage;
