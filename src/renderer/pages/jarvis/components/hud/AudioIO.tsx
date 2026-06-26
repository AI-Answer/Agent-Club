/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// AudioIO — voice-link status with the 36-bar wave. Goes "live" while the core
// is speaking or listening, "cobalt" while listening. Ported 1:1 from
// jarvis-hud components/HUD.tsx (AudioIO). `mode` derives from
// voicePipeline.status in the composition.
// ---------------------------------------------------------------------------

import React, { memo } from 'react';
import type { CoreMode } from './types';
import { SectionTitle } from './helpers';

const AudioIO = memo(function AudioIO({ mode }: { mode: CoreMode }): React.ReactElement {
  const live = mode === 'speaking' || mode === 'listening';
  return (
    <section className="block boot-stagger" style={{ animationDelay: '0.42s' }}>
      <SectionTitle title="Audio I/O" tick={live ? 'TTS.LIVE' : 'TTS.STANDBY'} />
      <div className={`wave ${live ? 'live' : 'idle'} ${mode === 'listening' ? 'cobalt' : ''}`}>
        {Array.from({ length: 36 }, (_, i) => (
          <i key={i} style={{ '--i': i } as React.CSSProperties} />
        ))}
      </div>
      <div className="audio-meta">
        <span>voice link · {live ? mode : 'standby'}</span>
        <span>tap VOICE LINK to toggle · ESC to stop</span>
      </div>
    </section>
  );
});

export default AudioIO;
