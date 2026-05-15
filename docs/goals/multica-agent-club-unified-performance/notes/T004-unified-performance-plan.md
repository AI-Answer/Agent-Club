# T004 Unified Performance And Coupling Plan

## Recommendation

Keep the current architecture for now: Agent Club owns the desktop shell and local runtime bootstrap; Local Agent Manager/Multica remains the source of truth for goals, issues, agents, runtimes, and boards; the embedded manager UI remains the detailed work surface.

The immediate work should make that architecture feel intentional:

- make manager readiness and route warmup visible,
- reduce dev route compile pain,
- stop avoidable iframe/auth churn,
- expose manager work in shell surfaces,
- and add a shared status/data contract before attempting a larger rewrite.

## Success Targets

Short-term dev targets:

- First manager screen usable after service ready: under 3 seconds.
- Common click-to-ready after warmup: under 1 second.
- Cold click on major manager screens after app startup: under 5 seconds.
- No hidden 30s to 40s first click on Goals or Planner after the app reports ready.
- Shell shows whether Local Agent Manager is starting, ready, or warming screens.

Longer-term packaged targets:

- First manager screen usable: under 2 seconds after local services are ready.
- Warm route transitions: under 700ms.
- Dashboard agent/manager status refresh: under 500ms for local summaries.

## Phase 1: Make Readiness Honest And Warm The Right Screens

Goal: the app should not say "ready" while major manager routes are still cold enough to take 30s to 40s.

Implementation shape:

- Extend `AgentManagerStatus` with manager UI warmup details:
  - `prewarm.state`
  - `prewarm.currentPath`
  - `prewarm.completedPaths`
  - `prewarm.failedPaths`
  - `prewarm.startedAt`
  - `prewarm.completedAt`
  - route timings
- Add missing high-value routes to prewarm:
  - `/agent-club/goals`
  - `/agent-club/planner`
- Reorder prewarm around actual user navigation:
  - agents
  - goals
  - issues
  - planner
  - projects
  - runtimes
  - skills
  - scheduled/related screens as they exist
- Show warmup progress in `AgentManagerPage`.
- Keep the manager visible when possible instead of replacing it with blank loading space.

Expected files:

- `src/common/types/agentManager.ts`
- `src/process/services/agentManager/AgentManagerService.ts`
- `src/renderer/pages/AgentManagerPage.tsx`

Verification:

```bash
bunx tsc --noEmit --pretty false
```

```bash
node - <<'NODE'
const paths = [
  '/agent-club-boot?next=%2Fagent-club%2Fagents',
  '/agent-club/agents',
  '/agent-club/goals',
  '/agent-club/issues',
  '/agent-club/planner',
  '/agent-club/projects',
  '/agent-club/runtimes',
  '/agent-club/skills'
];
for (const p of paths) {
  const start = performance.now();
  const res = await fetch(`http://localhost:3330${p}`);
  await res.arrayBuffer();
  console.log(`${p} ${res.status} ${((performance.now() - start) / 1000).toFixed(3)}s`);
}
NODE
```

## Phase 2: Reduce Dev Compile Cost

Goal: clicking around during development should not feel broken.

Options to test, in order:

1. Add an opt-in `next dev --turbopack` mode for the embedded manager web app.
2. If stable, make it the default for local Agent Club development.
3. If unstable, keep webpack but improve route prewarm and package-like preview mode.
4. Add a local "manager web warm" script for known routes so startup can compile the main screens before the user starts navigating.

Expected files:

- `apps/agent-manager/apps/web/package.json`
- `apps/agent-manager/package.json`
- `src/process/services/agentManager/AgentManagerService.ts`

Verification:

- compare route timing table before and after;
- confirm no Next runtime errors in `apps/agent-manager/apps/web/.next/dev/logs/next-development.log`;
- manually click Goals, Issues, Planner, Agents, Runtimes, and Skills in the embedded page.

## Phase 3: Stop Avoidable Iframe/Auth Churn

Goal: route changes should feel like navigation inside one app, not a fresh embedded login.

Implementation shape:

- Keep a stable iframe once the manager is ready.
- Only use `/agent-club-boot` for first auth or invalid session.
- Do not increment iframe `frameKey` unless the web URL or auth/session state changes.
- If `nextPath` changes while iframe is mounted, navigate the iframe to the desired route directly when safe.
- Keep the last working iframe visible while status refreshes.

Expected file:

- `src/renderer/pages/AgentManagerPage.tsx`

Risk:

- must avoid stale auth loops and cross-origin assumptions.

## Phase 4: Split Heavy Manager Chrome

Goal: every manager route should not pay for all overlays immediately.

Candidates:

- lazy-load `SearchCommand`;
- lazy-load `ChatWindow` and `ChatFab`;
- load `StarterContentPrompt` only where it is needed;
- defer non-critical presence/inbox/pin prefetch until after route paint;
- keep sidebar data fetching cached and shared.

Expected files:

- `apps/agent-manager/packages/views/layout/dashboard-layout.tsx`
- `apps/agent-manager/packages/views/layout/app-sidebar.tsx`
- `apps/agent-manager/packages/core/agents/use-workspace-presence-prefetch.ts`

Verification:

- bundle size check from `.next/dev/server/app/.../page.js`;
- route timing comparison;
- manual click path still opens search, chat, sidebar, and modals.

## Phase 5: Make The Shell And Manager Share Live State

Goal: Dashboard, Scheduled Tasks, Chat, and Local Agent Manager should present the same work state.

Implementation shape:

- Expand `getDashboardSummary()` for:
  - active goals;
  - blocked issues;
  - recent agent runs;
  - registered runtimes;
  - Hermes scheduled jobs;
  - warmed manager routes and readiness.
- Add shell shortcuts into exact manager routes.
- Add sidebar badges for active goals, queued work, and blocked work.
- Route `/goal` chat actions into manager work and return deep links to the board/goal/issue.

Expected files:

- `src/process/services/dashboard/DashboardService.ts`
- `src/process/services/agentManager/AgentManagerService.ts`
- `src/common/types/dashboard.ts`
- `src/common/types/agentManager.ts`
- `src/renderer/components/layout/Sider/index.tsx`
- `src/renderer/pages/DashboardPage.tsx` or dashboard widgets as needed.

## Phase 6: Package-Like Runtime Mode

Goal: separate dev compile pain from real packaged app performance.

Implementation shape:

- Support using a built manager web bundle in local desktop dev when desired.
- Keep a separate true-dev mode for Multica UI development.
- Surface which mode is active in the manager status panel.

This is a later slice because it can affect how Multica developers iterate.

## First Safe Worker Slice

Objective:

Implement honest manager UI warmup and prewarm coverage.

Allowed files:

- `src/common/types/agentManager.ts`
- `src/process/services/agentManager/AgentManagerService.ts`
- `src/renderer/pages/AgentManagerPage.tsx`

Definition of done:

- `AgentManagerStatus` exposes prewarm state and route progress.
- Goals and Planner are included in the warm route list.
- The manager page shows warming progress without blanking the current view.
- Logs or status include route timing.
- Typecheck passes.
- The route timing script shows no missing high-value route from the warm list.

Stop if:

- the change requires modifying the embedded Multica route code;
- the iframe cannot safely remain stable without auth churn;
- typecheck fails twice;
- route warmup causes backend or Next dev instability.

## Open Questions

- Should Agent Club default to a persistent hidden manager iframe after startup, so route warmup also warms the real browser context?
- Should `next dev --turbopack` become default, or stay behind an env flag until it is tested on the embedded manager?
- Which manager routes are truly top-level for Sam's daily workflow: Goals, Issues, Planner, Agents, Runtimes, Skills, or Dashboard-derived links?
- Should Scheduled Tasks become a shell-native view backed by manager jobs, or remain separate but linked?

## Audit Result

The plan addresses the full user outcome at the planning level:

- real performance bottlenecks were measured;
- dev compile latency is separated from backend/runtime latency;
- Local Agent Manager remains the source of truth;
- Agent Club shell remains the user-facing operating layer;
- implementation is split into reversible slices with measurable proof.

The full product outcome is not complete until implementation and manual app validation happen.
