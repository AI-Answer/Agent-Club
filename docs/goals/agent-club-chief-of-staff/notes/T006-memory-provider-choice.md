# T006 Memory Provider Choice Receipt

## Result

Done.

## What Changed

- The Memory settings model now has one selected provider: `honcho` or `supermemory`.
- Honcho remains the only operational backend in this slice.
- Supermemory is visible as the alternate product path, but the UI states that setup and hooks are not wired yet.
- Honcho setup, refresh, memory display, and message-capture hooks are gated to the selected provider being `honcho`.
- The Memories panel now hides stale Honcho snapshots when Supermemory is selected.

## Files Touched

- `src/common/types/memory.ts`
- `src/process/services/memory/HonchoMemoryService.ts`
- `src/renderer/pages/settings/MemorySettings.tsx`
- `src/renderer/services/i18n/locales/en-US/settings.json`
- `src/renderer/services/i18n/i18n-keys.d.ts`
- `docs/goals/agent-club-chief-of-staff/goal.md`
- `docs/goals/agent-club-chief-of-staff/state.yaml`

## Verification

- `bun run i18n:types`: passed
- `node scripts/check-i18n.js`: passed
- `bunx tsc --noEmit`: passed
- `bunx oxlint --quiet`: passed with existing warnings and no errors
- `git diff --check`: passed

## Remaining Work

- Add the Supermemory credential/setup backend and selected-provider hook adapter.
- Move the next Chief of Staff slice into Agent Manager cohesion: dashboard, goals/kanban, agent awareness, and shared runtime status.
