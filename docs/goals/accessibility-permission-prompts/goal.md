# Accessibility Permission Prompts

## Original Request

Sam asked: "Can you make the popups happen for accessibility permissions when I click the button so I can very easily grant permissions?"

## Outcome

Agent Club should make the macOS Accessibility permission flow easy to grant from inside the app. When Sam clicks the relevant permission button, the app should trigger the native macOS Accessibility authorization prompt or open the exact System Settings permission pane when macOS cannot show the prompt again.

## Scope

- Find the existing permission/settings button or permission surface in Agent Club.
- Wire the button to the correct macOS Accessibility request path.
- Refresh and display the current permission status after the user grants or denies access.
- Provide clear fallback behavior for macOS cases where the system prompt has already been dismissed or cannot reappear.
- Verify the behavior in the running app where possible.

## Non-Goals

- Do not redesign the whole settings experience.
- Do not fake permission status.
- Do not require terminal commands from the user when a native app action can do it.
- Do not change unrelated Month Map, Dashboard, Local Agent Manager, or GoalBuddy work.
- Do not attempt to bypass macOS privacy rules.

## Likely Misfire

The wrong implementation would only open a help page or show a custom modal while macOS never receives the real Accessibility prompt request. The goal is to make the OS permission flow actually start from the button.

## Completion Proof

- The implementation identifies the real app button/surface and wires it to a native Accessibility permission request or System Settings fallback.
- Verification shows the button path is callable from the app and status refreshes correctly.
- Typecheck and relevant focused tests pass.
- A final audit maps the implemented behavior back to this request.
