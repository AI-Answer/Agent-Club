# T003/T004 Worker Receipt: Fast Dashboard Return

## Implementation

- Added a renderer-level Dashboard snapshot cache so route remounts can display the previous Dashboard content immediately.
- Added a process-level cached snapshot path for `dashboard.getSnapshot({ reason: 'initial' })`.
- Initial loads now return the latest in-memory or persisted snapshot when available, then trigger a deduped background refresh that emits `snapshotUpdated` when fresh data is ready.
- Explicit refresh paths still rebuild normally:
  - Refresh / heartbeat
  - Hard refresh
  - Manual context rebuild
  - Layout and custom widget updates

## Verification

```bash
bunx tsc --noEmit
```

Passed.

Live route timing through the running Electron CDP endpoint:

```json
{
  "before": {
    "loadingImmediately": 1,
    "returnReadyMs": 10213,
    "totalReturnMs": 10248
  },
  "after": {
    "loadingImmediately": 0,
    "returnReadyMs": 7,
    "totalReturnMs": 1616,
    "loadingAfter1500": 0
  }
}
```

The Dashboard -> Month Map -> Dashboard path no longer shows the loading screen on return when a cached snapshot exists. The page remains on `http://localhost:5173/#/dashboard`.
