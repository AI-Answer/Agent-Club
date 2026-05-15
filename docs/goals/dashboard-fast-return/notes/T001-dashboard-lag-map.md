# T001 Scout Receipt: Dashboard Lag Map

## Reproduction

- App route tested: `http://localhost:5173/#/dashboard`
- Navigation path: Dashboard -> Month Map -> Dashboard
- Tooling: Playwright over the running Electron CDP endpoint at `127.0.0.1:9230`

## Baseline Evidence

```json
{
  "initialReadyMs": 45,
  "loadingImmediately": 1,
  "returnReadyMs": 10213,
  "totalReturnMs": 10248
}
```

Returning to the Dashboard route shows the loading state immediately and waits roughly 10.2 seconds before the page becomes usable.

## Code Path

- `src/renderer/pages/dashboard/DashboardPage.tsx`
  - `snapshot` state is local to the route component.
  - `loadSnapshot()` always sets `loading` true and calls `ipcBridge.dashboard.getSnapshot.invoke({ reason: 'initial' })`.
  - The mount effect calls `loadSnapshot()` every time the route remounts, so revisiting the Dashboard replays the full initial loading path.
- `src/process/bridge/dashboardBridge.ts`
  - `dashboard.getSnapshot` directly calls `dashboardService.getSnapshot(request || {})`.
- `src/process/services/dashboard/DashboardService.ts`
  - `getSnapshot()` always calls `buildSnapshot()` and persists the result.
  - `buildSnapshot()` waits on cron jobs, Honcho memory, and Agent Manager summary. Honcho has an internal 15 second dashboard timeout wrapper, so this path can visibly block the user.
  - Snapshot history is already persisted in `dashboard.snapshots`, but no fast read path uses it for route return.

## Ranked Root Causes

1. High confidence: no fast cached snapshot on Dashboard remount, despite persisted snapshot history.
2. High confidence: `loading && !snapshot` blanks the route while the IPC build runs.
3. Medium confidence: Honcho memory is the largest slow source because the dashboard wrapper allows up to 15 seconds.
4. Medium confidence: `updateLayout()` and custom widget creation also rebuild the whole snapshot after small config changes.

## Candidate Worker Slice

Implement stale-while-revalidate for initial Dashboard loads:

- Add a fast cached snapshot read from in-memory or persisted `dashboard.snapshots`.
- Let `dashboard.getSnapshot({ reason: 'initial' })` return a cached snapshot immediately when available.
- Trigger a background refresh after returning cached data and emit `snapshotUpdated` when the fresh snapshot completes.
- Keep hard refresh, heartbeat, context rebuilds, and explicit refresh buttons as full rebuilds.
- Keep the existing loading screen only for a true first run with no cached snapshot.

## Verification Ideas

- Typecheck the changed TypeScript.
- Re-run the same live Dashboard -> Month Map -> Dashboard timing script.
- Passing target: return path should show Dashboard content immediately, with no visible loading screen and a ready time under 1 second when a cached snapshot exists.
