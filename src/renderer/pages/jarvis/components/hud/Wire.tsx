/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// Wire (AI Wire) — today's morning-report headlines; a click opens the full
// report overlay via `onOpen`. Top 3 only (the panel sits at the viewport
// edge). Ported 1:1 from jarvis-hud components/HUD.tsx (Wire).
// ---------------------------------------------------------------------------

import React, { memo } from 'react';
import type { VaultState } from '../../vault/vaultState';
import { SectionTitle } from './helpers';

const Wire = memo(function Wire({
  state,
  onOpen,
}: {
  state: VaultState;
  onOpen: (path: string) => void;
}): React.ReactElement | null {
  const m = state.morning;
  if (!m || m.heads.length === 0) return null;
  return (
    <section className="block boot-stagger" style={{ animationDelay: '0.5s' }}>
      <SectionTitle title="AI Wire" tick="MORNING.INTEL" />
      {m.heads.slice(0, 3).map((h, i) => (
        <div className="wire-row" key={i} role="button" onClick={() => onOpen(m.rel)}>
          <span className="wire-bullet">▸</span>
          <span>{h}</span>
        </div>
      ))}
    </section>
  );
});

export default Wire;
