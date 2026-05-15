# Dashboard Fast Return

## Objective

Make the Agent Club dashboard substantially faster and stop it from reloading or redoing expensive work when the user switches to another tab and comes back.

## Original Request

"Let's make sure our dashboard is optimized and loads a lot faster. Right now it's super slow and laggy and when I go to another tab and come back it's loading again."

## Intake Summary

- Input shape: `specific`
- Audience: Sam using Agent Club daily
- Authority: `requested`
- Proof type: `metric`
- Completion proof: A measured before/after check shows the dashboard loads faster, does not re-run the slow full loading path on tab return, and remains responsive when navigating away and back.
- Likely misfire: Only hiding the spinner or adding superficial loading text while the dashboard still recomputes expensive data, blocks the UI, or remounts on tab return.
- Blind spots considered:
  - The lag may be caused by backend snapshot generation, Honcho/dashboard memory calls, IPC bridge behavior, React remounting, route/tab lifecycle, or all of them.
  - The dashboard may need stale-while-revalidate behavior so cached content appears immediately while a refresh runs quietly.
  - Fixing the dashboard should not regress the Month Map planner or Local Agent Manager startup.
- Existing plan facts: Use a local live GoalBuddy board; start with evidence and measurement before implementation.

## Goal Kind

`specific`

## Current Tranche

Discover the actual reload/lag path, implement the largest safe useful dashboard performance slice, verify with tests and live app behavior, then continue to the next safe slice until the dashboard no longer feels slow or reloads unnecessarily on return.

## Non-Negotiable Constraints

- Preserve the existing dashboard functionality and source cards.
- Do not remove Honcho or Agent Manager dashboard sources just to make the page faster.
- Prefer cached/stale visible content over blank loading states when data is already available.
- Avoid broad unrelated refactors.
- Verify in the running app, not only with type checks.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after a single verified Worker package if the dashboard still reloads, lags, or lacks proof.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good Worker task should produce an observable dashboard improvement: cached instant return, reduced duplicate snapshot work, faster snapshot generation, or smoother route/tab behavior.

## Canonical Board

Machine truth lives at:

`docs/goals/dashboard-fast-return/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/dashboard-fast-return/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Measure before editing whenever the active task asks for performance proof.
4. Work only on the active board task.
5. Write a compact receipt with changed files, verification, and observed dashboard behavior.
6. Continue to the next safe local improvement until the dashboard is fast and return navigation does not reload the full page state.
