/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// HUD panels barrel — presentational sub-components ported from jarvis-hud
// components/HUD.tsx, bound to the Foundation vault port (getVaultState) and
// voicePipeline. The integration phase (index.tsx) imports from here.
// ---------------------------------------------------------------------------

export { default as TopBar } from './TopBar';
export { default as Vitals } from './Vitals';
export { default as Priorities } from './Priorities';
export { default as Documents } from './Documents';
export { default as CommandDeck } from './CommandDeck';
export { default as Schedule } from './Schedule';
export { default as AudioIO } from './AudioIO';
export { default as Wire } from './Wire';
export { default as Objective } from './Objective';
export { default as Callouts, useCallouts } from './Callouts';
export type { Callout, CalloutsApi } from './Callouts';
export { default as HudPanels, statusToCoreMode } from './HudPanels';
export type { HudPanelsProps } from './HudPanels';

export { useVaultPoll } from './useVaultPoll';
export * from './helpers';
export type { CoreMode, BgMode } from './types';
export { BG_MODES } from './types';
