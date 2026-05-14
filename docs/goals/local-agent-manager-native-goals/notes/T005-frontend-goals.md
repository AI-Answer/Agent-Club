# T005 Frontend Goals Receipt

## Result

Implemented native Local Agent Manager goal navigation and goal planning surfaces.

## What Changed

- Added `/goals` and `/goals/:id` web routes plus matching desktop routes.
- Added a Goals sidebar entry and kept workspace shortcut behavior goal-aware.
- Added a goals list page, goal detail planning room, inline goal editing, create-goal modal, and project detail goals section.
- Scoped the existing issue board/list/create flows by `goal_id` so cards remain normal Multica issues while a goal gets its own board view.
- Added goals locale resources for English and Simplified Chinese and preserved locale parity.
- Added core path, modal, goal config, and package exports for the new surface.

## Verification

- `cd apps/agent-manager && pnpm -w exec tsc --noEmit`
- `cd apps/agent-manager && pnpm --filter @multica/core test -- paths`
- `cd apps/agent-manager && pnpm --filter @multica/views test -- projects goals layout`
- Browser smoke: opened `http://localhost:3330/agent-club-boot?next=%2Fagent-club%2Fgoals`, landed on `http://localhost:3330/agent-club/goals`, and confirmed the page shows `Goals`, `New Goal`, `No goals yet`, and `Create first goal`.

## Caveats

- The initial browser navigation timed out while Next compiled the new route, then succeeded after the route was warm.
- The route needs the local `agent-club-boot` auth helper in a fresh browser context.
- Planner expansion and sub-agent readiness are intentionally deferred to T006.
