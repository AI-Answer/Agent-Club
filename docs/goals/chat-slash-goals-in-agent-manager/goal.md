# Chat Slash Goals in Local Agent Manager

## Original Request

Sam wants to type `/goal prep` and `/goal` from an Agent Club chat and have that create, prepare, run, and track a real native goal inside the Multica Local Agent Manager UI.

## Outcome

Agent Club chat becomes a goal intake surface:

- `/goal prep ...` creates or updates a native Local Agent Manager goal without launching work.
- `/goal ...` creates or selects a native Local Agent Manager goal and starts the goal expansion/run path.
- The user can attach the goal to a project, tag/context, or current chat source.
- The Local Agent Manager Goals UI shows the goal, prepared cards, assigned agents/sub-agents, and progress over time.
- GoalBuddy remains optional execution scaffolding for Codex planning, not the product source of truth.

## Non-Goals

- Do not build a second GoalBuddy sync product.
- Do not make GoalBuddy boards the only place to see progress.
- Do not require GitHub Projects or external credentials for the local workflow.
- Do not hide the created goal in files only; it must be visible in the Local Agent Manager UI.

## Likely Misfire

The work could accidentally add another local file board or chat macro while leaving Local Agent Manager unaware of the goal. That would miss the point. The native `goal`, `issue`, task-run, agent, squad, and runtime surfaces should carry the observable state.

## Completion Proof

From an Agent Club chat, a user can run a `/goal prep` style input, choose or infer project context, see a native goal appear in Local Agent Manager, and then run/expand it so the prepared issue cards and agent work are visible on the goal board.

## Starter Command

`/goal Follow docs/goals/chat-slash-goals-in-agent-manager/goal.md.`
