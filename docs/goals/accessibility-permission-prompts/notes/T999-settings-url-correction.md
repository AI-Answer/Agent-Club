# T999 Follow-up Correction: System Settings Pane

## Problem

After clicking `Grant Accessibility`, Sam reported that the app opened localhost instead of landing in the correct macOS Accessibility permission pane.

## Finding

On this machine:

```text
macOS 26.3.1
System Settings bundle: com.apple.systempreferences
Privacy extension bundle: com.apple.settings.PrivacySecurity.extension
```

The old URL shape:

```text
x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility
```

is unreliable in the current System Settings app.

The verified working URL is:

```text
x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility
```

Computer Use verified it opened the `Accessibility` privacy pane with the text:

```text
Allow the applications below to control your computer.
```

## Fix

- Updated the Accessibility and Screen Recording fallback URLs to use `com.apple.settings.PrivacySecurity.extension`.
- Updated `Grant Accessibility` so that after requesting the native Accessibility prompt, it always opens the Accessibility settings pane from that button click. This avoids the button doing nothing when the runtime thinks permission is already granted.
- Kept the packaged MCP setup flow quieter: it opens Accessibility automatically only when permission is still missing.
- Updated tests to require the modern URL and the button-click fallback-open behavior, including the already-granted status case.

## Verification

```bash
bunx vitest run tests/unit/PeekabooMcpSetup.dom.test.tsx tests/unit/peekabooPermissions.test.ts
bunx tsc --noEmit
git diff --check
```

All passed.

Live verification after restarting the Agent Club dev app:

- Moved System Settings to `Screen & System Audio Recording`.
- Clicked `Grant Accessibility` from `/settings/capabilities?tab=tools`.
- Confirmed System Settings moved to `Accessibility` and showed `Allow the applications below to control your computer.`
