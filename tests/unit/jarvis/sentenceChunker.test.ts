/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { extractSentences, flushSentenceBuffer, sanitizeForSpeech } from '@/renderer/utils/speech/sentenceChunker';

describe('extractSentences', () => {
  it('peels complete sentences and keeps the unfinished remainder', () => {
    const { sentences, rest } = extractSentences('First sentence. Second one! And a trailing fragm');
    expect(sentences).toEqual(['First sentence.', 'Second one!']);
    expect(rest).toBe('And a trailing fragm');
  });

  it('does not cut at punctuation that ends the buffer mid-stream', () => {
    // "3." might be the start of "3.5" still streaming in
    const { sentences, rest } = extractSentences('The answer is 3.');
    expect(sentences).toEqual([]);
    expect(rest).toBe('The answer is 3.');
  });

  it('keeps decimal numbers intact', () => {
    const { sentences, rest } = extractSentences('Version 3.5 is out. More coming');
    expect(sentences).toEqual(['Version 3.5 is out.']);
    expect(rest).toBe('More coming');
  });

  it('treats newlines as boundaries even at the end of the buffer', () => {
    const { sentences, rest } = extractSentences('Line one\nLine two\n');
    expect(sentences).toEqual(['Line one', 'Line two']);
    expect(rest).toBe('');
  });

  it('returns everything as rest when no boundary exists', () => {
    const { sentences, rest } = extractSentences('still streaming without any boundary');
    expect(sentences).toEqual([]);
    expect(rest).toBe('still streaming without any boundary');
  });
});

describe('sanitizeForSpeech', () => {
  it('strips markdown emphasis, bullets, and links', () => {
    expect(sanitizeForSpeech('**Bold** and a [link](https://example.com) here.')).toBe('Bold and a link here.');
    expect(sanitizeForSpeech('- item one')).toBe('item one');
  });

  it('drops bare URLs and inline code markers', () => {
    expect(sanitizeForSpeech('See https://example.com/docs and `npm run dev`.')).toBe('See and npm run dev.');
  });
});

describe('flushSentenceBuffer', () => {
  it('returns the remainder as a final utterance', () => {
    expect(flushSentenceBuffer('and one last thing')).toEqual(['and one last thing']);
  });

  it('returns nothing for whitespace or markdown-only remainders', () => {
    expect(flushSentenceBuffer('   ')).toEqual([]);
    expect(flushSentenceBuffer('**')).toEqual([]);
  });
});
