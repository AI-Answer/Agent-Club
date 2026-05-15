# T001 Surface Map

## Renderer Entry Points

- Sidebar lives in `src/renderer/components/layout/Sider/index.tsx`.
- Fixed top nav currently renders `SiderToolbar`, `SiderSearchEntry`, `SiderScheduledEntry`, and `SiderAgentManagerEntry`.
- The requested dashboard location is between `SiderSearchEntry` and `SiderScheduledEntry`.
- Nav entries are small standalone components in `src/renderer/components/layout/Sider/SiderNav/`, exported from `SiderNav/index.ts`.
- Routes live in `src/renderer/components/layout/Router.tsx`; add a lazy `DashboardPage` route at `/dashboard`.

## Local Data Sources Available Now

- Scheduled Tasks are already exposed through `ipcBridge.cron.listJobs` and the cron singleton behind `src/process/bridge/cronBridge.ts`.
- Running local task count is already exposed through `ipcBridge.task.getRunningCount`; process code can also receive `workerTaskManager` through bridge dependencies.
- Honcho memory snapshot is available through `honchoMemoryService.getSnapshot()` and `ipcBridge.memory.getHonchoSnapshot`, with honest disconnected behavior if API key/config is missing.
- Agent Manager status is available through `agentManagerService.getStatus()` and can be extended to expose lightweight goal/issue counts when ready.

## Missing Sources To Represent Honestly

- Gmail/email, calendar, and todo list connectors are not wired into Agent Club dashboard IPC today.
- V1 should show them as disconnected/setup-needed source cards, not invent action items from them.
- Future writes to those sources should be preview/confirmation gated.

## Recommended First Worker Slice

Implement a local-first V1 in one safe slice:

- Add shared dashboard types.
- Add process dashboard service/bridge that aggregates Honcho, Scheduled Tasks, running task count, Agent Manager status/stats, and disconnected connector health.
- Add renderer dashboard route/page and sidebar item under Search.
- Keep action buttons to navigation/refresh/setup links for V1.

## Verification

- `bunx tsc --noEmit`
- `bunx oxlint --quiet`
- local app/browser smoke at `/dashboard`
