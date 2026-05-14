# T006 Receipt: Agent Readiness And Goal Expansion

## Result

Done.

## What Changed

- Added native goal expansion endpoints:
  - `GET /api/goals/{id}/readiness`
  - `POST /api/goals/{id}/expand`
- Added a readiness layer that requires local planner, worker, and reviewer coverage before a goal can be expanded.
- Added goal expansion task context so the daemon receives goal title, description, project, and selected planner information.
- Added a planner prompt that requires the agent to inspect the existing goal and goal-linked issues before creating missing issues or sub-issues.
- Added UI readiness chips and an `Expand Goal` action to the goal detail page.
- Installed GoalBuddy's dedicated Scout, Worker, and Judge agent helpers with `npx goalbuddy agents`.
- Rebuilt and refreshed both bundled and managed local `multica` CLI binaries so spawned local agents can use `multica goal` and `multica issue create --goal`.

## Verification

- PASS: `cd apps/agent-manager && pnpm --filter @multica/core typecheck`
- PASS: `cd apps/agent-manager/server && go test ./internal/daemon ./internal/handler`
- PASS: `cd apps/agent-manager && pnpm -w exec tsc --noEmit`
- PASS: `cd apps/agent-manager && pnpm --filter @multica/views test -- goals`
- PASS: `cd apps/agent-manager && PATH="/tmp/agent-club-bin:$PATH" make sqlc`
- PASS: `cd apps/agent-manager/server && go test ./internal/service ./internal/daemon ./internal/handler`
- PASS: `cd apps/agent-manager && make build`
- PASS: `cd apps/agent-manager/apps/desktop && pnpm run bundle-cli`
- PASS: `apps/agent-manager/.agent-club/bin/multica --profile agent-club goal list --output json`
- PASS: Browser smoke showed `Agent readiness`, ready planner/worker/reviewer coverage, and `Expand Goal` on the goal detail page.
- PASS: Local smoke goal was deleted after verification.

## Notes

- GoalBuddy remains execution scaffolding for this run. The shipped product path is native Agent Club goals and issue boards.
- The readiness gate uses existing enabled local agents and squads. It does not silently install external provider tools or mutate credentials.
