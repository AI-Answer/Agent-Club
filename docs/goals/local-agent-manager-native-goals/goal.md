# Native Goals in Local Agent Manager

## Objective

Implement native goals inside Local Agent Manager / Multica so Agent Club can plan goals inside projects, expand those goals into normal Multica work items, route that work to local agents, and track progress over time in the Local Agent Manager UI.

## Original Request

Make the native Local Agent Manager goals plan into a `/goal`, spin up the board in the browser, and run it. GoalBuddy is only a model for how Codex goals expand into agent work; the product feature should live in Local Agent Manager.

## Intake Summary

- Input shape: `existing_plan`
- Audience: Sam, using Agent Club as a local agent operating cockpit.
- Authority: `requested`
- Proof type: `test`
- Completion proof: Local Agent Manager has native project-scoped goals, goal-linked issue boards, goal expansion into agent work, and visible agent/task tracking, with checks passing and changes pushed to GitHub.
- Likely misfire: Building a GoalBuddy sync or separate duplicate board system instead of native Multica goals.
- Blind spots considered: Source of truth, project-vs-goal relationship, sub-agent tracking, planner-agent defaults, and avoiding provider-specific internal subagent capture in v1.
- Existing plan facts: Projects are top-level containers; each project can have multiple goals; goal cards are normal issues; the goal page is a planning room where AI can expand goals into work and route agents/sub-agents.
- Added requirement: like `npx goalbuddy agents`, Local Agent Manager goal runs should have an agent-readiness layer that enables or selects required planner/worker/reviewer sub-agents when needed, and clearly shows missing setup instead of silently running without the right agents.

## Goal Kind

`existing_plan`

## Current Tranche

Complete successive safe implementation slices until Local Agent Manager has a usable native goals v1: goal CRUD, project-scoped goal lists, goal-linked issues and boards, goal expansion through a planner agent, and enough verification to trust the workflow locally.

## Non-Negotiable Constraints

- Do not make GoalBuddy a product dependency, sync layer, or visible product board.
- Projects remain top-level containers; goals belong to projects.
- Goal Kanban cards are normal Multica issues with goal linkage.
- Reuse existing Multica issue status, assignment, comments, task runs, execution logs, and squads where possible.
- Default goal planning/expansion to Hermes Chief of Staff when available, but keep the feature usable with any available local planner agent.
- Goal runs must check required sub-agent roles before expansion or execution, prefer enabled local agents/squads for planner/worker/reviewer work, and expose actionable setup/test states when a required role is missing.
- Track sub-agent work through existing agents, squads, issue assignments, task runs, comments, and execution logs in v1.
- Keep changes scoped to Agent Club / Local Agent Manager and preserve unrelated user changes.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after a single verified Worker slice when the broader owner outcome still has safe local follow-up slices. After each slice audit, advance the board to the next highest-leverage safe Worker task and continue.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal toward the full outcome.

## Canonical Board

Machine truth lives at:

`docs/goals/local-agent-manager-native-goals/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/local-agent-manager-native-goals/goal.md.
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
9. If Judge selected a safe Worker task with `allowed_files`, `verify`, and `stop_if`, activate it and continue unless blocked.
10. Treat slice audits as checkpoints, not completion, unless they explicitly prove the full original outcome is complete.
11. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.
