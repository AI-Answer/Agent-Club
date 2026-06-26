/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// TopBar — wordmark, core-mode chip, link/runner status, live clock.
// Ported 1:1 from jarvis-hud components/HUD.tsx (TopBar). Presentational;
// `state`/`online`/`mode` are supplied by the composition.
// ---------------------------------------------------------------------------

import React from 'react';
import type { VaultState } from '../../vault/vaultState';
import type { CoreMode } from './types';
import { useClock } from './helpers';

export default function TopBar({
  state,
  online,
  mode,
}: {
  state: VaultState | null;
  online: boolean;
  mode: CoreMode;
}): React.ReactElement {
  const now = useClock();
  const r = state?.runner;
  return (
    <header className="topbar hud-top boot-stagger" style={{ animationDelay: '0.05s' }}>
      <div className="wordmark">
        <span className="name">V.A.U.L.T.</span>
        <span className="expansion">Voice-Activated Unified Logic Terminal</span>
      </div>
      <div className="status-line">
        <span className={`mode-chip mode-${mode}`}>
          <i className="status-dot" /> core · {mode}
        </span>
        <span className={`chip ${online ? 'on' : 'dead'}`}>{online ? 'link · online' : 'link · LOST'}</span>
        <span className={`chip ${r?.alive ? 'on' : 'dead'}`}>runner · {r?.alive ? 'alive' : 'down'}</span>
      </div>
      <div className="clock-wrap">
        <div className="clock">
          {now ? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` : '--:--'}
          <span className="sec">{now ? `:${String(now.getSeconds()).padStart(2, '0')}` : ''}</span>
        </div>
        <div className="clock-date">
          {now
            ? `${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][now.getDay()]} · ${
                ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][now.getMonth()]
              } ${now.getDate()}`
            : ''}
        </div>
      </div>
    </header>
  );
}
