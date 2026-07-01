# T003: Hosted Multica URL, Rebrand Surface, Upstream

Task: `T003`
Kind: `scout`
Status: `current`

## Summary

The app iframes a **LOCAL** Multica/Agent-Manager Next.js UI (default `http://localhost:3330`),
not a hosted URL. No hosted multica URL is wired anywhere in code — hosted domains appear only in
docs/.env. **The hosted URL to iframe is a USER BLOCKER.** Rebrand to "Agent Club" is partly done
(central knobs) but ~30 files + `aionui_*` assets still carry AionUi. Git has only `origin`
(Samin12/Agent-Club); no upstream iOfficeAI/AionUi remote → upstream unreachable until added.

## Iframe target (local, not hosted)

- `AgentManagerPage.tsx:189` sets iframe `src={frameUrl}`; frameUrl derives from `status.url` (default `http://localhost:3330`, line 17) via buildBootUrl/buildWorkspaceUrl. Web UI spawned locally by `AgentManagerService.ts` (DEFAULT_FRONTEND_PORT 3330, getFrontendUrl() :2168).
- No hosted multica URL is the iframe target anywhere. `MULTICA_APP_URL/SERVER_URL/REMOTE_API_URL` all localhost (AgentManagerService.ts:1008-1013).
- **Hosted candidates (docs/.env only):** `https://app.multica.ai` (app + /settings PAT login), `https://multica.ai`, `https://api.multica.ai`, `https://multica-api.copilothub.ai` (commented), `https://desktop-api.multica.ai`. **User must pick.**
- Iframing constraints: current iframe has NO sandbox; `allow='clipboard-read; clipboard-write; fullscreen'` (line 191). `handleFrameLoad` reads `contentWindow.location.href` (same-origin assumption, line 135) — a cross-origin hosted URL throws (caught → setSessionReady). Boot injects a LOCAL token via `/auth/agent-club` (email `agent-club@local.agentclub`, code `888888`). A hosted multica would need real auth (PAT `mul_...`) and must permit framing (no X-Frame-Options DENY / CSP frame-ancestors). **No CSP/frame config exists in repo.**

## Rebrand surface (AionUi → Agent Club)

- **DONE (central knobs):** `src/common/config/appBrand.ts` (APP_BRAND_NAME='Agent Club', AGENT_MANAGER_NAME='Local Agent Manager', workspace slug 'agent-club'); `electron-builder.yml` (appId com.agentclub.app, productName 'Agent Club', executableName 'AgentClub'); `package.json` (name 'agent-club', productName 'Agent Club').
- **REMAINING (~30 files):** heaviest `src/index.ts` (34 hits incl. copyright line 3 'AionUi (aionui.com)' + `[AionUi]` log prefixes), `src/process/utils/initStorage.ts` (31), `configMigration.ts`, `fsBridge.ts`, `database/migrations.ts`. Bundle/MCP ids: `AionuiMcpAgent.ts`, `AionrsMcpAgent.ts`, `aionui-skills/SKILL.md`, `storageKeys.ts`.
- **Assets:** `resources/` ships `aionui_logo_black_bg.svg`, `aionui_logo_no_border.png`, `aionui-banner-1.png`, `aionui_readme_header_0807.png`, `AionUi_team.gif`. App icons generic (`resources/app.icns|.ico|.png`). PWA icons `public/pwa/icon-{192,180,512}.png`.
- **i18n:** 8 locales under `src/renderer/services/i18n/locales/` — no 'AionUi' literals found in JSON (mostly clean). Verify per-locale before shipping.

## Upstream

- Only `origin` = https://github.com/Samin12/Agent-Club.git. **No upstream remote** for iOfficeAI/AionUi → must `git remote add upstream <url>` first. Single-line history (a02d425).
- Low-risk cherry-pick areas (once upstream added): i18n locale JSON additions, isolated gemini CLI fixes, MCP server additions under `src/process/services/mcpServices/`, icon refreshes. **Avoid:** appBrand.ts, electron-builder.yml, package.json brand fields, AgentManagerService.ts (diverge by design).

## Blockers needing user

1. Which hosted multica URL to iframe (app.multica.ai vs others).
2. Hosted auth model (PAT `mul_...`) + confirm target permits framing.
3. Upstream remote URL to add before any cherry-pick.
