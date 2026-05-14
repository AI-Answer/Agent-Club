# T002 Judge Receipt

## result: done

## decision

Proceed with a single native Agent Club chat command pipeline. `/goal prep` and `/goal` should parse in the Electron chat UI, call a new Agent Manager IPC endpoint, create the native Local Agent Manager goal through the existing backend, and open the embedded Local Agent Manager goal detail route.

## Worker Objective

Implement the full vertical slice:

- Parse `/goal prep`, `/goal run`, and `/goal`.
- Add an Agent Manager IPC method for chat goal commands.
- Create native goals in the Agent Club workspace and default project, with optional `project:` matching and `#tag` metadata in the description.
- For `/goal`, call native readiness/expand and report native readiness errors without hiding the created goal.
- Add `/goal` to the slash menu.
- Open the Local Agent Manager iframe directly to `/agent-club/goals/{id}`.

## allowed_files

- `src/common/chat/**`
- `src/common/types/agentManager.ts`
- `src/common/adapter/ipcBridge.ts`
- `src/process/bridge/agentManagerBridge.ts`
- `src/process/services/agentManager/**`
- `src/renderer/components/chat/sendbox.tsx`
- `src/renderer/hooks/chat/**`
- `src/renderer/pages/AgentManagerPage.tsx`
- `src/renderer/pages/conversation/platforms/**`
- `docs/goals/chat-slash-goals-in-agent-manager/**`

## verify

- `pnpm exec tsc --noEmit`
- `cd apps/agent-manager && pnpm -w exec tsc --noEmit`
- CLI/API smoke against the running Local Agent Manager: create a test goal and list it through the managed CLI/API.

## stop_if

- Native Local Agent Manager auth cannot be obtained from the main process.
- Goal expansion would require bypassing native readiness/issue/task tracking.
- Readiness fails because no local agents are enabled; in that case keep the created goal and report the native error.
