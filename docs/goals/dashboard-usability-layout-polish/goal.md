# Dashboard Usability Layout Polish

## Original Request

Sam wants the Agent Club personal dashboard cleaned up after the widget/customization pass: reduce empty space, stop crowding, make the activity monitor tiny, make the layout responsive horizontally and vertically, add a clear collapse/restore path for hidden widgets, fix hide behavior so more than one thing can be hidden and restored, and test the dashboard thoroughly.

## Interpreted Outcome

Agent Club's dashboard should feel like a usable work surface rather than a large card stack. The current useful widgets stay, but their layout, sizing, collapse, hide, and restore behavior should become compact, discoverable, responsive, and verified.

## Input Shape

recovery

## Current Evidence From Sam

- Screenshot shows large empty placeholder-like space and wasted real estate.
- Screenshot shows `Today's Brief + Sources` consuming a huge vertical section with sparse content.
- Screenshot shows the activity reference should be a tiny compact monitor, not a large dashboard block.
- Screenshot and notes suggest hide/collapse restore is unclear and may only work for one widget.
- Sam explicitly wants tests for all of this.

## Non-Goals And Constraints

- Do not remove the existing useful dashboard widgets/screens.
- Do not fabricate email/calendar/todo/source data.
- GoalBuddy remains the execution board only; Agent Club is the product surface.
- Keep Honcho/local Agent Manager/source-health truthfulness from the prior dashboard work.
- Preserve the current chief-of-staff focus lanes unless a separate product decision changes them.
- Avoid a full redesign that delays the usability fix.

## Likely Misfire

The run could make the dashboard prettier but still leave unusable vertical whitespace, unclear hidden-widget recovery, or untested drag/hide behavior. It could also accidentally delete useful current sections instead of compacting and making them manageable.

## Completion Proof

The tranche is complete when the running dashboard at `http://localhost:5173/#/dashboard` demonstrates:

- No giant blank/low-density widget area on desktop.
- Activity monitor is compact/tiny relative to the rest of the dashboard.
- Widgets use available horizontal space responsively and stack cleanly at narrower widths.
- The current useful widgets remain available by default.
- Multiple widgets can be hidden, the hidden/collapsed area is obvious, and each hidden widget can be restored.
- Drag/reorder and hide/restore are covered by live browser/Electron smoke checks.
- `bunx tsc --noEmit`, `bunx oxlint --quiet`, `git diff --check`, and GoalBuddy state check pass.

## Starter Command

/goal Follow docs/goals/dashboard-usability-layout-polish/goal.md.
