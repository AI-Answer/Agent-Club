/**
 * @license
 * Copyright 2025 Agent Club (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ImessagePlugin } from './ImessagePlugin';

let activePlugin: ImessagePlugin | null = null;

export function setActiveImessagePlugin(plugin: ImessagePlugin | null): void {
  activePlugin = plugin;
}

export function getActiveImessagePlugin(): ImessagePlugin | null {
  return activePlugin;
}
