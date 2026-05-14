# Multica Goal Intake Flow

## Objective

Improve Agent Club's Multica-backed `/goal prep` and `/goal` chat flow so planning, native goal creation, board visibility, and clickable links feel like one coherent guided workflow instead of immediately jumping away from the chat.

## Original Request

Make changes to the GoalBuddy-style flow for Multica: `/goal prep` should help plan and create a goal markdown doc first, then a later "go ahead", "start actioning the goal", or `/goal` should start execution; the chat should show which project the goal is in, show the board/tasks, and return links to the board, goal, and project.

## Intake Summary

- Input shape: `specific`
- Audience: Sam using Agent Club chat as the thinking/work surface and Local Agent Manager/Multica as the observability surface.
- Authority: `requested`
- Proof type: `demo`
- Completion proof: From Agent Club chat, `/goal prep` creates a guided prepared goal with a markdown artifact and clickable links, while `/goal` or an approval phrase starts native actioning and shows linked project/goal/board surfaces in Local Agent Manager.
- Likely misfire: Treating `/goal prep` and `/goal` as the same immediate deep-link action, or creating only GoalBuddy files without visible native Multica/Local Agent Manager project, goal, board, and task links.
- Blind spots considered: Whether `/cool` was a typo or desired alias; how to connect chat approvals to the most recent prepared goal; how to represent board/task links if native Multica boards differ from GoalBuddy boards; avoiding accidental execution when the user only wants prep.
- Existing plan facts:
  - `/goal prep` should guide planning before execution.
  - Prep should create a goal markdown document as the first objective/artifact.
  - "go ahead", "start actioning the goal", or `/goal` should start actioning the prepared goal.
  - Chat response should tell the user which project contains the goal.
  - Chat response should include clickable links to the board, goal, and project.
  - The user wants to see scheduled/planned tasks in a board-like body.

## Goal Kind

`specific`

## Current Tranche

Design and implement the next coherent vertical slice of the Agent Club chat-goal intake: a two-step prep/run model that persists the prepared goal context, creates native Multica/Local Agent Manager goal and board visibility, and returns actionable links in chat. Continue through verification and final audit until the user can test the flow locally.

## Non-Negotiable Constraints

- Do not make `/goal prep` silently start execution.
- Do not make `/goal` lose the user's prepared markdown/intake context.
- Keep Local Agent Manager/Multica as the visible source of truth for project, goal, board/task state, and links.
- Preserve normal chat behavior for non-goal messages.
- Do not create a separate GoalBuddy-only tracking path for the product feature.
- Treat `/cool` as a possible typo for `/goal` unless Scout finds clear product intent for an alias.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can implement the requested flow.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. The first implementation slice should be a user-visible vertical path, not just a helper parser or doc artifact.

## Canonical Board

Machine truth lives at:

`docs/goals/multica-goal-intake-flow/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/multica-goal-intake-flow/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Re-check the intake: original request, input shape, authority, proof, blind spots, existing plan facts, and likely misfire.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
10. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.
