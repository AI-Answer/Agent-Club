# T002 Architecture Decision

## Decision

Approved. Build a local-first dashboard V1 now.

## Worker Slice

Implement a native `/dashboard` page and sidebar entry, backed by a process-side dashboard bridge/service that returns a typed snapshot.

The snapshot should aggregate:

- Honcho memory snapshot/config state.
- Scheduled task list and next queued task.
- Running task count.
- Agent Manager status plus lightweight goal/issue counts when the local backend is ready.
- Honest disconnected source health for email, calendar, and todo lists.

## Allowed Files

- `src/common/types/dashboard.ts`
- `src/common/adapter/ipcBridge.ts`
- `src/common/config/storage.ts`
- `src/process/bridge/dashboardBridge.ts`
- `src/process/bridge/index.ts`
- `src/process/utils/initBridgeStandalone.ts`
- `src/process/services/dashboard/**`
- `src/process/services/agentManager/AgentManagerService.ts`
- `src/renderer/components/layout/Sider/index.tsx`
- `src/renderer/components/layout/Sider/SiderNav/**`
- `src/renderer/components/layout/Router.tsx`
- `src/renderer/pages/dashboard/**`

## Verify

- `bunx tsc --noEmit`
- `bunx oxlint --quiet`
- local browser smoke for the dashboard route.

## Stop If

- The implementation requires real Gmail/Calendar/Todo credentials.
- Agent Manager APIs are unavailable in a way that would block the whole dashboard.
- Dashboard storage would need raw email bodies, full meeting text, or other private source data.
