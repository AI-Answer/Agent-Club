# T001 Surface Map Receipt

## Scope Checked

- Main Agent Club renderer routes, sidebar, settings tabs, team/sidebar flow, and Agent Manager iframe shell.
- Agent Manager embedded services, local Multica daemon bridge, database/runtime seeding, web routes, sidebar, settings surface, and existing dashboard package.
- Existing hooks, MCP, skills/market, local agents, and whitelabel/product-branding surfaces.
- Live runtime ports and current detected agents.

## Key Findings

- Main UI already has `/agent-manager`, `/settings/hooks`, `/settings/capabilities`, `/scheduled`, and `/team/:id`.
- Agent Manager iframe boots through `AGENT_MANAGER_BOOT_PATH` and `AGENT_MANAGER_DEFAULT_WORKSPACE_PATH`; backend/web/db/runtime are started by `AgentManagerService`.
- Local Agent Manager runtime is healthy on backend `18330`, web `3330`, daemon health `20509`, and Postgres `55432`.
- Current daemon health reports agents `openclaw`, `claude`, and `codex`; Hermes is not currently detected.
- Agent Manager database has workspace slug `agent-club` and agents including `Codex Builder`, `Claude Assistant`, and `OpenClaw Operator`.
- Main app `LocalAgents` still exposes a development-only Agent Hub / install-from-market modal and orders agents as `aionrs`, `gemini`, then the rest.
- Existing MCP settings already support listing/syncing MCP servers across agents, but there is not yet a memory-specific Honcho/Supermemory settings section.
- Existing `HooksSettings` is currently about extension lifecycle hooks, not global agent memory hooks.
- Agent Manager has an existing dashboard package, but no visible dashboard route/nav item wired into the workspace shell.
- Agent Manager still has upstream Multica metadata in its boot HTML and some settings copy.

## Evidence

- `src/renderer/components/layout/Router.tsx`
- `src/renderer/components/layout/Sider/index.tsx`
- `src/renderer/components/layout/Sider/TeamSiderSection.tsx`
- `src/renderer/pages/AgentManagerPage.tsx`
- `src/common/config/appBrand.ts`
- `src/process/services/agentManager/AgentManagerService.ts`
- `src/renderer/pages/settings/AgentSettings/LocalAgents.tsx`
- `src/renderer/pages/settings/HooksSettings.tsx`
- `src/renderer/pages/settings/CapabilitiesSettings.tsx`
- `apps/agent-manager/packages/views/layout/app-sidebar.tsx`
- `apps/agent-manager/packages/core/paths/paths.ts`
- `apps/agent-manager/packages/views/settings/components/settings-page.tsx`
- `apps/agent-manager/packages/views/dashboard/components/dashboard-page.tsx`

## Runtime Snapshot

- Frontend: `localhost:5173`
- Agent Manager web: `localhost:3330`
- Agent Manager backend: `localhost:18330`
- Agent Manager Postgres: `localhost:55432`
- Local daemon health: `localhost:20509`
- Current daemon agents: `openclaw`, `claude`, `codex`

## Recommendation

Use the first implementation tranche for a low-risk visible foundation:

1. Remove the Agent Hub / install-from-market modal from Local Agents.
2. Reorder local agents so Hermes is first when present, followed by Codex, Claude Code, OpenClaw, then the rest.
3. Add a Memory settings section for Honcho and Supermemory plus global memory hook controls, initially storing local UI state/config only.
4. Wire the settings route/nav/i18n so the user can see the new Chief of Staff foundation immediately.
