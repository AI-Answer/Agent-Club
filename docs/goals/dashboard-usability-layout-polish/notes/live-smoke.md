# Live Smoke Evidence

Date: 2026-05-14

Target: `http://localhost:5173/#/dashboard`

## Static Checks

- `bunx tsc --noEmit`: pass
- `bunx oxlint --quiet`: pass with existing warnings, 0 errors
- `git diff --check`: pass

## Runtime Checks

- Restarted the Agent Club dev app with `bun start` so the main-process dashboard service picked up layout defaults.
- Dashboard grid width in the current app window: 1077px.
- Widget controls bar is always present: `12 visible`, `0 hidden`, `Show all`.
- Activity widget after compaction: 351px wide by 293px tall, using `xl:col-span-4`.
- Multiple hide/restore smoke:
  - Hid `Metrics` and `Activity` together.
  - Widget controls changed to `10 visible`, `2 hidden`, with `Show Metrics` and `Show Activity`.
  - Restored both widgets.
  - Widget controls returned to `12 visible`, `0 hidden`.
- Existing widgets remained available:
  - Focus This Week
  - Key Insights
  - Active Work
  - Metrics
  - Relevant Links
  - Activity
  - Today's Brief + Sources
  - Action Required
  - Things To Automate
  - Build A Widget
  - Revenue dashboard
  - Manual Reorientation

## Drag Caveat

The live DOM verified every visible widget still has a drag handle, including `Drag Activity`. Raw CDP pointer/keyboard drag simulation was unreliable in this Electron window, and Computer Use could not run because macOS Accessibility/Screen Recording permissions stayed pending. The UI still exposes the dnd-kit drag handles and the layout persistence path was exercised by hide/restore updates.
