/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

export type WhisperCliResolution = {
  /** Absolute path to whisper-cli (or whisper-cli.exe). */
  binaryPath: string;
  /** Working directory for subprocess (Windows needs DLL colocation). */
  cwd: string;
};

function getBinaryName(): string {
  return process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
}

function getBundledWhisperDir(): string | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (!resourcesPath) return null;
  const runtimeKey = `${process.platform}-${process.arch}`;
  return join(resourcesPath, 'bundled-whisper', runtimeKey);
}

/**
 * Resolve the whisper.cpp CLI binary.
 * Search order: bundled extraResources → system PATH.
 */
export function resolveWhisperCli(): WhisperCliResolution | null {
  const binaryName = getBinaryName();
  const bundledDir = getBundledWhisperDir();
  if (bundledDir) {
    const bundledBinary = join(bundledDir, binaryName);
    if (existsSync(bundledBinary)) {
      return { binaryPath: bundledBinary, cwd: bundledDir };
    }
  }

  try {
    const cmd = process.platform === 'win32' ? 'where whisper-cli' : 'which whisper-cli';
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim().split(/\r?\n/)[0];
    if (result && existsSync(result)) {
      return { binaryPath: result, cwd: join(result, '..') };
    }
  } catch {
    // not on PATH
  }

  return null;
}

export function isWhisperCliAvailable(): boolean {
  return resolveWhisperCli() !== null;
}
