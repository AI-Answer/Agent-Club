/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// Shared HUD types — ported from jarvis-hud components/GraphCore.tsx so the
// presentational panels (TopBar, AudioIO, callouts) don't depend on the orb
// component. The integration phase (index.tsx) owns the actual GraphCore and
// maps voicePipeline.status → CoreMode.
// ---------------------------------------------------------------------------

/** Orb / core visual mode the HUD chrome reacts to. */
export type CoreMode = 'idle' | 'working' | 'listening' | 'speaking' | 'error';

/** Background field mode (kept for parity; integration cycles it with `b`). */
export type BgMode = 'flat' | 'depth' | 'grid' | 'nebula';

export const BG_MODES: BgMode[] = ['flat', 'depth', 'grid', 'nebula'];
