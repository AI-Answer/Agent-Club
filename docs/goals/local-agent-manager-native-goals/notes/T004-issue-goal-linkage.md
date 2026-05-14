# T004 Issue Goal Linkage Receipt

## Result

Done.

## Implemented

- Added `issue.goal_id` migration and index.
- Added `goal_id` to issue SQL rows, create/update queries, list/open/count filters, and search scans.
- Added create/update inheritance so child issues inherit parent `goal_id`, and goal-linked issues inherit or validate their project from the goal.
- Added `goal_id` to issue API responses and TypeScript issue/API types.
- Added issue list/create/update API and CLI support for `--goal`.
- Added `multica goal` CLI commands for list, get, create, update, delete, and status.

## Verification

- `cd apps/agent-manager && PATH="/tmp/agent-club-bin:$PATH" make sqlc`
- `cd apps/agent-manager/server && go test ./internal/handler ./cmd/multica`
- `cd apps/agent-manager && pnpm --filter @multica/core typecheck`
- `cd apps/agent-manager && pnpm --filter @multica/core test -- issues/ws-updaters.test.ts`

## Notes

- The server rejects mismatched `goal_id` + `project_id` pairs and auto-fills `project_id` from the goal when possible.
- Existing project-only issue behavior remains valid for issues not attached to a goal.
