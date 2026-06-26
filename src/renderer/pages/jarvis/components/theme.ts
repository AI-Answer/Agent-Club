/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared visual tokens for the JARVIS HUD. Centralised so the whole
 * command-center keeps a coherent cyan/teal sci-fi palette and so colors
 * can be re-themed in one place later.
 */
export const JARVIS_COLORS = {
  bg: '#03060f',
  cyan: '#00e5ff',
  cyanBright: '#18ffff',
  cyanDim: '#0af',
  teal: '#0fd9c8',
  amber: '#ffb547',
  danger: '#ff5470',
} as const;

/**
 * JARVIS music source.
 * - `JARVIS_MUSIC_URL`: external link opened by default (master can't be bundled
 *   for copyright reasons, so we point at the track on YouTube).
 * - `JARVIS_MUSIC_FILE`: optional local/remote audio path. When non-empty, the
 *   music button plays it in-HUD with a Web Audio visualizer instead of opening
 *   the external URL.
 */
export const JARVIS_MUSIC_URL = 'https://www.youtube.com/results?search_query=acdc+thunderstruck';
export const JARVIS_MUSIC_FILE = '';

/** rgba helper for canvas + inline styles (hex is #rrggbb). */
export const withAlpha = (hex: string, alpha: number): string => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
