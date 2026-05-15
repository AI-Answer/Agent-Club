# Month Map Planner And Agent Dispatch

## Objective

Build a native Month Map planner inside Agent Club's embedded Local Agent Manager that feels close to Samin's Google Sheets warm map, defaults to the current month, lets Samin freely edit priorities in a month grid, and can turn a planner item into Multica goal/project/issue work for an agent with a seamless prompt-and-dispatch flow.

## Original Request

Create a GoalBuddy goal, then execute `/goal` to develop the full personal warm map feature under Local Agent Manager. It should look and operate like Samin's Google Sheets month map, be easy for Samin and agents to update, let agents understand today's priorities, and support right-click/button agent dispatch from a planner task into Multica project/goal/issue execution. Test it across the application.

## Intake Summary

- Input shape: `existing_plan`
- Audience: Samin as the daily operator, with local agents as collaborators that read and update the planner.
- Authority: `requested`
- Proof type: `test`
- Completion proof: The app has a working Month Map route that opens to the current month, supports month tabs/colors/freeform day editing/objectives/notes/past-day gray/today highlight, can create/link and dispatch a Multica issue/goal/project from a planner item, exposes planner context to agent starts, supports agent/status updates back into the map, and passes focused backend/frontend plus end-to-end smoke verification.
- Likely misfire: Building a pretty standalone calendar or annual dashboard that does not preserve the messy spreadsheet workflow, does not connect to Multica execution, or makes GoalBuddy the shipped architecture instead of Local Agent Manager.
- Blind spots considered: Data model versus issue-only storage, current-month default behavior, app-shell routing, local timezone, editable freeform cells, month tab colors, agent context injection, retroactive agent updates, project/goal/issue linking, and smoke tests that prove the real project -> goal -> issue/task path.
- Existing plan facts:
  - Product home is Local Agent Manager / Multica inside Agent Club, not GoalBuddy.
  - User lives in the current month view, such as May, and does not need the RICE planner.
  - The yearly dashboard is optional and can be agent-maintained later; the month tab is the daily surface.
  - The Google Sheet source is `Samin - War Map 2026`, with month tabs, a `May` tab, freeform day text, gray old days, and bottom `Main Objectives` / `Notes`.
  - The v1 user surface should be a month grid with `Jan` through `Dec` style tabs, tab recoloring, click-to-edit/freeform entries, gray past days, today highlight, bottom objectives and notes, and a right-click or button action to start an agent.
  - Planner cells should stay human and messy; the linked Multica issue/goal/project becomes structured.
  - Agents should be able to read today/this-week/month priorities and update planner entries after work completes or changes.
  - Deep links and receipts should stay inside the Agent Club application window where possible.

## Goal Kind

`existing_plan`

## Current Tranche

Complete the full v1 vertical feature in safe verified slices: first map the current Local Agent Manager architecture and test commands, then implement the persistent planner model/API, Month Map UI, Multica dispatch/linking flow, agent context/update integration, app-shell navigation, and verification. Continue until a final audit proves the full original outcome is implemented and tested, not merely planned.

## Non-Negotiable Constraints

- Local Agent Manager / Multica is the product source of truth for shipped work.
- GoalBuddy is only the planning and validation board for this run.
- Preserve the user's spreadsheet-like month-first workflow; do not over-structure the day cells.
- Do not ship RICE scoring as part of this feature.
- Do not make the annual dashboard the main experience.
- Prefer existing Agent Club and `apps/agent-manager` patterns over new frameworks or detached services.
- Deep links for project, goal, issue, and board surfaces should open inside the Agent Club application window when applicable.
- Test backend, frontend, and end-to-end behavior enough to prove the feature works across the application.
- Work from the live checkout at `/Users/saminyasar/Agent-Club`.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not create one Worker/Judge pair per repeated file, table, route, or helper. Put repeated same-shape work into one Worker package and review the package as a whole.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

Small is not the goal. Useful is the goal.

A Worker should finish the whole assigned slice. A Judge should judge the whole assigned slice. A PM should reorient the board when tasks are safe but not moving the outcome.

## Canonical Board

Machine truth lives at:

`docs/goals/month-map-planner-agent-dispatch/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/month-map-planner-agent-dispatch/goal.md.
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
10. Review at phase, risk, rejected-verification, ambiguity, or final-completion boundaries; do not review every small Worker by habit.
11. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.
