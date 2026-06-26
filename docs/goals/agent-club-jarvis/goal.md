# Agent Club — Rebrand, Multica Cleanup & Jarvis Mode

## Objective

Turn the AionUi-based Electron app into a polished "Agent Club": (1) remove the slow
local "multica" component and replace it with an iframe to the hosted multica, (2) ship a
full-screen, voice-driven **Jarvis Mode** for the Hermes agent that looks like the reference
reel and can drive the computer through Hermes's existing CUA/computer-use driver, and
(3) cherry-pick relevant upstream AionUi improvements while preserving local customizations.
Everything tested and demoable.

## Original Request

Watch the reference reel (sci-fi JARVIS command-center HUD) and add a "Jarvis Mode" to Agent
Club. Clean up the repo: remove the local multica part that slows the app down and just iframe
the real hosted multica. Build Jarvis Mode so hitting it goes full-screen and lets me talk to my
Hermes agent in real time; it should only apply to the Hermes agent (when installed), control my
computer, have MCP connections pre-wired, look like the reel, and include a button that plays the
AC/DC track from the clip. Use Reposeek + OpenSRC for research, Greptile for code review.
Cherry-pick relevant updates from upstream iOfficeAI/AionUi. Rebrand the project to "Agent Club".
Long-running, parallel agents, dynamic workflows, fully tested. Reference: github.com/open-jarvis/OpenJarvis.

## Intake Summary

- Input shape: `existing_plan` (detailed plan + meaningful in-repo discovery still required)
- Audience: the user and people they demo to ("get impressed")
- Authority: `approved` for computer control via Hermes's existing CUA/computer-use driver; `needs_approval` to supply the Nous Portal API key when wiring voice
- Proof type: `demo` + `test`
- Completion proof: Jarvis Mode launches full-screen only when Hermes is installed; real-time voice conversation with Hermes works; a spoken command drives the computer via Hermes's CUA driver; AC/DC button plays; local multica removed and hosted multica iframe loads with measurable startup/perf improvement; Agent Club rebrand visible; relevant upstream cherry-picks applied; test suite green for touched areas.
- Likely misfire: shipping a visual-only "fake" Jarvis that doesn't actually talk or control anything; OR breaking the app by ripping out multica incorrectly; OR damaging customizations via an over-aggressive upstream merge.
- Blind spots considered: whether the Nous Portal API exposes realtime/TTS audio at all (may need a TTS fallback while keeping the Nous/Hermes brain); CSP/sandbox/auth constraints on iframing hosted multica; macOS Accessibility/Screen-Recording permissions for computer control; sourcing/licensing of the AC/DC audio clip; feature-gating so Jarvis only appears for Hermes.
- Existing plan facts (preserve + validate):
  - Remove local multica; iframe the real hosted multica instead.
  - Jarvis Mode = full-screen, real-time voice with Hermes; Hermes-only (when installed).
  - Reuse Hermes's existing CUA driver + computer-use for control (do NOT wire a new path).
  - Voice via the **Nous Portal** API key (the Hermes agent's key) to bypass ElevenLabs.
  - MCP connections pre-wired for Hermes inside Jarvis.
  - AC/DC music toggle button.
  - Visuals match the reference reel + OpenJarvis.
  - Upstream handling = cherry-pick relevant AionUi changes (NOT a full rebase).
  - Rebrand AionUi → Agent Club.
  - Research with Reposeek + OpenSRC; code review with Greptile; test everything.

## Goal Kind

`existing_plan`

## PIVOT (2026-06-25) — Tranche 2: adopt jarvis-hud's look, Hermes brain

The user found a polished standalone JARVIS — `jarvis-hud` v1.0.1 (Next.js + Three.js/WebGL HUD,
Python voice server, a "runner" that dispatches to headless `claude -p`, a file-vault memory).
Decision: **use ALL of jarvis-hud's look + the exact content/panels it shows, but drive everything
with the Hermes agent system (Hermes voice + Hermes brain). NO Claude / claude-p / Haiku router /
Ollama.** Reuse the Hermes ACP voice loop + Peekaboo control we already built as the engine.

This replaces the hand-built canvas HUD (T009) with jarvis-hud's WebGL HUD + content panels, ported
into the Agent Club Vite/React-19 renderer, with every brain/voice point rewired to Hermes. Prior
work kept: Hermes voice (T010), Peekaboo control (T011), multica iframe (T006), rebrand (T007),
security hardening (T015). Tranche-1 functional live-test is now folded into Tranche-2's testing.

## Current Tranche

Continuous execution. First discover enough in-repo + external evidence (multica location & cost,
Hermes/Nous/CUA wiring, hosted multica URL + iframe constraints, rebrand surface, upstream diff,
JARVIS HUD + realtime-voice options). Then run successive safe, verified Worker slices —
multica→iframe, rebrand, Jarvis shell, HUD, voice, computer-control, music, MCP — auditing each,
and advance until the full original outcome is complete and demoable.

## Non-Negotiable Constraints

- Do NOT full-rebase onto upstream AionUi; cherry-pick only, preserving local customizations.
- Jarvis Mode must be gated to the Hermes agent and only when Hermes is installed.
- Reuse Hermes's existing CUA/computer-use driver for computer control; do not bolt on a separate one.
- Bypass ElevenLabs; target the Nous Portal key for the Hermes voice path (with a documented fallback if Nous lacks realtime/TTS audio).
- Don't break app startup/build; removing local multica must keep the rest of the app working.
- Keep secrets (Nous Portal key, any API keys) out of source control.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection. Do not stop after a single verified slice
when safe follow-up slices remain. Do not stop because a slice needs the user's API key, macOS
permissions, or the hosted multica URL — mark that exact slice blocked with a receipt, create the
smallest safe follow-up, and keep doing local non-destructive work that advances the goal.

## Canonical Board

Machine truth lives at:

`docs/goals/agent-club-jarvis/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins.

## Run Command

```text
/goal Follow docs/goals/agent-club-jarvis/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the GoalBuddy update checker; mention a newer version without blocking.
4. Re-check intake: original request, input shape, authority, proof, blind spots, existing plan facts, likely misfire.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM per the task. Parallel read-only Scout discovery may fan out via the Workflow tool; only one write-Worker is active at a time.
7. Write a compact receipt.
8. Update the board.
9. If Judge selected a safe Worker task with `allowed_files`, `verify`, `stop_if`, activate it and continue unless blocked.
10. Turn out-of-scope findings into approved issues/PRs or board tasks.
11. Treat each slice audit as a checkpoint, not completion.
12. Finish only with a Judge/PM audit receipt recording `full_outcome_complete: true`.
