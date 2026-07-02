/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

describe('resolveWhisperCli', () => {
  const originalResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  let tempRoot = '';

  beforeEach(() => {
    vi.resetModules();
    tempRoot = join(os.tmpdir(), `whisper-resolver-test-${Date.now()}`);
    mkdirSync(tempRoot, { recursive: true });
  });

  afterEach(() => {
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath = originalResourcesPath;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('prefers the bundled whisper-cli binary when present', async () => {
    const runtimeKey = `${process.platform}-${process.arch}`;
    const bundledDir = join(tempRoot, 'bundled-whisper', runtimeKey);
    const binaryName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
    const bundledBinary = join(bundledDir, binaryName);
    mkdirSync(bundledDir, { recursive: true });
    writeFileSync(bundledBinary, '#!/bin/sh\necho ok\n', 'utf8');

    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath = tempRoot;

    const { resolveWhisperCli } = await import('@process/agent/whisper/binaryResolver');
    const resolution = resolveWhisperCli();

    expect(resolution).toEqual({
      binaryPath: bundledBinary,
      cwd: bundledDir,
    });
  });
});
