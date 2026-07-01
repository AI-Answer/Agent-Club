/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import { chmodSync, existsSync } from 'fs';
import path from 'path';

const PEEKABOO_PACKAGE_ROOT = path.join('node_modules', '@steipete', 'peekaboo');
const DEFAULT_MCP_ARGS = ['mcp', 'serve'];
const SIGNAL_EXIT_CODES: Partial<Record<NodeJS.Signals, number>> = {
  SIGINT: 130,
  SIGTERM: 143,
};

const resolvePeekabooRoot = (): string => {
  const candidates: string[] = [];

  try {
    candidates.push(path.dirname(require.resolve('@steipete/peekaboo/package.json')));
  } catch {
    // Bundled Electron builds resolve from app.asar.unpacked instead.
  }

  candidates.push(path.resolve(__dirname, '..', '..', PEEKABOO_PACKAGE_ROOT));
  candidates.push(path.resolve(process.cwd(), PEEKABOO_PACKAGE_ROOT));

  const root = candidates.find((candidate) => existsSync(path.join(candidate, 'peekaboo')));
  if (!root) {
    throw new Error(`Packaged Peekaboo binary not found. Checked: ${candidates.join(', ')}`);
  }

  return root;
};

const launchPeekaboo = (): void => {
  const root = resolvePeekabooRoot();
  const binaryPath = path.join(root, 'peekaboo');
  const args = process.argv.slice(2);
  const commandArgs = args.length > 0 ? args : DEFAULT_MCP_ARGS;

  try {
    chmodSync(binaryPath, 0o755);
  } catch {
    // Best effort; packaged installs normally preserve the executable bit.
  }

  const child = spawn(binaryPath, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      PEEKABOO_MCP_WRAPPER: 'agent-club',
    },
  });

  const forwardSignal = (signal: NodeJS.Signals) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  child.on('error', (error) => {
    console.error('[Agent Club Peekaboo] Failed to launch bundled Peekaboo:', error.message);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(SIGNAL_EXIT_CODES[signal] ?? 1);
    }
    process.exit(code ?? 0);
  });
};

try {
  launchPeekaboo();
} catch (error) {
  console.error('[Agent Club Peekaboo]', error instanceof Error ? error.message : error);
  process.exit(1);
}
