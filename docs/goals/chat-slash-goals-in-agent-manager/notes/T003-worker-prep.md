# T003 Worker Receipt

## result: done

## summary

Implemented native chat `/goal prep` intake. The shared sendbox now advertises `/goal`, chat text is parsed before it reaches any agent runtime, and a new Agent Manager IPC/service endpoint creates a native Local Agent Manager goal in the Agent Club workspace/project. Chat-created goals include source conversation, runtime, workspace path, project hint, tags, and original command metadata in the native goal description.

## changed_files

- `src/common/chat/goalSlashCommand.ts`
- `src/common/types/agentManager.ts`
- `src/common/adapter/ipcBridge.ts`
- `src/process/bridge/agentManagerBridge.ts`
- `src/process/services/agentManager/AgentManagerService.ts`
- `src/renderer/hooks/chat/useChatGoalCommand.ts`
- `src/renderer/components/chat/sendbox.tsx`
- `src/renderer/pages/AgentManagerPage.tsx`
- `src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx`
- `src/renderer/pages/conversation/platforms/aionrs/AionrsSendBox.tsx`
- `src/renderer/pages/conversation/platforms/gemini/GeminiSendBox.tsx`
- `src/renderer/pages/conversation/platforms/nanobot/NanobotSendBox.tsx`
- `src/renderer/pages/conversation/platforms/openclaw/OpenClawSendBox.tsx`
- `src/renderer/pages/conversation/platforms/remote/RemoteSendBox.tsx`

## commands

- command: `pnpm exec tsx -e "...parseChatGoalSlashCommand..."`
  status: pass
- command: `pnpm exec tsc --noEmit`
  status: pass
- command: `cd apps/agent-manager && pnpm -w exec tsc --noEmit`
  status: pass
- command: `node --input-type=module -e "...local login, create temp goal, delete temp goal..."`
  status: pass
- command: `node --input-type=module -e "...local login, create temp goal, readiness, delete temp goal..."`
  status: pass

## notes

- Project selection matches `project:`/`proj:` hints exactly or partially, falling back to `Agent Club Operating Board`.
- Native goal tags do not exist yet, so `#tags` are preserved as description metadata.
