# Hermes Peekaboo Computer Control

## Objective

Add a safe, visible computer-control capability for Hermes inside Agent Club, centered on installing/configuring Peekaboo through the MCP and Skills surfaces so Hermes can operate desktop apps such as Slack with owner supervision.

## Original Request

"Can you have this to be downloaded within the MCP and skills stuff? What I'm envisioning is let's say I have Hermes on. I can get it to control my computer to do all of this stuff by controlling my computer. Maybe there's a button there and I hit it and then it opens up my Slack and I can see it happening."

Reference: https://peekaboo.sh/

## Intake Summary

- Input shape: `specific`
- Audience: Sam and future Agent Club users who want Hermes to act as a visible, local chief-of-staff operator.
- Authority: `requested`
- Proof type: `demo`
- Completion proof: A live Agent Club demo shows a Peekaboo install/configure path in MCP/Skills, a Hermes computer-control entrypoint, permission/status checks, and a supervised "open Slack / perform a harmless action" run where the user can see what Hermes is doing.
- Likely misfire: Hiding this as an invisible MCP config row or letting Hermes take desktop actions without a clear permission gate, visible run state, and stop/observe affordances.
- Blind spots considered:
  - Peekaboo requires macOS Screen Recording and Accessibility permissions; the UI must surface those as explicit setup gates.
  - Desktop control can be risky; Hermes needs an owner-controlled launch, visible activity, and stop/pause affordance.
  - The MCP install path is likely stdio based and should be verified from current Peekaboo docs before implementation.
  - "Downloaded within MCP and skills" may mean both a one-click MCP preset and a Skill/JourneyKit-style package.
  - Hermes may need a scoped policy so computer control is opt-in and app/task bounded.

## Goal Kind

`specific`

## Current Tranche

Discover the current Peekaboo install/MCP shape and Agent Club MCP/Skills/Hermes surfaces, then implement the largest safe vertical slice that gives Hermes a visible, supervised local computer-control setup path.

## Non-Negotiable Constraints

- Do not grant macOS permissions, control Slack, send messages, or operate the user’s apps without explicit owner approval during `/goal`.
- Do not store or expose secrets in receipts, screenshots, config examples, or commits.
- Keep this Hermes-scoped unless a later product decision makes desktop control generic across agents.
- The UI must be honest about permissions and readiness; no fake "connected" state before Peekaboo is installed and permissions are verified.
- Prefer Agent Club native MCP/Skills surfaces as the product UI; GoalBuddy is only the execution board.
- The user should be able to watch what Hermes is doing, with a clear stop/pause/permission boundary.

## Starter Product Shape

The intended product experience is:

1. A "Computer Control" or "Desktop Control" card under MCP/Skills/Hermes setup.
2. A Peekaboo install button or guided installer that can use Homebrew or the npm MCP package.
3. Permission checks for Screen Recording and Accessibility.
4. A Hermes-only enable toggle.
5. A "Try in Slack" supervised demo button that opens Slack and performs a harmless action only after approval.
6. Visible run state: what app is being controlled, what Hermes is about to do, latest observation, and stop/pause controls.

## Canonical Board

Machine truth lives at:

`docs/goals/hermes-peekaboo-computer-control/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/hermes-peekaboo-computer-control/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Verify Peekaboo docs/current install commands before implementing.
4. Work only on the active board task.
5. Keep computer-control actions owner-approved, scoped, visible, and reversible.
6. Record compact receipts.
7. Run the GoalBuddy state checker before stopping.

