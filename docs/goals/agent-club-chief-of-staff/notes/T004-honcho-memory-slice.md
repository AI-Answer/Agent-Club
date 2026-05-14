# T004 Honcho Memory Slice Receipt

## Result

Done.

## Implemented

- Added `@honcho-ai/sdk@2.1.1`.
- Added a main-app Memory settings route at `/settings/memory`.
- Added Honcho setup fields for API key, API URL, workspace ID, and user peer ID.
- Added hook toggles for Honcho capture, user messages, and agent messages.
- Added a setup action that verifies Honcho from the main process without requiring restart.
- Added a memory viewer that loads the configured user's Honcho peer card and representation.
- Added a process-side Honcho memory service.
- Hooked the memory capture into the shared message persistence queue so saved user messages and finished agent messages can be sent to Honcho when enabled.
- Added a Supermemory placeholder section for the next provider.
- Removed the development Agent Hub / install-from-market modal from Local Agents.
- Reordered local detected agents so Hermes is first when present, then Codex, Claude Code, OpenClaw, then the rest.

## Files

- `package.json`
- `bun.lock`
- `src/common/types/memory.ts`
- `src/common/config/storage.ts`
- `src/common/adapter/ipcBridge.ts`
- `src/process/services/memory/HonchoMemoryService.ts`
- `src/process/bridge/memoryBridge.ts`
- `src/process/bridge/index.ts`
- `src/process/utils/message.ts`
- `src/renderer/pages/settings/MemorySettings.tsx`
- `src/renderer/components/layout/Router.tsx`
- `src/renderer/pages/settings/components/SettingsSider.tsx`
- `src/renderer/pages/settings/components/SettingsPageWrapper.tsx`
- `src/renderer/pages/settings/AgentSettings/LocalAgents.tsx`
- `src/renderer/services/i18n/locales/en-US/settings.json`
- `src/renderer/services/i18n/i18n-keys.d.ts`

## Verification

- `bun run i18n:types` passed.
- `node scripts/check-i18n.js` passed.
- `bunx tsc --noEmit` passed.
- `bunx oxlint --quiet` passed with existing warnings and no errors.
- `git diff --check` passed.
- App restarted with `bun run start:multi`.
- Renderer responded on `http://localhost:5173/`.
- Agent Manager backend health returned `{"status":"ok"}` on `http://127.0.0.1:18330/health`.
- Local Agent Manager daemon returned running health on `http://127.0.0.1:20509/health`.

## Notes

- `bun add @honcho-ai/sdk@2.1.1` completed, but the repo postinstall attempted a native `node-pty` rebuild and printed a local compiler header error. The dependency and lockfile were still written, and TypeScript/lint verification passed afterward.
- Browser verification against `http://localhost:5173/#/settings/memory` redirected to `/login` in the separate in-app browser session, so visual verification should happen in the restarted Electron app window.
