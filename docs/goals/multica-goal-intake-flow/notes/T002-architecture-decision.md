# T002 Architecture Decision

## Decision

Implement a two-step native chat-goal pipeline inside Agent Club:

- `/goal prep <text>` creates a planned native Local Agent Manager goal and a workspace markdown goal doc, stores the prepared goal reference for that conversation, and leaves the user in chat with clickable links.
- Empty `/goal`, `go ahead`, or `start actioning the goal` runs the latest prepared goal for that conversation by updating the native goal to `in_progress` and calling the native expansion endpoint.
- `/goal <text>` still supports a quick direct run for users who intentionally want to action a fresh goal.

Do not auto-navigate on prep or run. The chat response should provide links to the project, goal/board, and markdown path.

## Worker Objective

Implement the first vertical slice of the two-step flow: parser, request/result types, service create/run-prepared behavior, markdown artifact creation, prepared-goal storage, and in-chat result links.

## allowed_files

- `src/common/chat/goalSlashCommand.ts`
- `src/common/types/agentManager.ts`
- `src/process/services/agentManager/AgentManagerService.ts`
- `src/renderer/hooks/chat/useChatGoalCommand.ts`
- `docs/goals/multica-goal-intake-flow/**`

## verify

- `pnpm exec tsx -e "...parse goal prep, empty /goal, approval phrase, direct run..."`
- `pnpm exec tsc --noEmit`
- `cd apps/agent-manager && pnpm -w exec tsc --noEmit`
- Local API smoke for prep markdown creation and run-prepared expansion/readiness.
- Electron smoke that command results do not auto-navigate and include project/goal/board links in chat if practical.

## stop_if

- Implementing approval phrases requires changing all runtime sendboxes instead of the shared hook.
- Native Local Agent Manager cannot update or expand an existing prepared goal.
- Markdown file creation would need to write outside the active workspace or a safe fallback directory.
- Verification fails twice for reasons outside this slice.

## deferred

- Treat `/cool` as a typo unless the user asks for it as a real alias.
- First-class native goal tags remain separate future work.
