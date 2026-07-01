/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// Guards the B1 shape regression in the jarvis V.A.U.L.T. data layer.
//
// `ipcBridge.fs.getFilesByDir({ dir, root })` returns `[treeNode]` where the
// single element is the DIRECTORY itself (isDir:true) and the files live in
// `treeNode.children`. The list helpers (listJsonFiles / listEntries) MUST read
// `treeNode.children`, not treat the returned array as a flat entry list — the
// latter always yields [] and silently empties every vault panel (Documents,
// Schedule, AI Wire, CommandDeck queue, Callouts).
//
// listJsonFiles / listEntries are module-private, so they are exercised through
// the exported readers that route through them: readQueue (listJsonFiles) and
// readMorningReport (listEntries).
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';

const getFilesByDir = vi.fn<(args: { dir: string; root: string }) => Promise<IDirOrFile[]>>();
const readFile = vi.fn<(args: { path: string }) => Promise<string>>();
const getFileMetadata = vi.fn<(args: { path: string }) => Promise<{ name: string; path: string; size: number; type: string; lastModified: number }>>();
const getPath = vi.fn<(args: { name: string }) => Promise<string>>();

vi.mock('@/common', () => ({
  ipcBridge: {
    application: { getPath: { invoke: (args: { name: string }) => getPath(args) } },
    fs: {
      getFilesByDir: { invoke: (args: { dir: string; root: string }) => getFilesByDir(args) },
      readFile: { invoke: (args: { path: string }) => readFile(args) },
      getFileMetadata: { invoke: (args: { path: string }) => getFileMetadata(args) },
      writeFile: { invoke: vi.fn() },
      readFileBuffer: { invoke: vi.fn() },
    },
  },
}));

// Build a single directory tree node the way readDirectoryRecursive does:
// the array has ONE element (the dir), files are nested under `.children`.
function dirTree(dir: string, fileNames: string[]): IDirOrFile[] {
  return [
    {
      name: dir.split('/').pop() ?? dir,
      fullPath: dir,
      relativePath: '',
      isDir: true,
      isFile: false,
      children: fileNames.map((n) => ({
        name: n,
        fullPath: `${dir}/${n}`,
        relativePath: n,
        isDir: false,
        isFile: true,
      })),
    },
  ];
}

import { readQueue, readMorningReport } from '@/renderer/pages/jarvis/vault/vaultState';

beforeEach(() => {
  getPath.mockResolvedValue('/home/tester');
  getFileMetadata.mockResolvedValue({ name: 'x', path: '/x', size: 10, type: '', lastModified: 1_000 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('jarvis vault list parsing (B1 shape)', () => {
  it('readQueue (→ listJsonFiles) reads files from treeNode.children', async () => {
    getFilesByDir.mockResolvedValue(dirTree('/root/system/queue', ['a.json', 'b.json', 'note.txt']));
    readFile.mockImplementation(async ({ path }) => {
      const id = path.split('/').pop()!.replace('.json', '');
      return JSON.stringify({ id, skill: 'morning-report', ts: '2026-06-25T00:00:00Z' });
    });

    const queue = await readQueue('/root');

    // Two .json files under children → two queue entries (note.txt filtered out).
    expect(queue.map((q) => q.id).sort()).toEqual(['a', 'b']);
  });

  it('readMorningReport (→ listEntries) reads files from treeNode.children', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
    getFilesByDir.mockResolvedValue(dirTree('/root/inbox/reports/morning', [`${today}-report.md`]));
    readFile.mockResolvedValue('# Report\n\n## Headlines\n\n- First headline\n- Second headline\n');

    const report = await readMorningReport('/root');

    expect(report).not.toBeNull();
    expect(report!.heads).toContain('First headline');
    expect(report!.rel).toBe(`inbox/reports/morning/${today}-report.md`);
  });

  it('REGRESSION: the old flat-array reading would have returned nothing', async () => {
    // Simulate the broken interpretation: if the helpers treated the returned
    // array as a flat entry list, the single DIR node (isFile:false) is filtered
    // out and no files are found. Returning a tree with NO children proves the
    // current code looks at `.children`, not the array itself.
    getFilesByDir.mockResolvedValue(dirTree('/root/system/queue', []));

    const queue = await readQueue('/root');

    expect(queue).toEqual([]);
    // readFile must never be called when there are no child files.
    expect(readFile).not.toHaveBeenCalled();
  });
});
