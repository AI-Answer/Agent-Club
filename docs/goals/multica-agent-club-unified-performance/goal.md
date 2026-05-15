# Multica + Agent Club Unified Performance Plan

## Objective

Create a plan-first GoalBuddy board for making Agent Club, the embedded Multica Local Agent Manager, and the local agent runtimes feel like one tightly coupled, fast application instead of separate slow surfaces.

## Original Request

Optimize the loading speed of the Local Agent Manager because clicking around compiles for too long, and plan how Multica, Local Agent Manager, and Agent Club agents can be more tightly coupled and feel like one application.

## Intake Summary

- Input shape: `existing_plan`
- Audience: Sam, as the Agent Club product owner and daily operator.
- Authority: `requested`
- Proof type: `artifact`
- Completion proof: A reviewed plan and execution board that maps current architecture, identifies speed bottlenecks, proposes tight-coupling product changes, defines measurable performance targets, and queues safe implementation slices for a later `/goal` run.
- Likely misfire: Only tuning one route or hiding loading states while the app still feels like separate Electron, iframe, backend, and agent-runtime systems.
- Blind spots considered: dev-mode compile latency versus packaged runtime latency, Electron shell versus embedded Next.js costs, backend/runtime boot ordering, iframe bridge overhead, agent-status freshness, auth/session handoff, route prefetching, and whether "one app" requires architecture changes or only UX integration.
- Existing plan facts: Keep Local Agent Manager as the product source of truth for native goals and Multica work; GoalBuddy is a planning/validation layer. The target is a tighter Agent Club + Multica + agent-runtime experience with faster load and click response.

## Goal Kind

`existing_plan`

## Current Tranche

Plan and validate the integration/performance approach before implementation. The current tranche should produce an architecture map, bottleneck hypotheses with measurement commands, a product coupling plan, and a prioritized set of safe implementation work packages. Implementation starts only after the plan is validated through `/goal`.

## Non-Negotiable Constraints

- Do not replace the embedded Local Agent Manager direction without evidence and owner approval.
- Preserve Multica/Local Agent Manager as the native goal/task source of truth inside Agent Club.
- Optimize both perceived speed and real load/click latency; do not merely hide slow compiles with empty skeletons.
- Separate dev-mode compile issues from packaged-app/runtime issues.
- Keep changes low-breakage and compatible with the current Electron + embedded web architecture unless a Judge task explicitly approves a larger migration.
- Preserve existing Agent Club user workflows, including dashboard, channels, scheduled tasks, and Hermes Chief of Staff surfaces.
- No implementation files should be edited during this prep turn.

## Stop Rule

Stop this prep phase when the local visual board is live and the plan-first board is ready to run.

During the later `/goal` run, stop only when a final audit proves the planning tranche is complete and maps the proposed implementation slices to measurable performance and "one application" outcomes.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. A good implementation slice later should improve a real vertical path, such as app boot, embedded manager route navigation, runtime-status hydration, or shell-to-manager communication, rather than only adding tiny helpers.

## Canonical Board

Machine truth lives at:

`docs/goals/multica-agent-club-unified-performance/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/multica-agent-club-unified-performance/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Preserve the plan-first constraint: discover, measure, and plan before implementation.
5. Work only on the active board task.
6. Write compact task receipts with file paths, commands, measurements, and decisions.
7. Update the board.
8. If the plan is validated and safe implementation slices are clear, queue the first Worker package but do not mark the goal complete until the planning tranche is audited.
