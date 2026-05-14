# T003 Worker Receipt

## Result

Done.

## Summary

Implemented the guided Agent Club chat goal vertical slice:

- `/goal prep <details>` creates a planned native Local Agent Manager goal under a resolved project.
- Prep writes a markdown artifact under `docs/goals/<slug>/goal.md` when a safe workspace path is available.
- Empty `/goal` and approval phrases such as `go ahead` run the latest prepared goal for the conversation.
- Direct `/goal <details>` still creates and starts a new goal.
- Chat receives a durable result message with project, goal, project board, and markdown links.

## Changed Files

- `src/common/chat/goalSlashCommand.ts`
- `src/common/chat/goalResultMessage.ts`
- `src/common/types/agentManager.ts`
- `src/process/bridge/agentManagerBridge.ts`
- `src/process/services/agentManager/AgentManagerService.ts`
- `src/renderer/hooks/chat/useChatGoalCommand.ts`
- `src/renderer/pages/conversation/platforms/acp/useAcpInitialMessage.ts`

## Verification

- `pnpm exec tsc --noEmit`
- `cd apps/agent-manager && pnpm -w exec tsc --noEmit`
- Parser smoke for `/goal prep`, `/goal <text>`, empty `/goal`, and approval phrases.
- Electron/CDP smoke created a slash-prepped goal and verified the generated project-board link points at `/agent-club/projects/<projectId>`.
