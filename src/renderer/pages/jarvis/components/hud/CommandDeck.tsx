/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// CommandDeck — skill buttons. In jarvis-hud each button POSTed an intent to
// /api/queue and the standalone runner executed it. Here the default action is
// the vault writeIntent() writer (drops a JSON intent into system/queue/), and
// — when the composition supplies an `onSendMessage` seam — the same click ALSO
// hands the skill to Hermes via ipcBridge.acpConversation.sendMessage. The
// integration phase decides which path is live (queue file, Hermes turn, or
// both) by passing/omitting onSendMessage and finalizing the prompt text.
//
// Ported from jarvis-hud components/HUD.tsx (CommandDeck + DECK_SKILLS); the
// fetch('/api/queue') call is the only line that changed.
// ---------------------------------------------------------------------------

import React, { memo, useState } from 'react';
import type { VaultState } from '../../vault/vaultState';
import { writeIntent } from '../../vault/vaultState';
import { SectionTitle } from './helpers';

// every skill the runner contract supported — buttons drop REAL intents.
const DECK_SKILLS: { skill: string; label: string }[] = [
  { skill: 'morning-report', label: 'AM Report' },
  { skill: 'inbox-brief', label: 'Inbox Brief' },
  { skill: 'plan-today', label: 'Plan Today' },
  { skill: 'plan-tomorrow', label: 'Plan Tmrw' },
  { skill: 'vault-cleanup', label: 'Vault Clean' },
];

const CommandDeck = memo(function CommandDeck({
  state,
  hot,
  onQueued,
  onSendMessage,
}: {
  state: VaultState | null;
  hot?: boolean;
  /** feedback line: did the intent land? */
  onQueued: (skill: string, ok: boolean) => void;
  /**
   * Integration seam — when provided, a deck press also forwards the skill to
   * Hermes (ipcBridge.acpConversation.sendMessage needs a conversation_id the
   * panels don't own, so the composition owns this). Omit it to keep the deck
   * purely a queue-file writer.
   */
  onSendMessage?: (skill: string) => void | Promise<void>;
}): React.ReactElement {
  const [cooldown, setCooldown] = useState<Record<string, boolean>>({});

  const fire = async (skill: string) => {
    if (cooldown[skill]) return;
    setCooldown((c) => ({ ...c, [skill]: true }));
    try {
      const rel = await writeIntent(skill);
      const ok = rel !== null;
      // hand to Hermes too when the seam is wired (integration finalizes this)
      if (onSendMessage) {
        try {
          await onSendMessage(skill);
        } catch {
          /* Hermes forward is best-effort; the queue write is the source of truth */
        }
      }
      onQueued(skill, ok);
    } catch {
      onQueued(skill, false);
    }
    setTimeout(() => setCooldown((c) => ({ ...c, [skill]: false })), 15000);
  };

  const r = state?.runner;
  return (
    <section className={`block boot-stagger ${hot ? 'voice-hot' : ''}`} style={{ animationDelay: '0.26s' }}>
      <SectionTitle
        title="Command Deck"
        tick={
          r
            ? `${r.busy ? 'ENGAGED' : 'IDLE'} · ${r.active}/${r.max_concurrent} ACTIVE · ${r.pending} QUEUED`
            : 'RUNNER OFFLINE'
        }
      />
      {state && state.queue.length > 0 && (
        <div className="queue-list">
          {state.queue.slice(0, 3).map((q) => (
            <span key={q.id}>▸ {q.label ?? q.skill}</span>
          ))}
          {state.queue.length > 3 && <span className="dim">+{state.queue.length - 3} more</span>}
        </div>
      )}
      <div className="deck">
        {DECK_SKILLS.map((d) => (
          <button
            key={d.skill}
            className={`deck-btn ${cooldown[d.skill] ? 'fired' : ''}`}
            onClick={() => void fire(d.skill)}
            disabled={cooldown[d.skill]}
          >
            <span className="deck-dot" />
            <span className="deck-label">{cooldown[d.skill] ? 'QUEUED' : d.label}</span>
            <span className="deck-arrow">→</span>
          </button>
        ))}
      </div>
      <div className="deck-hint">intents write to system/queue — runner executes</div>
    </section>
  );
});

export default CommandDeck;
