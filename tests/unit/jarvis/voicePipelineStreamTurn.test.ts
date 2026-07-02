/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { resolveTurnForStreamEvent } from '@/renderer/pages/jarvis/services/voicePipeline';

type TurnAccum = {
  text: string;
  jarvisLineId: string | null;
  spokeViaTool: boolean;
  sawFirstContent: boolean;
  turnToken: number;
};

describe('resolveTurnForStreamEvent', () => {
  it('returns the direct turn when msg_id matches', () => {
    const turns = new Map<string, TurnAccum>([
      ['client-id', { text: 'hi', jarvisLineId: null, spokeViaTool: false, sawFirstContent: false, turnToken: 1 }],
    ]);
    expect(resolveTurnForStreamEvent(turns, 'client-id')?.text).toBe('hi');
  });

  it('falls back to the latest turn when adapter msg_id differs from client start id', () => {
    const turns = new Map<string, TurnAccum>([
      ['client-id', { text: '', jarvisLineId: null, spokeViaTool: false, sawFirstContent: false, turnToken: 1 }],
    ]);
    const turn = resolveTurnForStreamEvent(turns, 'adapter-stream-id');
    expect(turn?.turnToken).toBe(1);
  });

  it('returns undefined when no turns exist', () => {
    expect(resolveTurnForStreamEvent(new Map(), 'missing')).toBeUndefined();
  });
});
