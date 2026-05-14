# T003 First Tranche Decision

## Decision

Make the first Worker slice Honcho-first, not generic memory settings.

The user clarified that new users should be able to enter a Honcho API key, have Agent Club set up memory hooks, and see memories in the Memory tab. Honcho docs confirm that storing messages in sessions is the primitive that triggers background memory generation, so the first slice should create that real product path with safe failure behavior when credentials are absent.

## Worker Objective

Add a first-pass Honcho memory setup:

- Memory settings tab in the main Agent Club settings.
- Honcho API key, base URL, workspace ID, and peer ID setup fields.
- Toggles for capturing user messages and agent messages.
- A connection/setup action that verifies configuration without requiring app restart.
- A process-side memory hook that observes saved conversation messages and sends eligible finished messages to Honcho when enabled.
- A memory viewer action in the Memory tab that retrieves a Honcho representation/card for the configured peer when credentials are present.
- Remove the development Agent Hub / install-from-market modal from Local Agents.
- Sort local agents Hermes first when present, then Codex, Claude Code, OpenClaw, then the rest.

## Allowed Files

- `package.json`
- `bun.lock`
- `src/common/adapter/ipcBridge.ts`
- `src/common/config/storage.ts`
- `src/common/types/memory.ts`
- `src/process/bridge/index.ts`
- `src/process/bridge/memoryBridge.ts`
- `src/process/services/memory/HonchoMemoryService.ts`
- `src/process/utils/message.ts`
- `src/renderer/components/layout/Router.tsx`
- `src/renderer/pages/settings/MemorySettings.tsx`
- `src/renderer/pages/settings/components/SettingsSider.tsx`
- `src/renderer/pages/settings/components/SettingsPageWrapper.tsx`
- `src/renderer/pages/settings/AgentSettings/LocalAgents.tsx`
- `src/renderer/services/i18n/locales/en-US/settings.json`
- `src/renderer/services/i18n/i18n-keys.d.ts`

## Verify

- `bun run i18n:types`
- `node scripts/check-i18n.js`
- `bunx tsc --noEmit`

## Stop If

- Honcho SDK/API usage cannot be typed or verified without credentials.
- The message hook would block chat streaming or crash when Honcho is unavailable.
- The slice needs account credentials or external authentication from the owner.
- Verification fails twice.
- Changes require files outside the allowed set.

## Deferred

- Supermemory real integration.
- Google Workspace authentication through gogcli.sh.
- 1Password MCP verification.
- Agent Manager dashboard/goals kanban.
- Deep Agent Manager settings parity.
