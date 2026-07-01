# T002 (re-run): Hermes / Nous / Peekaboo CUA / MCP wiring

Task: `T002`
Kind: `scout` (re-run; prior receipt was a placeholder)
Status: `current`

## Summary

Hermes is an **ACP backend**. "Installed" = the `hermes` CLI is on PATH. The app already runs
Hermes as `hermes acp` sessions, and **the Hermes CLI owns its Nous auth + MCP + Peekaboo** — the
app stores **no Nous Portal key/model anywhere**. Biggest implication: Jarvis voice should reuse the
**existing ACP conversation** (STT → Hermes ACP → TTS), not re-implement the Nous API. Computer
control = the bundled **Peekaboo stdio MCP** synced to Hermes (Hermes calls the tools). MCP pre-wire
= `mcpBridge.syncMcpToAgents`.

## 1. Hermes definition + install gating (EXACT)

- Defined `src/common/types/acpTypes.ts:457-467` (`id: 'hermes'`, `cliCommand: 'hermes'`, `acpArgs: ['acp']`).
- "Installed" = `hermes` CLI found on PATH; detection `src/process/agent/acp/AcpDetector.ts` (`which hermes`, `POTENTIAL_ACP_CLIS` acpTypes.ts:96), surfaced via `agentRegistry.getDetectedAgents()` and IPC `getAvailableAgents` (`src/process/bridge/acpConversationBridge.ts:46-73`). Renderer example `LocalAgents.tsx:41-47`.
- **Gate for Jarvis (renderer):**
  ```ts
  const r = await ipcBridge.acpConversation.getAvailableAgents.invoke();
  const hermesInstalled = !!r.success && !!r.data?.some(a => a.backend === 'hermes');
  ```
  (`backend === 'hermes'` is more precise than the `signature.includes('hermes')` priority hack at LocalAgents.tsx:29.)

## 2. Nous Portal key + model (NONE stored)

- No `nous.*`/`portal.*`/Hermes-API key, base URL, or model in `src/common/config/storage.ts` (only generic `model.config` IProvider :80-89).
- Hermes spawned via `connectGenericBackend` (`AcpConnection.ts:246-251`), only an optional `customEnv` passed — app never reads a Nous key and never calls `inference-api.nousresearch.com` today. The Hermes CLI handles Nous auth internally for ACP sessions.
- **Contradiction vs task framing:** there is no existing Nous key read path to reuse. Either (A) reuse the ACP `hermes` session for the brain (recommended — no new key needed), or (B) add a new Nous key store + call the inference API directly (model `hermes-4-70b`), which also loses Hermes's built-in MCP/Peekaboo. Prefer **A**.

## 3. Hermes → MCP wiring

- `src/process/bridge/mcpBridge.ts:121-169` (`initMcpBridge`): `getAgentMcpConfigs` (123, list), `syncMcpToAgents` (147, install/pre-wire), `removeMcpFromAgents` (159), `testMcpConnection` (135). Delegates to `McpService.syncMcpToAgents` (`McpService.ts:267-322`) → `agentInstance.installMcpServers(enabledServers)` (301).
- **Pre-wire Hermes (renderer):** `ipcBridge.mcpService.syncMcpToAgents.invoke({ mcpServers, agents: [{ backend: 'hermes', name: 'Hermes Chief of Staff', cliPath }] })`; read state via `getAgentMcpConfigs`.

## 4. Peekaboo CUA invoke path (REUSE)

- Peekaboo is a **bundled stdio MCP server**, not a direct function. `src/process/resources/builtinMcp/peekabooProxy.ts:11-12,38-57` spawns the bundled binary as `peekaboo mcp serve`.
- Setup `PeekabooMcpSetup.tsx:22-30,180-198`: `getPeekabooDesktopControlSetup.invoke()` → `proxyScriptPath`; registers an MCP server (`type:'stdio', command:'node', args:[proxyScriptPath]`) with tools `image, see, click, type, set_value, perform_action`.
- **Drive computer control:** sync the Peekaboo MCP server to Hermes (via `syncMcpToAgents`), then have Hermes call its `peekaboo` tools. Do NOT build a new control path.
- Permissions (`mcpBridge.ts:45-95,223-285`): Accessibility via `systemPreferences.isTrustedAccessibilityClient()`; Screen Recording prompted by macOS on first capture (granted = null). IPC: `getPeekabooDesktopControlPermissions` (241), `requestPeekabooDesktopControlPermissions` (255), `openPeekabooPermissionSettings` (269).

## Hook-in guidance

- **T010 (voice):** Gate on the `getAvailableAgents` selector. Primary = reuse the ACP `hermes` conversation (STT → ACP message → Hermes reply → TTS); no Nous key needed. STT = browser SpeechRecognition; TTS = provider choice (OpenAI gpt-4o-mini-tts / browser SpeechSynthesis / local Kokoro).
- **T011 (CUA):** Sync the Peekaboo MCP (from `getPeekabooDesktopControlSetup`) to Hermes; gate UI on `getPeekabooDesktopControlPermissions`.
- **T013 (MCP pre-wire):** On Jarvis open, `syncMcpToAgents` for `backend:'hermes'`; reflect via `getAgentMcpConfigs`. Reuse `mcpBridge`; no new IPC.

## Judge-needed ambiguity

- If approach B is ever chosen, decide where to persist the Nous key (new `storage.ts` key vs reuse `model.config`). Approach A avoids this entirely.
