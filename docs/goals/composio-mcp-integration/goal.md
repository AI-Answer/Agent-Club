# Composio MCP Integration

## Objective

Integrate Composio into Agent Club as a first-class MCP option so a user can enter a Composio API key, enable the correct Composio MCP server, and make those tools available to the app's agents through the existing MCP sync flow.

## Original Request

Make a goal to find Composio and integrate that for MCP. We want a Composio connection, an API-key entry, and the right MCP so all our agents can use Composio.

## Intake Summary

- Input shape: `specific`
- Audience: Agent Club owner/operator and future Agent Club users who want shared agent access to Composio tools.
- Authority: `approved`
- Proof type: `demo`
- Completion proof: Agent Club shows a Composio MCP connection in the MCP & Voice settings, lets the user safely enter or update the Composio API key, syncs the enabled Composio server to supported local agents, and passes relevant checks with source-backed evidence for the official MCP command/config.
- Likely misfire: Add a cosmetic Composio row or hard-coded guess without verifying the official Composio MCP package, secret handling, agent sync behavior, or whether enabled agents can actually consume the configuration.
- Blind spots considered: Composio MCP setup is version-sensitive and must be checked against official docs; API keys must not be leaked in logs, durable notes, screenshots, or git; some agent providers may ignore MCP config; OAuth/connection flows may need browser or owner login after the API key is saved.
- Existing plan facts: The existing Agent Club MCP & Voice screen has manual MCP config and agent sync behavior; the user wants Composio available through that surface rather than as a separate one-off script.

## Goal Kind

`specific`

## Current Tranche

This is a continuous execution tranche: first verify the current Agent Club MCP architecture and the official Composio MCP setup, then choose and implement the smallest safe slice that adds a Composio preset/API-key flow, verify the config and UI, and audit whether supported agents can receive the enabled MCP server.

Implementation should start only after Scout evidence identifies the official Composio MCP command or URL, required environment variables, existing MCP storage/UI files, secret-handling constraints, and verification commands.

## Non-Negotiable Constraints

- Use source-backed official Composio MCP setup details; do not guess the package name, command, URL, or environment variable names.
- Do not store real Composio API keys in git, goal receipts, screenshots, or logs.
- Preserve the existing manual MCP add/import flow and chrome-devtools entry.
- Keep changes scoped to the MCP settings, config/storage, bridge, i18n, and tests needed for this integration.
- Do not claim "all agents" can use Composio unless the app syncs to every supported detected agent or clearly explains unsupported providers.
- Preserve unrelated local changes.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if the user asked for working software or automation and a safe Worker task can be activated.

Do not stop after a single verified Worker slice when the broader owner outcome still has safe local follow-up slices. After each slice audit, advance the board to the next highest-leverage safe Worker task and continue.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal toward the full outcome.

## Canonical Board

Machine truth lives at:

`docs/goals/composio-mcp-integration/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/composio-mcp-integration/goal.md.
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
9. If Judge selected a safe Worker task with `allowed_files`, `verify`, and `stop_if`, activate it and continue unless blocked.
10. If a problem, suggestion, or follow-up should become a repo artifact, create an approved issue/PR or ask the operator whether to create one.
11. Treat a slice audit as a checkpoint, not completion, unless it explicitly proves the full original user outcome is complete.
12. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.

Issue and PR handoffs are supporting artifacts. `state.yaml` remains authoritative, and every external artifact decision must be recorded in a task receipt.
