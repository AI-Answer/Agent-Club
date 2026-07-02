/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  extractTtsFilePath,
  getFallbackDelayMs,
  TTS_FALLBACK_FAST_MS,
  TTS_FALLBACK_MS,
  TTS_MISS_THRESHOLD,
} from '@/renderer/pages/jarvis/services/voicePipeline';
import type { ToolCallUpdate } from '@/common/types/acpTypes';

describe('extractTtsFilePath', () => {
  it('reads output_path from rawInput', () => {
    const update = { rawInput: { output_path: '/tmp/voice.wav' }, content: [] } as ToolCallUpdate['update'];
    expect(extractTtsFilePath(update)).toBe('/tmp/voice.wav');
  });

  it('reads file_path from JSON tool result text', () => {
    const update = {
      rawInput: {},
      content: [{ content: { text: JSON.stringify({ file_path: '/tmp/out.mp3' }) } }],
    } as ToolCallUpdate['update'];
    expect(extractTtsFilePath(update)).toBe('/tmp/out.mp3');
  });

  it('matches a loose absolute audio path in plain text', () => {
    const update = {
      rawInput: {},
      content: [{ content: { text: 'saved to /Users/test/reply.ogg ok' } }],
    } as ToolCallUpdate['update'];
    expect(extractTtsFilePath(update)).toBe('/Users/test/reply.ogg');
  });

  it('returns null when no path is present', () => {
    const update = { rawInput: {}, content: [{ content: { text: 'no audio here' } }] } as ToolCallUpdate['update'];
    expect(extractTtsFilePath(update)).toBeNull();
  });
});

describe('getFallbackDelayMs', () => {
  it('uses the full wait until repeated TTS misses', () => {
    expect(getFallbackDelayMs(0)).toBe(TTS_FALLBACK_MS);
    expect(getFallbackDelayMs(TTS_MISS_THRESHOLD - 1)).toBe(TTS_FALLBACK_MS);
  });

  it('switches to the fast fallback after repeated misses', () => {
    expect(getFallbackDelayMs(TTS_MISS_THRESHOLD)).toBe(TTS_FALLBACK_FAST_MS);
    expect(getFallbackDelayMs(TTS_MISS_THRESHOLD + 3)).toBe(TTS_FALLBACK_FAST_MS);
  });
});
