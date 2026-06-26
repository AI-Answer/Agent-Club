/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { openExternalUrl } from '@/renderer/utils/platform';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { JARVIS_COLORS, JARVIS_MUSIC_FILE, JARVIS_MUSIC_URL } from './theme';

/**
 * Themed music control for the JARVIS HUD.
 *
 * Default (no local file): clicking opens the AC/DC track externally via the
 * app's `openExternalUrl` helper (shell.openExternal in Electron, window.open on
 * the web).
 *
 * With a local file (`JARVIS_MUSIC_FILE` non-empty): clicking toggles in-app
 * playback through an HTML5 Audio element wired into Web Audio
 * (AudioContext -> MediaElementSource -> AnalyserNode -> destination) and drives
 * a small canvas bar visualizer from `analyser.getByteFrequencyData()`. The
 * AudioContext, audio element and rAF loop are torn down on unmount/stop.
 */
const MusicButton: React.FC = () => {
  const hasLocalFile = JARVIS_MUSIC_FILE.trim().length > 0;

  const [playing, setPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /** Stop the rAF visualizer loop. */
  const stopViz = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /** Render one frame of the bar visualizer from analyser FFT data. */
  const drawViz = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const bins = analyser.frequencyBinCount;
    const data = new Uint8Array(bins);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const { width, height } = canvas;
      ctx2d.clearRect(0, 0, width, height);

      const bars = 20;
      const step = Math.floor(bins / bars) || 1;
      const gap = 2;
      const barW = (width - gap * (bars - 1)) / bars;

      for (let i = 0; i < bars; i++) {
        const v = data[i * step] / 255; // 0..1
        const h = Math.max(1, v * height);
        const x = i * (barW + gap);
        const grad = ctx2d.createLinearGradient(0, height, 0, height - h);
        grad.addColorStop(0, JARVIS_COLORS.cyanDim);
        grad.addColorStop(1, JARVIS_COLORS.cyanBright);
        ctx2d.fillStyle = grad;
        ctx2d.fillRect(x, height - h, barW, h);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  /** Lazily build the Web Audio graph around the <audio> element. */
  const ensureGraph = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (ctxRef.current) return;

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    analyser.connect(ctx.destination);

    ctxRef.current = ctx;
    analyserRef.current = analyser;
  }, []);

  const toggleLocal = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      stopViz();
      setPlaying(false);
      return;
    }

    ensureGraph();
    void ctxRef.current?.resume();
    void audio
      .play()
      .then(() => {
        setPlaying(true);
        drawViz();
      })
      .catch((err) => {
        // Playback can be rejected (autoplay policy / missing file); fail soft.
        console.error('[jarvis] music playback failed', err);
        setPlaying(false);
      });
  }, [playing, ensureGraph, drawViz, stopViz]);

  const handleClick = useCallback(() => {
    if (hasLocalFile) {
      toggleLocal();
    } else {
      openExternalUrl(JARVIS_MUSIC_URL).catch((err) => console.error('[jarvis] open music url failed', err));
    }
  }, [hasLocalFile, toggleLocal]);

  // Teardown on unmount: cancel rAF, pause audio, close context.
  useEffect(() => {
    return () => {
      stopViz();
      audioRef.current?.pause();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== 'closed') void ctx.close();
      ctxRef.current = null;
      analyserRef.current = null;
    };
  }, [stopViz]);

  const label = hasLocalFile ? (playing ? 'STAND DOWN' : 'POWER UP') : 'POWER UP';

  return (
    <div className='flex items-center gap-8px'>
      {hasLocalFile && playing && <canvas ref={canvasRef} width={72} height={20} className='rounded-2px' aria-hidden='true' />}

      <button
        type='button'
        onClick={handleClick}
        aria-pressed={hasLocalFile ? playing : undefined}
        title={hasLocalFile ? 'Toggle JARVIS soundtrack' : 'Open JARVIS soundtrack'}
        className={`flex items-center gap-6px rounded-8px border px-12px py-8px text-11px font-600 tracking-[0.2em] cursor-pointer transition-all ${playing ? 'border-[#18ffff]/60 bg-[#00e5ff]/15 text-[#18ffff] shadow-[0_0_16px_rgba(0,229,255,0.5)]' : 'border-[#00e5ff]/40 bg-[#00e5ff]/5 text-[#7fdfff] hover:bg-[#00e5ff]/15 hover:text-[#18ffff] hover:shadow-[0_0_16px_rgba(0,229,255,0.4)]'}`}
      >
        <span className={`text-13px leading-none ${playing ? 'animate-pulse' : ''}`}>♪</span>
        {label}
      </button>

      {hasLocalFile && (
        // crossOrigin lets MediaElementSource read remote streams without tainting.
        <audio ref={audioRef} src={JARVIS_MUSIC_FILE} crossOrigin='anonymous' preload='none' onEnded={() => setPlaying(false)} className='hidden' />
      )}
    </div>
  );
};

export default MusicButton;
