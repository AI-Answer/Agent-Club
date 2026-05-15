# T001 Architecture And Performance Map

## Summary

The current Local Agent Manager path is a desktop-orchestrated embedded web app:

1. Agent Club Electron starts from `electron-vite dev`.
2. `AgentManagerService` starts or reuses the Multica stack:
   - Postgres under `.agent-club`
   - Go API backend on port `18330`
   - Multica daemon using profile `agent-club`
   - Next web UI on port `3330`
3. `AgentManagerPage` renders an iframe pointed at `/agent-club-boot?next=...`.
4. The boot page posts to `/auth/agent-club`, stores cookies and local token, then redirects to the requested `/agent-club/...` route.
5. Multica workspace layout loads workspace state, dashboard chrome, sidebar, search, chat overlays, realtime presence, and the route page.

This means the perceived product is a chain of Electron shell, service bootstrap, iframe auth bridge, Next route compile, React Query hydration, and local runtime sync.

## Key Files

- `src/process/services/agentManager/AgentManagerService.ts`
  - Orchestrates backend, daemon, web UI, route prewarm, and status.
  - `startInternal()` is the full bootstrap path.
  - `prewarmFrontendRoutes()` currently warms agents, issues, projects, runtimes, inbox, my issues, autopilots, squads, and skills.
- `src/renderer/pages/AgentManagerPage.tsx`
  - Owns the embedded iframe and boot URL.
  - Rebuilds the iframe source from `status.url` plus `nextPath`.
  - Uses a changing `frameKey`, so some status or route changes can remount the iframe.
- `src/common/config/appBrand.ts`
  - Defines manager name, boot path, default path, and local runtime profile.
- `apps/agent-manager/apps/web/package.json`
  - Runs the web UI with `next dev --webpack`.
- `apps/agent-manager/apps/web/app/agent-club-boot/page.tsx`
  - Clears old token, authenticates with the local backend, then redirects.
- `apps/agent-manager/apps/web/app/[workspaceSlug]/layout.tsx`
  - Fetches workspace, handles auth redirects, and sets current workspace.
- `apps/agent-manager/packages/views/layout/dashboard-layout.tsx`
  - Mounts sidebar, modal registry, search command, chat window/fab, starter prompt, and presence prefetch around each manager route.
- `src/renderer/components/layout/Sider/index.tsx`
  - Agent Club shell navigation exposes Dashboard, Month Map, Scheduled Tasks, and Local Agent Manager.
- `src/process/services/dashboard/DashboardService.ts`
  - Already treats Agent Manager as a dashboard source and routes work items into `/agent-manager`.

## Measurements

Route timing was measured from Node fetch against the live manager UI on `localhost:3330`.

Command:

```bash
node - <<'NODE'
const paths = [
  '/agent-club-boot?next=%2Fagent-club%2Fagents',
  '/agent-club/agents',
  '/agent-club/issues',
  '/agent-club/projects',
  '/agent-club/runtimes',
  '/agent-club/skills',
  '/agent-club/goals',
  '/agent-club/planner'
];
for (const p of paths) {
  const start = performance.now();
  const res = await fetch(`http://localhost:3330${p}`);
  await res.arrayBuffer();
  const total = ((performance.now() - start) / 1000).toFixed(3);
  console.log(`${p.padEnd(55)} http=${res.status} total=${total}s`);
}
NODE
```

Cold-ish pass:

| Route | Time |
| --- | ---: |
| `/agent-club-boot?next=/agent-club/agents` | 2.336s |
| `/agent-club/agents` | 0.368s |
| `/agent-club/issues` | 14.813s |
| `/agent-club/projects` | 11.881s |
| `/agent-club/runtimes` | 7.720s |
| `/agent-club/skills` | 3.363s |
| `/agent-club/goals` | 40.947s |
| `/agent-club/planner` | 36.951s |

Warm second pass:

| Route | Time |
| --- | ---: |
| `/agent-club-boot?next=/agent-club/agents` | 0.315s |
| `/agent-club/agents` | 0.249s |
| `/agent-club/issues` | 4.877s |
| `/agent-club/projects` | 2.982s |
| `/agent-club/runtimes` | 4.552s |
| `/agent-club/skills` | 3.190s |
| `/agent-club/goals` | 3.086s |
| `/agent-club/planner` | 3.204s |

Other evidence:

- `curl` was not available in this shell, so Node fetch was used.
- `.next/dev/cache` was about `6.3G`.
- `.next/dev/server` was about `169M`.
- Generated route page bundles were roughly `8.7MB` to `10MB` each.
- `apps/agent-manager/apps/web/.next/dev/logs/next-development.log` showed repeated route compilation for routes like issues, projects, runtimes, goals, and planner.
- Browser-side logs showed many backend calls, but most API timings were about `50ms` to `160ms`, so backend latency was not the primary bottleneck.

## Ranked Bottlenecks

1. Next dev route compilation is the largest visible bottleneck.
   - Confidence: high.
   - Impact: very high.
   - Evidence: goals and planner took 36s to 41s on first route compile; logs showed explicit route compiles.

2. Prewarm coverage and timing are incomplete.
   - Confidence: high.
   - Impact: high.
   - Evidence: prewarm omits `/agent-club/goals` and `/agent-club/planner`, two of the slowest routes. Prewarm runs fire-and-forget after status is already ready, so the user can click before warmup finishes.

3. The iframe boot/auth bridge adds a repeated page hop.
   - Confidence: medium-high.
   - Impact: medium.
   - Evidence: boot route clears token, posts auth, sets cookies, then redirects. The shell can remount the iframe through `frameKey`.

4. The manager dashboard chrome is heavy for every route.
   - Confidence: medium-high.
   - Impact: medium-high.
   - Evidence: every route mounts sidebar, search command, chat surfaces, modal registry, presence prefetch, and workspace queries.

5. Route page bundles are too large for fast dev iteration.
   - Confidence: medium.
   - Impact: medium-high.
   - Evidence: each compiled route page bundle is around 9MB.

6. Backend API and daemon health are not the main click-around bottleneck.
   - Confidence: medium-high.
   - Impact: lower for this complaint.
   - Evidence: API requests were usually sub-200ms while route compiles were multi-second to tens of seconds.

## Measurement Commands To Keep

```bash
tail -n 200 apps/agent-manager/apps/web/.next/dev/logs/next-development.log
```

```bash
du -sh apps/agent-manager/apps/web/.next/dev/cache apps/agent-manager/apps/web/.next/dev/server
```

```bash
bun run debug:perf
```

```bash
bun run bench:startup
```

The next implementation should add product-native timing so the app can show "backend ready", "manager UI warming", and "route warmed" instead of making the user infer it from slow clicks.
