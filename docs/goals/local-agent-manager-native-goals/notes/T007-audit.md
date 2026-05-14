# T007 Judge Audit

## Decision

Complete for this slice.

## Full Outcome

`full_outcome_complete: true`

## Evidence

- Native goals are implemented in Local Agent Manager, not synced from GoalBuddy.
- Goals are project-scoped and route to normal Multica issues through `issue.goal_id`.
- Goal pages expose native boards and lists for goal-linked issues.
- Goal expansion is queued as a local daemon task and refuses to run until planner, worker, and reviewer coverage is ready.
- Expansion prompts require agents to inspect existing goal issues first, create only missing cards, pass `--goal` and `--project`, and use enabled agents or squads.
- The managed local CLI cache was rebuilt and refreshed so spawned agents have `multica goal` commands and `issue create --goal`.
- GoalBuddy agents were installed for the execution board itself, but GoalBuddy remains scaffolding only.

## Verification Reviewed

- PASS: `node .../check-goal-state.mjs docs/goals/local-agent-manager-native-goals/state.yaml`
- PASS: `cd apps/agent-manager && pnpm -w exec tsc --noEmit`
- PASS: `cd apps/agent-manager && pnpm --filter @multica/views test -- goals`
- PASS: `cd apps/agent-manager && make build`
- PASS: `cd apps/agent-manager/apps/desktop && pnpm run bundle-cli`
- PASS: `apps/agent-manager/.agent-club/bin/multica --profile agent-club goal list --output json`
- PASS: `apps/agent-manager/.agent-club/bin/multica --profile agent-club issue create --help` includes `--goal`, `--project`, and `--assignee-id`.
- PASS: App restarted and local daemon registered runtimes from the refreshed managed CLI.

## Residual Risk

- The first version does not build a separate historical analytics view for goal progress over time. It uses existing issue boards, task runs, comments, and runtime tracking as the v1 tracking surface.
- Provider credentials and external tools still need user-managed setup; readiness does not install or alter credentials.
