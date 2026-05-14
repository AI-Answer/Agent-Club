# Agent Club Chief Of Staff

## Objective

Turn Agent Club into a coordinated agent operating surface where Agent Manager/Multica, Hermes, Codex, Claude Code, memory systems, MCP visibility, goals, automations, and the personal dashboard work together as one whitelabeled product experience.

## Original Request

Build toward agent teams that are more coupled and aware of each other through Agent Manager/Multica; add Honcho and Supermemory memory sections and hooks for all agents; rebrand Teams as Goals with a GoalBuddy workflow and kanban in Agent Manager; make Hermes the primary Chief of Staff agent; support Google Workspace context through gogcli.sh; add a Dashboard under search for key insights, automations, and long-running goals; expose MCPs like 1Password; order agents as Hermes, Codex, Claude Code, then plus for the rest; remove the Agent Club skills market modal; and make sure Agent Manager and the UI work together.

Clarification: new users should be able to set up Honcho from inside Agent Club by entering their API key. Agent Club should then enable hooks that keep memory updated from agent conversations, and the Memory tab should show the resulting memories/representations.

Provider clarification: memory should be a single selected provider, either Honcho or Supermemory. Hooks should update the selected provider, not both at once.

## Intake Summary

- Input shape: `existing_plan`
- Audience: Agent Club owner/operator and future Agent Club users who want a coordinated local agent team.
- Authority: `approved`
- Proof type: `demo`
- Completion proof: Local Agent Club UI and Agent Manager show a cohesive Chief of Staff workflow, including Hermes-first agent ordering, memory/MCP/settings surfaces, goal/kanban flow, dashboard entry, and verified removal of the skills market modal, with checks passing.
- Likely misfire: Build isolated UI labels or placeholder screens that look right but do not connect Agent Club, Agent Manager/Multica, runtime hooks, memory configuration, and documented workflows.
- Blind spots considered: Google Workspace auth may require owner credentials; Honcho/Supermemory/1Password MCP availability may vary locally; Hermes/OpenClaw capabilities need runtime discovery before coupling UI to promises; broad product changes need safe tranches and verification after each slice.
- Existing plan facts: Preserve Hermes as the most important Chief of Staff agent; put Hermes first, then Codex, then Claude Code, then a plus/rest path; add memory section for Honcho and Supermemory; let users pick one memory provider, Honcho or Supermemory; make Honcho setup easy for new users with an API key field; support global agent memory hooks when configured; show selected-provider memories/representations in the Memory tab; rebrand Teams as Goals and match GoalBuddy-style workflow; put kanban in Agent Manager; add Dashboard under search; add Google Workspace settings via gogcli.sh; surface MCPs such as 1Password; remove the Agent Club skills market modal; keep whitelabeling intact and avoid Aion UI/Chinese branding regressions.

## Goal Kind

`existing_plan`

## Current Tranche

This is a continuous execution tranche: first discover the current repo/runtime surfaces and verify what already exists, then choose the safest first implementation slice, implement it, verify it, audit it against the product direction, and continue into the next safe slice until the full original outcome is complete.

The first safe slice is read-only discovery and sequencing. Implementation should start only after Scout/Judge evidence identifies exact files, runtime boundaries, verification commands, and stop conditions.

## Non-Negotiable Constraints

- Keep Agent Club whitelabeling intact: no Aion UI branding, unwanted Chinese text, or old modal flows should return.
- Agent Manager and the main UI must work together instead of becoming two disconnected surfaces.
- Do not claim memory, MCP, Google Workspace, Hermes, or automation integration is working until runtime evidence proves it.
- Treat credentials, Google Workspace auth, 1Password MCP access, and external account setup as owner-gated steps.
- Prefer low-breakage, incremental slices with visible local verification.
- Preserve user work and do not revert unrelated local changes.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if the user asked for working software or automation and a safe Worker task can be activated.

Do not stop after a single verified Worker slice when the broader owner outcome still has safe local follow-up slices. After each slice audit, advance the board to the next highest-leverage safe Worker task and continue.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal toward the full outcome.

## Canonical Board

Machine truth lives at:

`docs/goals/agent-club-chief-of-staff/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/agent-club-chief-of-staff/goal.md.
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
