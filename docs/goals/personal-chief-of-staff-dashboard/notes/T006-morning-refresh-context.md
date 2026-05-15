# T006 Morning Refresh And Context Rebuild

## Result

Done.

## Summary

Added the follow-up dashboard behavior Sam asked for:

- Daily automatic dashboard refresh scheduled around 5:00 AM local time while Agent Club is running.
- Hard refresh IPC and UI button that clears cached dashboard snapshots and rebuilds from local sources.
- Context input on the dashboard; pressing Enter rebuilds the dashboard with the typed context as the latest chief-of-staff signal.
- Loading recovery UI with hard refresh and reload buttons if the dashboard waits too long.
- Context-derived insight and source status in rebuilt snapshots.

## Changed Files

- `src/common/types/dashboard.ts`
- `src/common/adapter/ipcBridge.ts`
- `src/common/config/storage.ts`
- `src/process/bridge/dashboardBridge.ts`
- `src/process/services/dashboard/DashboardService.ts`
- `src/renderer/pages/dashboard/DashboardPage.tsx`

## Verification

- `bunx tsc --noEmit` - pass
- `bunx oxlint --quiet` - pass
- `git diff --check` - pass
