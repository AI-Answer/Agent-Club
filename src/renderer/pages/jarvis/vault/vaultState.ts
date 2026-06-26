// ---------------------------------------------------------------------------
// V.A.U.L.T. data layer — renderer port of jarvis-hud lib/vault.ts.
//
// Reads the SAME folder-of-plain-files the source HUD read (metrics.csv,
// runner-status.json, latest-video.json, system/runs/*.json, system/queue/*.json,
// daily-notes/YYYY-MM-DD.md, inbox/reports/morning/<today>*.md). The parsing
// logic is preserved 1:1 from the source; only the I/O layer changes: Node's
// synchronous `fs` is replaced with the Electron fs-IPC bridge
// (ipcBridge.fs.{getFilesByDir,readFile,writeFile,getFileMetadata}), so every
// reader is now async.
//
// VAULT_ROOT defaults to ~/.agent-club/jarvis-vault, resolved at runtime from
// the app's home dir (application.getPath). Traversal guards from the source
// are kept verbatim.
// ---------------------------------------------------------------------------

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';

// --- config (was lib/config.ts) ---------------------------------------------

/** IANA timezone for "today" — daily notes, schedules must agree on this or
 *  dates flip near midnight UTC. */
const HUD_TZ = 'America/Chicago';

/** Vault root relative to the user's home dir. */
const VAULT_DIR_SEGMENTS = ['.agent-club', 'jarvis-vault'];

// Resolved lazily once; the home dir comes from the Electron main process.
let _vaultRoot: string | null = null;
async function vaultRoot(): Promise<string> {
  if (_vaultRoot) return _vaultRoot;
  const home = await ipcBridge.application.getPath.invoke({ name: 'home' });
  _vaultRoot = joinPath(home, ...VAULT_DIR_SEGMENTS);
  return _vaultRoot;
}

// --- path helpers (renderer has no node:path) -------------------------------
// POSIX-style joins are fine for the IPC layer; the main process normalizes.

function joinPath(...parts: string[]): string {
  return parts
    .filter((p) => p !== '')
    .join('/')
    .replace(/\/+/g, '/');
}

function basename(p: string, ext?: string): string {
  const name = p.replace(/\\/g, '/').split('/').pop() ?? '';
  return ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name;
}

// ---------------------------------------------------------------------------

export interface MetricPoint {
  timestamp: string;
  value: number;
  status: string;
}

export interface Metric {
  source: string;
  metric: string;
  value: number;
  status: string; // ok | stale | error | mock
  timestamp: string;
  history: MetricPoint[]; // oldest → newest, capped
  delta: number | null; // vs previous reading
  deltaWeek: number | null; // vs oldest point in history window (~6 days at 6h pulls)
}

export interface RunEntry {
  id: string;
  skill: string;
  /** topic tag for voice-asks ("fable 5 news") — null for named skills */
  label: string | null;
  /** external URL when the run's REAL output lives elsewhere (Gmail draft,
   *  video) — parsed from `link:` in the deliverable's frontmatter */
  link: string | null;
  status: string;
  summary: string;
  ts_completed: string | null;
  ts_started: string | null;
  duration_s: number | null;
  deliverable_path: string | null; // vault-relative md the run produced
}

export interface QueueEntry {
  id: string;
  skill: string;
  label: string | null;
  ts: string;
}

export interface RunnerStatus {
  ts: string;
  pid: number;
  version: string;
  busy: boolean;
  active: number;
  max_concurrent: number;
  pending: number;
  heartbeat_age_s: number | null;
  alive: boolean;
}

export interface LatestVideo {
  title: string;
  url: string;
  video_id: string;
  views: number;
  likes: number;
  comments: number;
  published_at: string;
  status: string;
}

export interface DailyNote {
  date: string;
  isToday: boolean;
  top3: { text: string; done: boolean }[];
  schedule: { time: string; item: string }[];
  focus: string;
}

export interface MorningReport {
  rel: string;
  heads: string[];
  /** first source URL per headline (parallel to heads; null = no link) */
  links: (string | null)[];
}

export interface VaultState {
  generated_at: string;
  vault_root: string;
  metrics: Metric[];
  runner: RunnerStatus | null;
  latestVideo: LatestVideo | null;
  daily: DailyNote | null;
  runs: RunEntry[];
  queue: QueueEntry[];
  morning: MorningReport | null;
  etas: Record<string, number>; // skill → median duration_s of past ok runs
}

const HISTORY_CAP = 24;

// --- I/O primitives (was fs.readFileSync / safeRead / safeJson) -------------

async function safeRead(p: string): Promise<string | null> {
  try {
    return await ipcBridge.fs.readFile.invoke({ path: p });
  } catch {
    return null;
  }
}

async function safeJson<T>(p: string): Promise<T | null> {
  const raw = await safeRead(p);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** mtime in ms for a single path (was fs.statSync(...).mtimeMs).
 *  `getFileMetadata` RESOLVES a stub `{ size:-1, lastModified:0 }` on stat
 *  failure rather than rejecting, so treat that as "unknown" (0) — the sort
 *  helpers below keep 0-mtime entries in stable (input) order. */
async function mtimeMs(p: string): Promise<number> {
  try {
    const meta = await ipcBridge.fs.getFileMetadata.invoke({ path: p });
    // size === -1 is the stat-failure stub; lastModified is then 0 (unknown).
    if (meta.size === -1) return 0;
    return meta.lastModified;
  } catch {
    return 0;
  }
}

/** Read the children of a vault dir. `getFilesByDir` returns `[treeNode]` where
 *  the single element is the DIRECTORY itself (isDir:true); the entries live in
 *  `treeNode.children`. Returns the flat child list, or [] if the dir is
 *  missing / empty. */
async function dirChildren(dir: string): Promise<IDirOrFile[]> {
  try {
    const tree = (await ipcBridge.fs.getFilesByDir.invoke({ dir, root: dir }))[0];
    return tree?.children ?? [];
  } catch {
    return [];
  }
}

/** Top-level `.json` file paths inside `dir` (was fs.readdirSync + filter).
 *  Returns absolute paths; empty if the dir is missing. */
async function listJsonFiles(dir: string): Promise<string[]> {
  const entries = await dirChildren(dir);
  return entries.filter((e) => e.isFile && e.name.endsWith('.json')).map((e) => e.fullPath);
}

/** Names of top-level entries in `dir` matching `pred` (was readdirSync). */
async function listEntries(dir: string): Promise<IDirOrFile[]> {
  return dirChildren(dir);
}

/** Sort a list of file paths newest-first by mtime (was sort on statSync). */
async function sortByMtimeDesc(files: string[]): Promise<string[]> {
  const withTimes = await Promise.all(files.map(async (f) => ({ f, t: await mtimeMs(f) })));
  withTimes.sort((a, b) => b.t - a.t);
  return withTimes.map((x) => x.f);
}

/** Sort oldest-first by mtime. */
async function sortByMtimeAsc(files: string[]): Promise<string[]> {
  const withTimes = await Promise.all(files.map(async (f) => ({ f, t: await mtimeMs(f) })));
  withTimes.sort((a, b) => a.t - b.t);
  return withTimes.map((x) => x.f);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const meta = await ipcBridge.fs.getFileMetadata.invoke({ path: p });
    // `getFileMetadata` resolves a stub `{ size:-1, lastModified:0 }` on stat
    // failure instead of rejecting — that means the file is MISSING. Without
    // this guard fileExists() always returned true, which made readDailyNote
    // treat today's note as present and skip the most-recent fallback.
    if (meta.size === -1 || meta.lastModified === 0) return false;
    return true;
  } catch {
    return false;
  }
}

// --- metrics.csv ------------------------------------------------------------
// schema: timestamp,source,metric,value,status,error  (append-only)
export async function readMetrics(root: string): Promise<Metric[]> {
  const raw = await safeRead(joinPath(root, 'system', 'metrics', 'metrics.csv'));
  if (!raw) return [];

  const byKey = new Map<string, { source: string; metric: string; points: MetricPoint[] }>();

  const lines = raw.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length < 5) continue;
    const [timestamp, source, metric, valueStr, status] = cols;
    const value = parseFloat(valueStr);
    if (Number.isNaN(value)) continue;
    const key = `${source}:${metric}`;
    if (!byKey.has(key)) byKey.set(key, { source, metric, points: [] });
    const bucket = byKey.get(key)!;
    bucket.points.push({ timestamp, value, status });
    if (bucket.points.length > HISTORY_CAP * 4) bucket.points.splice(0, bucket.points.length - HISTORY_CAP * 4);
  }

  const out: Metric[] = [];
  for (const { source, metric, points } of byKey.values()) {
    const history = points.slice(-HISTORY_CAP);
    const latest = history[history.length - 1];
    const prev = history.length > 1 ? history[history.length - 2] : null;
    // weekly delta needs enough window to mean something (≥6 pulls ≈ 1.5 days)
    const oldest = history.length >= 6 ? history[0] : null;
    out.push({
      source,
      metric,
      value: latest.value,
      status: latest.status,
      timestamp: latest.timestamp,
      history,
      delta: prev ? latest.value - prev.value : null,
      deltaWeek: oldest ? latest.value - oldest.value : null,
    });
  }
  return out;
}

// --- runner-status.json -------------------------------------------------------
export async function readRunnerStatus(root: string): Promise<RunnerStatus | null> {
  const j = await safeJson<Record<string, unknown>>(joinPath(root, 'system', 'runner-status.json'));
  if (!j) return null;
  const ts = String(j.ts ?? '');
  let age: number | null = null;
  const parsed = Date.parse(ts);
  if (!Number.isNaN(parsed)) age = Math.round((Date.now() - parsed) / 1000);
  return {
    ts,
    pid: Number(j.pid ?? 0),
    version: String(j.version ?? '?'),
    busy: Boolean(j.busy),
    active: Number(j.active ?? 0),
    max_concurrent: Number(j.max_concurrent ?? 0),
    pending: Number(j.pending ?? 0),
    heartbeat_age_s: age,
    alive: age !== null && age < 120, // heartbeat every ~30s; 2min = dead
  };
}

// --- latest-video.json --------------------------------------------------------
export async function readLatestVideo(root: string): Promise<LatestVideo | null> {
  const j = await safeJson<Record<string, unknown>>(joinPath(root, 'system', 'metrics', 'latest-video.json'));
  if (!j) return null;
  return {
    title: String(j.title ?? ''),
    url: String(j.url ?? ''),
    video_id: String(j.video_id ?? ''),
    views: Number(j.views ?? 0),
    likes: Number(j.likes ?? 0),
    comments: Number(j.comments ?? 0),
    published_at: String(j.published_at ?? ''),
    status: String(j.status ?? '?'),
  };
}

// --- system/runs/*.json --------------------------------------------------------
// short topic tag for a voice-ask — every ask shows as "voice ask" otherwise,
// which is useless when two are in flight ("fable 5 news" vs "gmail thing").
// First 3 content words of the prompt.
const ASK_STOP = new Set([
  'a', 'an', 'the', 'me', 'my', 'i', 'you', 'your', 'please', 'jarvis', 'hey',
  'ok', 'okay', 'can', 'could', 'would', 'tell', 'about', 'like', 'little',
  'bit', 'more', 'just', 'that', 'this', 'what', 'whats', 'is', 'are', 'do',
  'does', 'of', 'for', 'to', 'in', 'on', 'and', 'or', 'so', 'um', 'uh',
  'once', 'when', 'after', 'with', 'go', 'run', 'really', 'actually', 'know',
  'want', 'wanted', 'give', 'get', 'out', 'up', 'some', 'any', 'how',
  'ahead', 'also', 'then', 'now', 'again', 'came', 'thing', 'things', 'stuff',
]);
function askLabel(args: unknown): string | null {
  const prompt = (args as { prompt?: unknown } | null)?.prompt;
  if (typeof prompt !== 'string') return null;
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !ASK_STOP.has(w));
  return words.length ? words.slice(0, 3).join(' ') : null;
}

// path must stay inside the vault and under the dirs runs write to
const READABLE_PREFIXES = ['inbox/', 'system/runs/'];

/** Resolve a vault-relative path to an absolute path, enforcing the same
 *  traversal guards as the source (no `..`, inside VAULT_ROOT). Returns null
 *  if the path escapes the vault. */
function resolveInsideVault(root: string, rel: string): string | null {
  const clean = rel.replace(/\\/g, '/');
  // reject any traversal segment outright (renderer has no path.resolve)
  if (clean.split('/').some((seg) => seg === '..')) return null;
  return joinPath(root, clean);
}

// peek a deliverable's frontmatter for `link: <url>` — when present, the
// run's real output lives at that URL and callouts open it instead of the md
async function deliverableLink(root: string, relPath: unknown): Promise<string | null> {
  if (typeof relPath !== 'string' || !relPath) return null;
  // same guard as readVaultMarkdown — deliverable_path comes from runner-written
  // run JSON, and runs process untrusted content (emails, web); never follow it
  // outside the dirs runs write to
  const clean = relPath.replace(/\\/g, '/');
  if (!READABLE_PREFIXES.some((p) => clean.startsWith(p))) return null;
  const abs = resolveInsideVault(root, clean);
  if (!abs) return null;
  try {
    const full = await ipcBridge.fs.readFile.invoke({ path: abs });
    const raw = full.slice(0, 800);
    if (!raw.startsWith('---')) return null;
    const fm = raw.split(/\r?\n---/)[0];
    const m = fm.match(/^link:\s*["']?(https?:\/\/\S+?)["']?\s*$/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export async function readRecentRuns(root: string, limit = 8): Promise<RunEntry[]> {
  const dir = joinPath(root, 'system', 'runs');
  const all = await listJsonFiles(dir);
  if (all.length === 0) return [];
  const files = (await sortByMtimeDesc(all)).slice(0, limit);

  const out: RunEntry[] = [];
  for (const f of files) {
    const j = await safeJson<Record<string, unknown>>(f);
    if (!j) continue;
    const started = j.ts_started ? Date.parse(String(j.ts_started)) : NaN;
    const completed = j.ts_completed ? Date.parse(String(j.ts_completed)) : NaN;
    const duration =
      !Number.isNaN(started) && !Number.isNaN(completed) ? Math.max(0, Math.round((completed - started) / 1000)) : null;
    out.push({
      id: String(j.id ?? basename(f, '.json')),
      skill: String(j.skill ?? '?'),
      label: String(j.skill) === 'voice-ask' ? askLabel(j.args) : null,
      link: String(j.status) === 'ok' ? await deliverableLink(root, j.deliverable_path) : null,
      status: String(j.status ?? '?'),
      summary: String(j.summary ?? ''),
      ts_completed: j.ts_completed ? String(j.ts_completed) : null,
      ts_started: j.ts_started ? String(j.ts_started) : null,
      duration_s: duration,
      deliverable_path: j.deliverable_path ? String(j.deliverable_path) : null,
    });
  }
  return out;
}

// median past runtime per skill — feeds the task callout's progress estimate.
// Only ok runs count (errors die early and would drag the estimate down).
export async function readSkillEtas(root: string): Promise<Record<string, number>> {
  const dir = joinPath(root, 'system', 'runs');
  const all = await listJsonFiles(dir);
  if (all.length === 0) return {};
  const files = (await sortByMtimeDesc(all)).slice(0, 200);

  const bySkill: Record<string, number[]> = {};
  for (const f of files) {
    const j = await safeJson<Record<string, unknown>>(f);
    if (!j || j.status !== 'ok') continue;
    const started = j.ts_started ? Date.parse(String(j.ts_started)) : NaN;
    const completed = j.ts_completed ? Date.parse(String(j.ts_completed)) : NaN;
    if (Number.isNaN(started) || Number.isNaN(completed)) continue;
    const d = Math.max(1, Math.round((completed - started) / 1000));
    (bySkill[String(j.skill ?? '?')] ??= []).push(d);
  }
  const out: Record<string, number> = {};
  for (const [skill, ds] of Object.entries(bySkill)) {
    ds.sort((a, b) => a - b);
    out[skill] = ds[Math.floor(ds.length / 2)];
  }
  return out;
}

// --- system/queue/*.json — intents waiting for the runner ----------------------
export async function readQueue(root: string): Promise<QueueEntry[]> {
  const dir = joinPath(root, 'system', 'queue');
  const all = await listJsonFiles(dir);
  if (all.length === 0) return [];
  const files = await sortByMtimeAsc(all);

  const out: QueueEntry[] = [];
  for (const f of files) {
    const j = await safeJson<Record<string, unknown>>(f);
    if (!j) continue;
    out.push({
      id: String(j.id ?? basename(f, '.json')),
      skill: String(j.skill ?? '?'),
      label: String(j.skill) === 'voice-ask' ? askLabel(j.args) : null,
      ts: String(j.ts ?? ''),
    });
  }
  return out;
}

// --- daily note -----------------------------------------------------------------
// Today's note if present, else the most recent. Parser contract: frozen v1
// schema — `## Top 3 Priorities` numbered checkboxes + `## Schedule` bullets.
export async function readDailyNote(root: string): Promise<DailyNote | null> {
  const dir = joinPath(root, 'daily-notes');
  // local (HUD_TZ) date — toISOString() is UTC and flips to tomorrow after
  // ~7pm CT, which made evening sessions claim today's note didn't exist
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: HUD_TZ }).format(new Date());
  let file = joinPath(dir, `${today}.md`);
  let isToday = true;
  let date = today;

  if (!(await fileExists(file))) {
    isToday = false;
    const entries = await listEntries(dir);
    const names = entries
      .filter((e) => e.isFile && /^\d{4}-\d{2}-\d{2}\.md$/.test(e.name))
      .map((e) => e.name)
      .sort()
      .reverse();
    if (names.length === 0) return null;
    file = joinPath(dir, names[0]);
    date = names[0].replace('.md', '');
  }

  const raw = await safeRead(file);
  if (!raw) return null;

  const top3: { text: string; done: boolean }[] = [];
  const schedule: { time: string; item: string }[] = [];
  let focus = '';

  let section = '';
  for (const line of raw.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.*)/);
    if (h) {
      section = h[1].trim();
      continue;
    }
    if (section === 'Top 3 Priorities') {
      const m = line.match(/^\d+\.\s+\[( |x)\]\s+(.*)/);
      if (m) top3.push({ text: m[2].trim(), done: m[1] === 'x' });
    } else if (section === 'Schedule') {
      const m = line.match(/^-\s+(\d{1,2}:\d{2})\s*[—–-]+\s*(.*)/);
      if (m) schedule.push({ time: m[1], item: m[2].trim() });
    } else if (section === 'Current Focus') {
      if (line.trim() && !focus) focus = line.trim();
    }
  }

  return { date, isToday, top3, schedule, focus };
}

// --- daily note write — flip a Top 3 checkbox -----------------------------------
// Only today's note is writable (stale notes are history). Index = nth
// checkbox under `## Top 3 Priorities`, matching the parser above.
export async function toggleTop3(index: number, done: boolean): Promise<boolean> {
  const root = await vaultRoot();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: HUD_TZ }).format(new Date());
  const file = joinPath(root, 'daily-notes', `${today}.md`);
  const raw = await safeRead(file);
  if (!raw) return false;

  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  let section = '';
  let seen = -1;
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^##\s+(.*)/);
    if (h) {
      section = h[1].trim();
      continue;
    }
    if (section !== 'Top 3 Priorities') continue;
    const m = lines[i].match(/^(\d+\.\s+)\[( |x)\](\s+.*)/);
    if (!m) continue;
    seen++;
    if (seen === index) {
      lines[i] = `${m[1]}[${done ? 'x' : ' '}]${m[3]}`;
      await ipcBridge.fs.writeFile.invoke({ path: file, data: lines.join(eol) });
      return true;
    }
  }
  return false;
}

// --- queue write — drop an intent for the runner --------------------------------
// Renderer replacement for the source's POST /api/queue file write. Writes a
// JSON intent into system/queue/ that the runner (or a deck button → Hermes)
// can pick up. Returns the vault-relative path written.
export async function writeIntent(skill: string, args?: Record<string, unknown>): Promise<string | null> {
  const root = await vaultRoot();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rel = joinPath('system', 'queue', `${id}.json`);
  const abs = joinPath(root, rel);
  const payload = {
    id,
    skill,
    args: args ?? {},
    ts: new Date().toISOString(),
  };
  try {
    // NOTE: the fs IPC bridge has no mkdir/ensureDir, and `writeFile` does NOT
    // create parent dirs — on a fresh vault `system/queue/` may not exist, so
    // the underlying fs.writeFile throws ENOENT. The bridge swallows that and
    // RESOLVES `false` (it never rejects), so the previous try/catch could not
    // detect the failure and `writeIntent` falsely reported success. Inspect
    // the boolean result and surface a real failure instead of silently
    // claiming the intent was queued — the Hermes deck seam remains the live
    // path for actually running the skill.
    const ok = await ipcBridge.fs.writeFile.invoke({ path: abs, data: JSON.stringify(payload, null, 2) });
    if (ok === false) {
      console.warn(`[jarvis] queue intent write failed (dir may be missing, fs IPC has no mkdir): ${abs}`);
      return null;
    }
    return rel;
  } catch (e) {
    console.warn('[jarvis] queue intent write threw', e);
    return null;
  }
}

// --- read a vault markdown deliverable (report overlay) ---------------------------
// Path must stay inside the vault and under the dirs runs write to.
export async function readVaultMarkdown(rel: string): Promise<string | null> {
  const root = await vaultRoot();
  const clean = rel.replace(/\\/g, '/');
  if (!clean.endsWith('.md')) return null;
  if (!READABLE_PREFIXES.some((p) => clean.startsWith(p))) return null;
  const abs = resolveInsideVault(root, clean);
  if (!abs) return null; // no traversal
  return safeRead(abs);
}

// --- today's morning report headlines ---------------------------------------------
// `## Headlines` bullets, markdown stripped — feeds the AI Wire panel.
// rel = vault-relative path for the overlay.
export async function readMorningReport(root: string, max = 4): Promise<MorningReport | null> {
  try {
    const dir = joinPath(root, 'inbox', 'reports', 'morning');
    const prefix = new Intl.DateTimeFormat('en-CA', { timeZone: HUD_TZ }).format(new Date());
    const entries = await listEntries(dir);
    const fileName = entries
      .filter((e) => e.isFile && e.name.startsWith(prefix) && e.name.endsWith('.md'))
      .map((e) => e.name)
      .sort()
      .pop();
    if (!fileName) return null;
    const raw = await ipcBridge.fs.readFile.invoke({ path: joinPath(dir, fileName) });
    const heads: string[] = [];
    const links: (string | null)[] = [];
    let inHeads = false;
    for (const line of raw.split(/\r?\n/)) {
      if (/^##\s/.test(line)) {
        if (inHeads) break;
        inHeads = /^##\s+Headlines/i.test(line);
        continue;
      }
      if (inHeads && /^[-*]\s+/.test(line)) {
        // first http(s) URL on the bullet — markdown link or bare
        const url = line.match(/https?:\/\/[^\s)\]"']+/)?.[0] ?? null;
        const clean = line
          .replace(/^[-*]\s+/, '')
          .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [text](url) → text
          .replace(/https?:\/\/[^\s)\]"']+/g, '')
          .replace(/[*_`]/g, '')
          .trim();
        if (clean) {
          heads.push(clean.slice(0, 160));
          links.push(url);
        }
        if (heads.length >= max) break;
      }
    }
    return { rel: `inbox/reports/morning/${fileName}`, heads, links };
  } catch {
    return null;
  }
}

// --- consolidated snapshot --------------------------------------------------------
// Async renderer equivalent of the source's readVaultState(). Panels poll this
// every ~5s. All readers run in parallel against the resolved vault root.
export async function getVaultState(): Promise<VaultState> {
  const root = await vaultRoot();
  const [metrics, runner, latestVideo, daily, runs, queue, morning, etas] = await Promise.all([
    readMetrics(root),
    readRunnerStatus(root),
    readLatestVideo(root),
    readDailyNote(root),
    readRecentRuns(root),
    readQueue(root),
    readMorningReport(root),
    readSkillEtas(root),
  ]);
  return {
    generated_at: new Date().toISOString(),
    vault_root: root,
    metrics,
    runner,
    latestVideo,
    daily,
    runs,
    queue,
    morning,
    etas,
  };
}
