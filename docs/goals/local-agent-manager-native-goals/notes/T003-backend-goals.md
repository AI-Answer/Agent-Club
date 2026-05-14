# T003 Backend Goal CRUD Receipt

## Result

Done.

## Implemented

- Added native `goal` table scoped to `workspace_id` and `project_id`.
- Added sqlc CRUD/list queries and generated Go query/model code.
- Added workspace-protected Go handlers and `/api/goals` routes for list, get, create, update, and delete.
- Added TypeScript `Goal` types, API client methods, React Query helpers, mutations, and package exports.

## Verification

- `cd apps/agent-manager && PATH="/tmp/agent-club-bin:$PATH" make sqlc`
- `cd apps/agent-manager/server && go test ./internal/handler ./cmd/server`
- `cd apps/agent-manager && pnpm --filter @multica/core typecheck`

## Notes

- The repo's `make sqlc` target assumes `sqlc` is installed. This environment did not have it on `PATH`, so generation used a Go-installed sqlc v1.30.0 binary under `/tmp/agent-club-bin`.
- This slice intentionally did not add `issue.goal_id`, UI, or planner expansion; those remain queued follow-up slices.
