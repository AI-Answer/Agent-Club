/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Incremental sentence extraction for streaming TTS: as reply text streams in,
 * complete sentences are peeled off and spoken immediately while the remainder
 * keeps accumulating. Also strips markdown tokens that read badly out loud.
 */

/** Minimum characters before a boundary counts as a speakable sentence. */
const MIN_SENTENCE_CHARS = 2;

/** Strip markdown chrome that text-to-speech would read literally. */
export function sanitizeForSpeech(text: string): string {
  return (
    text
      // fenced/inline code markers (keep the content)
      .replace(/```[a-z]*\n?/gi, ' ')
      .replace(/`([^`]*)`/g, '$1')
      // links: [label](url) → label
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // bare URLs are noise when spoken
      .replace(/https?:\/\/\S+/g, '')
      // emphasis / headings / list bullets
      .replace(/[*_#>]+/g, ' ')
      .replace(/^\s*[-•]\s+/gm, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

export type SentenceExtraction = {
  /** Complete sentences ready to speak, sanitized. */
  sentences: string[];
  /** Unfinished remainder to keep buffering (NOT sanitized). */
  rest: string;
};

/**
 * Pull complete sentences off the front of `buffer`. A sentence ends at
 * `.`, `!`, `?`, `…`, `:` or a newline, keeping trailing quotes/brackets with
 * it. Decimal numbers ("3.5") and short abbreviation fragments are kept in the
 * buffer until a real boundary arrives.
 */
export function extractSentences(buffer: string): SentenceExtraction {
  const sentences: string[] = [];
  let rest = buffer;

  // newline is always a boundary (list items, paragraph breaks)
  // sentence punctuation must be followed by whitespace/EOL to avoid "3.5"
  const boundary = /([.!?…:]+["')\]]*)(\s+|$)|\n+/g;

  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = boundary.exec(rest)) !== null) {
    // punctuation at the very end of the buffer may still be mid-stream
    // (e.g. "3." awaiting "5"); only cut when whitespace follows or it's \n.
    const endsBuffer = match.index + match[0].length >= rest.length;
    const isNewlineCut = match[0].includes('\n');
    if (endsBuffer && !isNewlineCut) break;

    const cut = match.index + match[0].length;
    const raw = rest.slice(consumed, cut);
    consumed = cut;
    const clean = sanitizeForSpeech(raw);
    if (clean.length >= MIN_SENTENCE_CHARS) sentences.push(clean);
  }

  rest = rest.slice(consumed);
  return { sentences, rest };
}

/** Flush whatever remains in the buffer as a final utterance. */
export function flushSentenceBuffer(buffer: string): string[] {
  const clean = sanitizeForSpeech(buffer);
  return clean.length >= MIN_SENTENCE_CHARS ? [clean] : [];
}
