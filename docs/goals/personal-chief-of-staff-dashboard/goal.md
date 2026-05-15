# Personal Chief-of-Staff Dashboard

## Objective

Implement a native Agent Club `Dashboard` tab directly under Search. The dashboard should act as a personal chief-of-staff surface that uses the user's memory, active agent work, scheduled tasks, and future email/calendar/todo connectors to surface important insights, actions, automation opportunities, and long-running goals.

## Original Request

Make a personal dashboard called "Dashboard" under Search. It should be a personal chief of staff that surfaces key insights from memory, actions to take from email/meetings/todos, active things agents are working on, Honcho-memory-derived insights, automations that could save time, queued/scheduled tasks, total completed tasks or tickets, estimated AIOS time saved, and automation recommendations. Create the plan, make it a `/goal`, spin up the board, and implement it.

## Intake Summary

- Input shape: `broad_product_request`
- Audience: Sam using Agent Club as a local operating cockpit for agents, goals, memory, and automations.
- Authority: requested
- Proof type: local app implementation plus checks and browser smoke.
- Completion proof: Agent Club has a visible Dashboard item under Search, a working `/dashboard` route, real local snapshot data from available Agent Club services, source health for unavailable connectors, and a usable dashboard UI with actions, active work, metrics, queued tasks, and automation recommendations.
- Likely misfire: Shipping only a static mockup, putting the tab in the wrong sidebar location, pretending email/calendar/todo data is connected when it is not, or storing raw private email content in dashboard snapshots.

## Product Direction

The dashboard is a Hermes/OpenClaw-style personal chief of staff. V1 should be useful even before every connector exists:

- Use real available local sources first: Honcho memory config/snapshot, Scheduled Tasks, Local Agent Manager status, and local task counts.
- Treat email, calendar, and todo lists as source adapters with health states. If disconnected, show setup and preview-only actions rather than fabricated data.
- Persist only lightweight dashboard snapshots. Avoid raw email bodies, full meeting notes, and private todo text until the user explicitly connects those sources and confirms retention behavior.
- Prefer Hermes when it is available for future heartbeat generation, then OpenClaw, then Codex/Claude fallback. Do not make the V1 page unusable when Hermes is absent.
- External side effects, especially email/todo/calendar writes, must require explicit confirmation.

## V1 Sections

- Today's Brief: chief-of-staff summary, top insight, and next best move.
- Action Required: user actions inferred from connected sources or local agent state.
- Active Work: currently active agent/task/scheduled work and insights from memory.
- Automation Ideas: recommendations that could save time over repeated workflows.
- AIOS Metrics: completed tasks/tickets, scheduled runs, queued tasks, next scheduled task, and estimated time saved.
- Source Health: Honcho memory, Scheduled Tasks, Local Agent Manager, email, calendar, and todos.

## Non-Negotiable Constraints

- Dashboard nav item must appear directly under Search and before Scheduled Tasks.
- Use existing Agent Club UI patterns and routing.
- Do not block on missing external credentials. Show honest disconnected states and setup actions.
- Do not make claims from personal memory unless the local source is actually available.
- Keep the implementation local, reversible, and scoped to the dashboard feature.
- Preserve unrelated user changes.

## Stop Rule

Stop only after the dashboard is implemented, visible in the local app, and verified enough to hand to Sam. If a connector is unavailable, mark that exact source as disconnected and keep the local dashboard useful.

## Canonical Board

Machine truth lives at:

`docs/goals/personal-chief-of-staff-dashboard/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/personal-chief-of-staff-dashboard/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Work only on the active board task.
5. Write a compact task receipt.
6. Update the board.
7. If Judge or PM selects a safe Worker task, activate it and continue unless blocked.
8. Finish only with a Judge/PM audit receipt that maps implementation and verification back to the original user outcome.
