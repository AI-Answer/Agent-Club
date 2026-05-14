# T001 Scout Map

## Current Flow

- `src/common/chat/goalSlashCommand.ts` parses `/goal prep <text>` as prep and `/goal <text>` as run. Empty `/goal` currently returns an error.
- `src/renderer/hooks/chat/useChatGoalCommand.ts` intercepts the command, calls `ipcBridge.agentManager.handleChatGoalCommand`, immediately navigates to `/agent-manager?next=...`, and shows only a toast.
- Runtime sendboxes call the hook before sending normal text, so one hook change can affect ACP, Gemini, OpenClaw, AionRS, Nanobot, and Remote.
- `src/process/services/agentManager/AgentManagerService.ts` creates a native Local Agent Manager goal and expands it only for `run`.

## Native Link Targets

- Goal detail and goal issue board: `/{workspaceSlug}/goals/{goalId}`.
- Project detail: `/{workspaceSlug}/projects/{projectId}`.
- Goals list: `/{workspaceSlug}/goals`.
- The embedded boot route accepts `AGENT_MANAGER_BOOT_PATH?next=<workspace path>`, which is safest for links from Agent Club chat.

## Persistence Point

- The lowest-risk prepared-goal context can live in renderer `localStorage` keyed by conversation id, because approval phrases are chat-local and only need to find the most recent prepared goal for that conversation.
- Main-process service should still own durable native state: created goal, project id, markdown path, and expansion.

## Markdown Artifact

- `AgentManagerService` already has filesystem access and receives `sourceWorkspacePath`, so it can create `docs/goals/<slug>/goal.md` under the active workspace when available.
- The markdown path should be returned in the command result and included in the native goal description metadata.

## Recommended Worker Slice

Implement a single vertical slice:

- Extend the parser for empty `/goal` as "run latest prepared goal" and add approval phrase detection.
- Extend request/result types with `goalId`, `projectId`, `projectUrl`, `boardUrl`, and `markdownPath`.
- Have the service create markdown artifacts and run an existing prepared goal when `goalId` is provided.
- Change the renderer hook to stop auto-navigating, store prepared goal refs, intercept approval phrases, and add a markdown chat message with links.
- Verify by parser smoke, TypeScript, API smoke, and Electron smoke.

## Ambiguity

`/cool` is likely a typo for `/goal`; do not add it as an alias unless the user confirms it intentionally.
