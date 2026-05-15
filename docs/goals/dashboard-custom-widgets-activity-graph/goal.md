# Dashboard Custom Widgets And Activity Graph

## Original Request

Sam wants the personal chief-of-staff dashboard to grow beyond a fixed status page: add an activity graph like the provided screenshot, surface relevant high-priority links such as important email when Honcho/source context says it matters, make widgets draggable/reorderable, and create a dashboard-only customization surface where prompts can add or change widgets/screens live, similar to a live artifact or Claude Cowork-style workspace.

## Interpreted Outcome

Build the next Agent Club dashboard tranche so it becomes a composable chief-of-staff workspace:

- A compact activity heatmap/stat widget that resembles the screenshot but uses truthful Agent Club/Honcho/AIOS activity signals.
- A relevant-links widget that can surface high-priority email/calendar/todo/source links only when connected sources or Honcho context justify it.
- Draggable dashboard widgets with persisted order/layout.
- A safe dashboard widget registry or extension boundary so custom dashboard widgets/screens can be added without turning the whole app into editable product code.
- A prompt-driven customization area in the dashboard where Sam can ask for a widget such as a revenue dashboard, review the generated/spec-driven widget, and place it into the dashboard.

## Input Shape

open_ended

## Audience

Sam, using Agent Club as a personal chief-of-staff dashboard and as a demo/resource for the webinar and AI operating systems course.

## Non-Goals And Constraints

- Do not fake live email/calendar/todo/revenue data. Show disconnected/setup states or mock-preview labels when sources are not connected.
- Honcho remains the personal source of truth for memory-derived priorities and relevance.
- GoalBuddy is only the execution/validation board, not the shipped product architecture.
- Local Agent Manager / Agent Club should remain the product source of truth for goals, tasks, agent activity, and in-app links.
- Do not introduce arbitrary unsandboxed code execution from dashboard prompts.
- Keep the first implementation tranche demoable and visually compact; avoid a giant blank dashboard section.
- Preserve the current three priority focus lanes: webinar prep, AIOS course video, and Agent Club demo readiness.

## Likely Misfire

The goal could accidentally become a generic analytics dashboard or a hand-wavy codegen sandbox. The correct product shape is a source-grounded, editable chief-of-staff workspace where widgets are composable, source-aware, and safe to evolve.

## Blind Spots To Resolve

- Which activity signals are available locally today without inventing data.
- Whether draggable layout should use an existing library or lightweight native implementation.
- How to separate dashboard-only custom widgets from the rest of the application code.
- How prompt-generated widgets should be represented: declarative JSON specs, persisted TypeScript modules, sandboxed iframes, or staged code patches.
- How relevant links should deep-link into Agent Club, Gmail, calendar, todos, or setup screens without leaking private data or making unsupported connector assumptions.

## Completion Proof

The tranche is complete when the running Agent Club dashboard demonstrates:

- A visible activity heatmap/stat widget based on truthful local/dashboard activity data.
- A relevant-links widget with source-grounded cards and honest disconnected/setup states.
- Widgets can be reordered by drag and the order persists after refresh.
- A dashboard customization prompt can create or update at least one safe custom widget/spec and place it on the dashboard.
- Verification passes with typecheck/lint/diff checks and a live browser/Electron smoke test of the dashboard route.

## Starter Command

/goal Follow docs/goals/dashboard-custom-widgets-activity-graph/goal.md.
