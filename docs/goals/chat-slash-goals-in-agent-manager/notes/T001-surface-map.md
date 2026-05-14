# T001 Scout Receipt

## result: done

Mapped. Agent Club chat can intercept `/goal` in the shared send path, then call the existing Local Agent Manager native goal APIs through the main-process Agent Manager service.

## summary

The shortest safe path is an app-level chat slash command that is parsed before runtime send. It should call a new Agent Manager IPC method backed by `AgentManagerService`, which can authenticate locally and create/run native Local Agent Manager goals under the existing Agent Club workspace.

## evidence

- Shared chat input/menu:
  - `src/renderer/components/chat/sendbox.tsx` owns builtin slash commands, slash menu selection, and final `onSend(finalMessage)`.
  - `src/renderer/hooks/chat/useSlashCommands.ts` merges agent-provided commands with app commands.
  - `src/renderer/hooks/chat/useSlashCommandController.ts` supports `/goal` menu discovery while longer `/goal prep ...` text can be handled at submit time.
- Runtime-specific send paths:
  - `src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx` owns ACP/Codex/Claude `onSendHandler`.
  - `src/renderer/pages/conversation/platforms/gemini/GeminiSendBox.tsx` owns Gemini `onSendHandler`.
  - `src/renderer/pages/conversation/platforms/openclaw/OpenClawSendBox.tsx` owns OpenClaw `onSendHandler`.
- Main-process integration point:
  - `src/process/bridge/agentManagerBridge.ts` already exposes Agent Manager IPC.
  - `src/process/services/agentManager/AgentManagerService.ts` already starts the backend/web/daemon, creates local login tokens, knows frontend/backend URLs, and seeds the default `Agent Club Operating Board`.
- Native Local Agent Manager APIs:
  - `apps/agent-manager/server/internal/handler/goal.go` supports create, update, readiness, and expand.
  - `apps/agent-manager/packages/core/api/client.ts` exposes `listProjects`, `createGoal`, `getGoalReadiness`, and `expandGoal`.
  - `apps/agent-manager/packages/core/paths/paths.ts` routes native goal detail pages at `/agent-club/goals/{id}`.
  - `apps/agent-manager/packages/views/goals/components/goal-detail.tsx` already shows goal detail plus board/list issues and expansion.

## Recommended Semantics

- `/goal prep <goal text>`:
  - Parse the command in Agent Club chat.
  - Create a native Local Agent Manager goal in the default project unless a `project:` hint matches an existing project.
  - Store source chat/session context and `#tags` in the goal description for now because native goal tags do not exist yet.
  - Open the Local Agent Manager iframe on the created goal detail route.
- `/goal <goal text>`:
  - Create the native goal using the same rules.
  - Immediately call native readiness/expand so the Local Agent Manager queues observable work.
  - Open the native goal detail route where prepared cards, issues, and agent activity live.
- `/goal run <goal text>` should be accepted as an explicit synonym for `/goal`.

## Risks And Stops

- Goal tags are not a native schema surface today. Use project assignment plus description metadata first; native goal labels can be a follow-up.
- The iframe currently always boots to agents. It needs a small route override so chat commands can open a specific goal.
- The goal API requires auth and workspace context. The main-process Agent Manager service is the safest place to create goals because it can mint a local session token and send `X-Workspace-Slug: agent-club`.
- If readiness fails because there are not enough enabled local agents, the command should still create/open the goal and surface the native readiness error instead of pretending it ran.

## First Worker Slice

Add a common `/goal` parser, extend Agent Manager IPC/service with a chat goal command endpoint, add `/goal` to the slash menu, intercept it in the ACP/Gemini/OpenClaw send handlers, and let `AgentManagerPage` accept a `next` route for opening the created goal.
