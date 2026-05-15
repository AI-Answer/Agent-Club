# T001 Scout Receipt: Accessibility Permission Map

## Current UI Surface

- `src/renderer/pages/settings/ToolsSettings/PeekabooMcpSetup.tsx`
  - Owns the Peekaboo Desktop Control setup card.
  - Current primary button is `Enable Packaged Peekaboo MCP` / `Use Packaged Peekaboo MCP`.
  - Current text explicitly says Agent Club will not grant Screen Recording, Accessibility, or app-control permissions for the user.
  - Current permissions area is informational only:
    - `Required permission: Screen Recording`
    - `Recommended gate: Accessibility before clicks`
    - Links to the Peekaboo permission guide.

## Bridge Surface

- `src/common/adapter/ipcBridge.ts`
  - `mcpService.getPeekabooDesktopControlSetup` already exists.
- `src/process/bridge/mcpBridge.ts`
  - Provider for `mcp.peekaboo.get-desktop-control-setup` returns packaged runner details.
  - No provider currently checks or requests Accessibility permission.

## Native macOS API

- Installed Electron version: `37.10.3`.
- Electron type declarations include `systemPreferences.isTrustedAccessibilityClient(prompt: boolean): boolean`.
- Correct native path for the Accessibility popup is calling:
  - `systemPreferences.isTrustedAccessibilityClient(true)`
- Important platform behavior:
  - macOS may only show the prompt when the app is not already trusted and the OS still allows prompting.
  - If the prompt has already been dismissed or the app is already listed in Privacy & Security, the best fallback is opening the exact System Settings pane.

## Candidate Worker Slice

Implement a Peekaboo permission bridge and wire the setup card:

- Add typed permission status/request results to `src/common/types/peekaboo.ts`.
- Add IPC providers in `src/common/adapter/ipcBridge.ts` and `src/process/bridge/mcpBridge.ts`:
  - status check
  - request Accessibility prompt
  - open Accessibility or Screen Recording settings pane
- Update `PeekabooMcpSetup.tsx`:
  - load visible permission status
  - add a `Grant Accessibility` button that calls the native prompt path
  - add direct settings buttons for Accessibility and Screen Recording fallback
  - call the Accessibility request before saving the packaged Peekaboo MCP from the primary setup button
  - refresh status after request/fallback
- Add a focused DOM test that proves the button invokes the new permission request and the setup button requests permissions before saving.

## Suggested Allowed Files

- `src/common/types/peekaboo.ts`
- `src/common/adapter/ipcBridge.ts`
- `src/process/bridge/mcpBridge.ts`
- `src/renderer/pages/settings/ToolsSettings/PeekabooMcpSetup.tsx`
- `tests/unit/PeekabooMcpSetup.dom.test.tsx`
- `docs/goals/accessibility-permission-prompts/**`

## Suggested Verification

- `bunx vitest run tests/unit/PeekabooMcpSetup.dom.test.tsx`
- `bunx tsc --noEmit`
- Live app spot check if the running app is available.
