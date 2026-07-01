/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// Documents — recent deliverables (every ok run that produced a doc), newest
// first. Clicking a row opens the report overlay via the `onOpen` prop.
// Ported 1:1 from jarvis-hud components/HUD.tsx (Documents).
// ---------------------------------------------------------------------------

import React, { memo } from 'react';
import type { VaultState } from '../../vault/vaultState';
import { SectionTitle, fmtAge } from './helpers';

const Documents = memo(function Documents({
  state,
  hot,
  onOpen,
}: {
  state: VaultState;
  hot?: boolean;
  onOpen: (path: string) => void;
}): React.ReactElement | null {
  const docs: { path: string; skill: string; ts: string | null }[] = [];
  for (const r of state.runs) {
    if (r.status !== 'ok' || !r.deliverable_path) continue;
    if (docs.some((d) => d.path === r.deliverable_path)) continue;
    docs.push({ path: r.deliverable_path, skill: r.label ?? r.skill, ts: r.ts_completed });
    if (docs.length >= 5) break;
  }
  if (docs.length === 0) return null;
  return (
    <section className={`block boot-stagger ${hot ? 'voice-hot' : ''}`} style={{ animationDelay: '0.26s' }}>
      <SectionTitle title="Documents" tick="INBOX.TRAIL" />
      {docs.map((doc) => (
        <div className="doc-row" key={doc.path} role="button" onClick={() => onOpen(doc.path)}>
          <span className="doc-skill">{doc.skill.replace(/-/g, ' ')}</span>
          <span className="doc-age">{fmtAge(doc.ts).label}</span>
        </div>
      ))}
    </section>
  );
});

export default Documents;
