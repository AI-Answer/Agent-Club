# T003/T004 Worker Receipt: Accessibility Permission Prompt

## Implementation

- Added typed Peekaboo desktop-control permission status/request results.
- Added native MCP bridge providers for:
  - checking desktop-control permission status
  - requesting the macOS Accessibility prompt with `systemPreferences.isTrustedAccessibilityClient(true)`
  - opening macOS Accessibility and Screen Recording privacy panes as fallbacks
- Updated the Peekaboo Desktop Control setup card:
  - shows permission status in the existing gates
  - adds `Grant Accessibility`
  - adds `Open Accessibility Settings`
  - adds `Open Screen Recording`
  - calls the Accessibility request path before saving/enabling packaged Peekaboo MCP

## Verification

```bash
bunx vitest run tests/unit/PeekabooMcpSetup.dom.test.tsx tests/unit/peekabooPermissions.test.ts
bunx tsc --noEmit
git diff --check
```

All passed.

## Live App Spot Check

Route checked: `http://localhost:5173/#/settings/capabilities?tab=tools`

Visible controls found:

```json
{
  "grantAccessibility": 1,
  "openAccessibility": 1,
  "openScreenRecording": 1,
  "primarySetup": 1
}
```

I did not force-click the live `Grant Accessibility` button during verification because that can trigger a real macOS privacy prompt requiring the owner to grant access. The unit coverage proves the button calls the native Electron prompt API, and the live check proves the controls are present in the app surface.
