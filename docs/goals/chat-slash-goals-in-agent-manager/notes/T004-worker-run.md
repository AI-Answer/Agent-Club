# T004 Worker Receipt

## result: done

## summary

Implemented native `/goal` run behavior in the same chat command path. `/goal <text>` creates a native Local Agent Manager goal with `in_progress` status, calls the native `/api/goals/{id}/expand` readiness/expansion endpoint, opens the embedded Local Agent Manager directly to the goal detail route, and reports the native readiness error if expansion cannot start.

## changed_files

- `src/common/chat/goalSlashCommand.ts`
- `src/common/types/agentManager.ts`
- `src/common/adapter/ipcBridge.ts`
- `src/process/bridge/agentManagerBridge.ts`
- `src/process/services/agentManager/AgentManagerService.ts`
- `src/renderer/hooks/chat/useChatGoalCommand.ts`
- `src/renderer/pages/AgentManagerPage.tsx`
- `src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx`
- `src/renderer/pages/conversation/platforms/aionrs/AionrsSendBox.tsx`
- `src/renderer/pages/conversation/platforms/gemini/GeminiSendBox.tsx`
- `src/renderer/pages/conversation/platforms/nanobot/NanobotSendBox.tsx`
- `src/renderer/pages/conversation/platforms/openclaw/OpenClawSendBox.tsx`
- `src/renderer/pages/conversation/platforms/remote/RemoteSendBox.tsx`

## commands

- command: `pnpm exec tsx -e "...parse /goal run and default /goal behavior..."`
  status: pass
- command: `pnpm exec tsc --noEmit`
  status: pass
- command: `cd apps/agent-manager && pnpm -w exec tsc --noEmit`
  status: pass
- command: `node --input-type=module -e "...local login, create temp goal, readiness, delete temp goal..."`
  status: pass

## notes

- `/goal run <text>` is supported as an explicit synonym.
- Expansion is not hidden behind a separate store; it uses the native Local Agent Manager readiness and task queue path.
- If expansion fails, the created goal still opens in Local Agent Manager with a warning so the user can fix readiness there.
