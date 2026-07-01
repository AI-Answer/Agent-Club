# T001: Repo + Multica Map

Task: `T001`
Kind: `scout`
Status: `current`

## Summary

Agent Club is an AionUi-based Electron app. Main process (`src/index.ts` + `src/process/**`)
vs renderer (React 19 + react-router-dom v6 declarative Routes, `src/renderer/**`). AI agents
are registered in `src/process/agent/AgentRegistry.ts` (per-agent dirs: gemini, aionrs, openclaw,
nanobot, acp, remote). **"Multica" is the vendored `apps/agent-manager` monorepo** (npm package
name `multica`): a Go backend compiled to a `multica` CLI/daemon, a Next.js web UI, and Postgres,
orchestrated by `src/process/services/agentManager/AgentManagerService.ts` and shown via a
full-page iframe in `AgentManagerPage.tsx` at route `/agent-manager`.

## Architecture

- Main entry `src/index.ts` (package.json main: `./out/main/index.js`); process code under `src/process/**`.
- Renderer React 19 + Arco Design + UnoCSS; router = react-router-dom v6 declarative `<Routes>/<Route>` in `src/renderer/components/layout/Router.tsx` (HashRouter, NOT createBrowserRouter).
- Multica is the `/agent-manager` route → `AgentManagerPage` (Router.tsx:92).
- Full-screen pattern today: multica embedded as full-page `<iframe>` (AgentManagerPage.tsx:186-189). `WebviewHost` (src/renderer/components/media/WebviewHost.tsx) exists for other embeds.

## Multica = heavy local stack

- `apps/agent-manager` (package.json name `multica`, v0.2.0, turbo monorepo). Go server `apps/agent-manager/server` (module github.com/multica-ai/multica/server, go 1.26.1) with cmd/{multica,server,migrate}. Web UI `apps/agent-manager/apps/web` (Next.js).
- Build/bundle: `scripts/prepareMulticaCli.js` builds `go build ./cmd/multica` → `resources/bundled-multica/<os>-<arch>/multica` (v0.2.20, CGO_ENABLED=0). `postinstall.js` → `scripts/setup-multica-cli.mjs` builds the CLI, copies to `~/.agent-club/bin`, symlinks `~/.local/bin/multica`. `electron-builder.yml:109-124` ships bundled-multica AND the entire `apps/agent-manager` source as extraResources (~27M).
- **Startup cost (eager, src/index.ts:537 → agentManagerService.start()):** `startInternal()` (AgentManagerService.ts:884-974) sequentially runs `pnpm install` (240s timeout), builds the Go CLI, starts a local Postgres under `.agent-club/postgres-data`, `go run ./cmd/migrate up` (120s), spawns `go run ./cmd/server` (port 18330), spawns the multica daemon binary, then `pnpm dev:web` Next.js (port 3330).
- Documented perf: `docs/goals/multica-agent-club-unified-performance/notes/T001-architecture-performance-map.md` measured cold Next route compiles: issues 14.8s, projects 11.9s, runtimes 7.7s. T004 plan targets eliminating a hidden 30-40s first-click.

## Verification commands

- dev = `bun start` (pnpm start); web = `pnpm webui` / `bun run build:renderer:web`; build = `pnpm package` / `pnpm make`; dist = `pnpm dist[:mac|:win|:linux]`.
- unit = `pnpm test` (vitest); e2e = `pnpm test:e2e` (playwright, testDir ./tests/e2e); lint = `pnpm lint` (oxlint); format = `pnpm format` (oxfmt).
- multica CLI = `pnpm prepare:multica-cli` / `pnpm setup:multica-cli`.
- **Package manager is bun (bun.lock).** node_modules/.bin was empty in checkout → `bun install` needed before lint/build.

## Key file evidence

- `src/index.ts:537` (agentManagerService.start() eager at boot), `:793` (stop()).
- `src/process/services/agentManager/AgentManagerService.ts:884-974` (startInternal bootstrap), `:905` (go migrate), `:913` (go server), `:920-944` (multica daemon), `:960-961` (next dev), `:1436-1499` (ensurePostgres).
- `src/renderer/components/layout/Router.tsx:61-95` (Routes; :92 /agent-manager).
- `src/renderer/pages/AgentManagerPage.tsx:186-189` (full-page iframe src=frameUrl).
- `electron-builder.yml:109-124` (extraResources). `apps/agent-manager/**`.
