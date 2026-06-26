# T007: Rebrand — done + intentionally-skipped identifiers

Task: `T007`
Kind: `worker`
Status: `current`

## Done

- 683 copyright header comments: `Copyright YYYY AionUi (aionui.com)` -> `Copyright YYYY Agent Club` (SPDX lines kept).
- All `[AionUi...]` console/log prefixes -> `[Agent Club...]` (src/index.ts, src/process/index.ts, shellEnv.ts, configMigration.ts, initStorage.ts, utils.ts, zoom.ts).
- 3 user-facing display strings: shellEnv.ts diagnostic banner, webserver/index.ts startup banner, webserver/routes/authRoutes.ts HTML `<title>`.
- `bun run lint` + `bun run build:renderer:web` both pass.

## Intentionally SKIPPED (identifiers — renaming would break data/auth/matching)

These are NOT bugs; they require a data migration to change safely. Left as `aionui` on purpose:

- **Storage/config keys:** storageKeys.ts (`aionui_theme`, `aionui_language`, ...), storage.ts (`aionui.dir`, ConversationSource `aionui`).
- **Constants/markers:** constants.ts (`_aionui_` timestamp sep, `[[AION_FILES]]` marker, regexes).
- **Env vars:** `AIONUI_MULTI_INSTANCE`, `AIONUI_E2E_TEST`, `AIONUI_PORT`, `AIONUI_HUB_URL`, `AIONUI_VERSION`, etc.
- **DB:** class `AionUIDatabase`, `aionui.db`, migrations.ts `source IN ('aionui', ...)` CHECK constraints.
- **MCP:** `AionuiMcpAgent` / `AionrsMcpAgent` class names + `super('aionui')` ids, McpSource `aionui`, team MCP names (`aionui-team-*`).
- **Tool ids:** `aionui_web_fetch`, `aionui_image_generation`, `aionui-builtin-skills`.
- **Renderer:** DOM event names `aionui-*`, CSS classes `aionui-modal/steps`, localStorage keys (`aionui.emoji.recent`, `__aionui_theme`, ...).
- **Network/auth:** User-Agent `AionUI/1.0`, cookie `aionui-session`/`aionui-csrf-token`, JWT issuer `aionui` / audience `aionui-webui`.
- **On-disk:** deep-link scheme `aionui:`, dirs `.aionui`/`.aionui-config`, files `aionui-config.txt`, `.aionui-cdp-registry.json`.
- **Extension manifest:** `engine.aionui` field.

## Follow-up (out of current scope)

A full identifier rebrand needs: (1) a storage/key migration that reads old `aionui_*` keys and writes `agentclub_*`, (2) a DB migration for the source CHECK constraint + db filename, (3) coordinated env-var rename with back-compat. Track as a separate goal if desired.
