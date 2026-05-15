# Hermes Apps, Channels, and Scheduled Work Dashboard

## Objective

Build the next Hermes chief-of-staff control surface inside Agent Club: a good-looking app/MCP connection widget for Composio-style tools, Hermes-only channel setup for Slack, Discord, and iMessage, and reliable tracking of Hermes cron jobs and scheduled tasks in Scheduled Tasks.

## Original Request

Add a widget that lets users browse/connect MCP apps, make a polished Composio modal for attaching apps as MCP, add channels for Slack, Discord, and iMessage for the Hermes agent, and make sure Hermes cron jobs and scheduled tasks are tracked in Scheduled Tasks.

## Intake Summary

- Input shape: `specific`
- Audience: Sam and future Agent Club users who want Hermes to behave like a personal chief of staff.
- Authority: `requested`
- Proof type: `demo`
- Completion proof: A live Agent Club demo shows a scrollable app/MCP connection widget, a Composio attach flow, Hermes-only Slack/Discord/iMessage channel UI, and Hermes scheduled work visible in Scheduled Tasks, backed by passing verification commands.
- Likely misfire: Building a pretty marketplace that only mocks connections, or adding generic channel UI that does not actually route through Hermes or scheduled-task truth.
- Blind spots considered: Composio's current official Tool Router MCP flow, account credentials and OAuth, secret handling, iMessage native/macOS constraints, Discord availability, Slack permissions, scheduled-task source-of-truth drift, and avoiding old guessed stdio MCP recipes.
- Existing plan facts:
  - The screenshot shows an App Marketplace-style grid with app cards, install buttons, auth badges, tool counts, triggers, tags, and an installed-app count.
  - The user wants an embedded widget or modal that is scrollable and good-looking, not a bare config form.
  - Composio should attach apps as MCPs and make them easy to connect and control.
  - Channels should include Slack, Discord, and iMessage, but this channel surface is only for Hermes Chief of Staff.
  - Hermes cron jobs and scheduled tasks should be represented in the Scheduled Tasks page.
  - Prior memory says the official Composio direction is Tool Router MCP over HTTP with an `x-api-key` header, and Local Agent Manager should remain the product source of truth.

## Goal Kind

`specific`

## Current Tranche

Discover the existing Agent Club MCP, Composio, channel, Hermes, and scheduled-task seams, then implement successive safe vertical slices until the full owner outcome is demoable. The first implementation tranche should prefer a working UI surface with truthful connection states over a broad mocked marketplace.

## Non-Negotiable Constraints

- Do not connect real external accounts, send messages, mutate external workspaces, or expose secrets without explicit owner approval.
- Do not hard-code API keys, tokens, Composio URLs, Slack workspace IDs, Discord IDs, phone numbers, or iMessage identities.
- Treat Honcho/memory and Hermes chief-of-staff context as product inputs, but do not claim live memory/channel behavior without verification.
- Prefer Local Agent Manager and Agent Club native surfaces as the product UI; GoalBuddy is only the execution board.
- Verify Composio's current integration shape before implementation, especially Tool Router MCP HTTP URL plus `x-api-key` support.
- Keep the design compact, polished, scrollable, and useful; avoid creating a giant empty marketplace panel.
- Keep channel controls Hermes-scoped unless a later product decision explicitly generalizes them.
- Scheduled Tasks must show Hermes-owned recurring or queued work through the app's real scheduled-task data path, not a disconnected duplicate list.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if the user asked for working software or automation and a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not create one Worker/Judge pair per repeated file, table, route, or helper. Put repeated same-shape work into one Worker package and review the package as a whole.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

Small is not the goal. Useful is the goal.

For this goal, good Worker slices likely look like:

- one working app/MCP marketplace widget and attach modal path;
- one Hermes channel-management vertical slice;
- one scheduled-task source-of-truth bridge into Scheduled Tasks;
- one final polish/smoke slice that proves the whole chief-of-staff setup path.

## Canonical Board

Machine truth lives at:

`docs/goals/hermes-apps-channels-mcp-dashboard/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/hermes-apps-channels-mcp-dashboard/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Re-check the intake: original request, input shape, authority, proof, blind spots, existing plan facts, and likely misfire.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
10. If a problem, suggestion, or follow-up should become a repo artifact, create an approved issue/PR or ask the operator whether to create one.
11. Review at phase, risk, rejected-verification, ambiguity, or final-completion boundaries; do not review every small Worker by habit.
12. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.
