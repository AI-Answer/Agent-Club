# T001 Surface Map

## Existing Primitives To Reuse

- Projects already exist as workspace-scoped containers in `apps/agent-manager/server/migrations/034_projects.up.sql`, with `issue.project_id` and project issue stats in `apps/agent-manager/server/pkg/db/queries/project.sql`.
- Issues already provide the Kanban work-card model in `apps/agent-manager/server/migrations/001_init.up.sql`, including statuses, priorities, assignee type/id, parent issues, acceptance criteria, context refs, positions, due dates, comments, labels, and dependencies.
- Issue queries already support project filtering through `project_id` in `apps/agent-manager/server/pkg/db/queries/issue.sql`, and the frontend issue list is already bucketed by status in `apps/agent-manager/packages/core/issues/queries.ts`.
- Agent execution already links to issues through `agent_task_queue.issue_id`, with task status, attempts, parent task retry links, session/workdir, trigger comments, and task messages in `apps/agent-manager/server/pkg/db/queries/agent.sql`.
- Quick-create already provides the closest planning-agent path: `QuickCreateIssue` in `apps/agent-manager/server/internal/handler/issue.go`, `EnqueueQuickCreateTask` in `apps/agent-manager/server/internal/service/task.go`, and `buildQuickCreatePrompt` in `apps/agent-manager/server/internal/daemon/prompt.go`.
- UI board components already exist and are reusable: `BoardView` in `apps/agent-manager/packages/views/issues/components/board-view.tsx` is used by Issues, My Issues, and Project Detail.
- Execution tracking already appears in issue detail through `ExecutionLogSection` in `apps/agent-manager/packages/views/issues/components/execution-log-section.tsx`.
- Routes are centralized in `apps/agent-manager/packages/core/paths/paths.ts`, and sidebar nav is centralized in `apps/agent-manager/packages/views/layout/app-sidebar.tsx`.

## Recommended Architecture

- Add first-class `goal` rows scoped to workspace and project.
- Add nullable `goal_id` to issues, not a new card table.
- Extend issue list filters with `goal_id`; build goal boards by reusing normal issue board components with that filter.
- Add goal expansion as a quick-create-like task context so a selected planner agent creates normal goal-linked issues/sub-issues using the CLI.
- Track sub-agent work through existing issue assignments, squads, task queue rows, comments, and execution logs in v1.

## Risks And Sequencing

- The first Worker slice should establish the data/API contract before touching UI: goals table, generated queries, handler routes, core API/types, and tests.
- `issue.goal_id` should be a separate slice because it touches issue CRUD, filtering, child issue inheritance, CLI flags, and cache behavior.
- Expansion should come after basic goal CRUD and goal-linked issues so the planner can target a stable API/CLI surface.
- Avoid duplicating BoardView logic; the UI slice should scope/filter existing issue lists.

