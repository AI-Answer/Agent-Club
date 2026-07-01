# T018: jarvis-hud → Agent Club port plan (Hermes brain, no Claude)

Task: `T018` (scout map) → `T019` (PM sequencing)
Source: `scratchpad/jarvis-hud` (Next.js 15 + React 19 + Three.js 0.176)
Target: `src/renderer/pages/jarvis/` (Vite + React 19 + UnoCSS, Electron)

## Key finding

**The Hermes brain + voice is ALREADY built in the target** (`services/voicePipeline.ts` = Hermes ACP
+ `text_to_speech` TTS + Web Speech STT + speechSynthesis fallback; `services/controlBridge.ts` =
Peekaboo + MCP pre-wire). So this is a **visual + content upgrade**, NOT a brain port. Reuse the brain;
swap the look.

## Adopt (port as-is, presentational)

- **Theme:** `app/globals.css` (1502 lines, OKLCH near-black + warm "Ember" terracotta, driven by one
  live CSS var `--accent-h`; all HUD chrome classes are plain CSS, no Tailwind/Next) → `jarvis/jarvis.css`.
- **Fonts:** Big Shoulders Display (`--font-display`) + Martian Mono (`--font-mono`) via `@fontsource/*` or Google `<link>`.
- **Orb (centerpiece):** `components/GraphCore.tsx` — 2200-pt volumetric knowledge-graph cloud, custom ShaderMaterial points + additive line edges + halo, `EffectComposer`+`UnrealBloomPass`, ~70s hue voyage that writes `--accent-h` to `document.documentElement` (this tints all chrome — KEEP). Needs `three` + `three/examples/jsm/postprocessing/*`. Replaces the current cyan 2D-canvas `ReactorCore`. Wire its `getLevel` to the existing `voicePipeline` AnalyserNode; `mode` from `voicePipeline.status`.
- **Overlay:** `components/ReportOverlay.tsx` (zero-dep markdown→HTML). Optional alt orbs: `DitherCore`/`dithering-shader` (pure WebGL2, no deps), `EmberCore` (three).
- **HUD panels** (sub-components in `components/HUD.tsx`, 1217 lines): TopBar, Vitals (count-up + SVG sparklines), Priorities/Directives (toggle), Documents, CommandDeck (skill buttons), Schedule (NOW marker), AudioIO (wave bars), Wire (AI headlines), Objective (milestone/deploy), callouts. All presentational; only the data source changes.

## Data: the file "vault" (port `lib/vault.ts` 1:1 via fs IPC)

`readVaultState()` reads a `VAULT_ROOT` folder of plain files. Port verbatim (pure string/JSON parse)
into a renderer util using `ipcBridge.fs.{getFilesByDir,readFile,readFileBuffer,writeFile,getFileMetadata}`.
Bring `starter-vault/` as demo data. Panels poll `getVaultState()` every 5s.

| Panel | Vault file | Shape |
|---|---|---|
| Vitals/Objective | `system/metrics/metrics.csv` + `system/metrics/latest-video.json` | Metric[] (24-pt history, delta), LatestVideo |
| Runner status | `system/runner-status.json` | alive = heartbeat <120s |
| Directives/Schedule/focus | `daily-notes/YYYY-MM-DD.md` | Top-3 checkboxes, `- HH:MM — item` schedule |
| Documents/runs/task callouts | `system/runs/*.json` (newest 8) | RunEntry (deliverable_path, status) |
| Command Deck queue | `system/queue/*.json` | QueueEntry[] |
| AI Wire | `inbox/reports/morning/<today>*.md` | Headlines bullets |
| Report/Transcript overlay | `.md` under inbox/runs ; `system/voice/memory.jsonl` | markdown / Exchange[] |

## API (Next routes) → Electron fs-IPC

- `GET /api/state` → renderer `getVaultState()` (port vault.ts). `GET /api/report` → `fs.readFile`.
- `POST /api/daily` → port `toggleTop3()` (fs read+write). `POST /api/queue` → fs write OR deck button → `acpConversation.sendMessage` (Hermes).
- `/api/voice`, `/api/voice/text`, `/api/speak`, `GET/DELETE /api/transcript` → **DELETE** (superseded by voicePipeline; reuse its `transcript[]`).

## Brain map (mostly already done) — NO Claude anywhere

| jarvis-hud | Hermes equivalent (exists in target) |
|---|---|
| `route()` Haiku/Ollama intent | Hermes ACP turn (`sendMessage`→`responseStream`); optionally keep `rulesRoute` as a 0-latency dashboard fast-path |
| runner `claude -p` skills | Hermes ACP turn (ported `buildPrompt` text as the message); deliverables → vault |
| `/api/speak` Kokoro TTS | Hermes `text_to_speech` tool-call → `playTtsFile` (exists) |
| `/stt` faster-whisper | Web Speech STT in voicePipeline (exists) |
| `getLevel()` orb RMS | `voicePipeline.analyser`/`level` (exists) |

## DELETE (Windows/Python/Claude — not needed on macOS Electron)

`voice-server/**` (Python/Kokoro/whisper/CUDA), `runner/runner.js` (claude -p), all `*.vbs`,
`lib/{router,voiceDispatch,voiceClient,stt,tts,skills,modelOverride,voiceMemory,spokenText,homeEnv}.ts`,
`app/api/{voice,voice/text,speak}`, `~/.claude/.env` loading, Claude model-override ids.

## Ordered slices (sequential dependency; components stage fans out)

1. **Foundation:** `three`+`@types/three`+fonts; `globals.css`→`jarvis.css`; port `vault.ts`→renderer `getVaultState()`; bring `starter-vault/` demo data.
2. **Components (parallel):** GraphCore orb (+postprocessing) ; ReportOverlay ; HUD panel sub-components bound to `getVaultState()` + `voicePipeline.transcript` (daily/queue via fs-IPC; deck→Hermes).
3. **Integrate:** rewrite `jarvis/index.tsx` — Ember theme + GraphCore centerpiece (wired to voicePipeline) + ported HUD panels; keep ControlStatus(engage)/MusicButton/voice push-to-talk; gate on Hermes; remove now-unused T009 cyan components. Full build.
4. **Review + test + audit.**
