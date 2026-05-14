# JourneyKits Skills Discovery

## Objective

Add JourneyKits (`https://www.journeykits.ai/`) as a first-class skills source for Agent Club, so users can discover skills, install them into the local agent skill system, make installed skills available to supported local agents, and post or publish compatible skills back to JourneyKits when supported.

## Original Request

Make sure the whole Agent Club application, with all supported agents, is integrated well with JourneyKits and the skills. After it is integrated, push it to GitHub and run the goal after planning.

## Intake Summary

- Input shape: `specific`
- Audience: Agent Club users who want a skills marketplace/discovery flow instead of manually hunting for skills.
- Authority: `approved`
- Proof type: `demo`
- Completion proof: A local demo shows JourneyKits available in Agent Club's skills discovery surface, skills can be discovered and installed through the app, installed skills are available through the app's supported agent/assistant skill paths, posting/publishing is implemented or cleanly owner-gated if JourneyKits requires credentials/API access, docs explain the flow, verification checks pass, and the completed work is committed and pushed to GitHub.
- Likely misfire: Only add a JourneyKits link or static card without real discovery, install, compatibility validation, or posting/publishing behavior.
- Blind spots considered:
  - JourneyKits may not expose a public API or may require browser/session/auth flows.
  - Skill package formats may differ across Codex, Claude, Agent Club, and JourneyKits.
  - Local agents may consume skills through different files, paths, prompts, or generated config, so "all agents" must be interpreted as all supported detected agents with explicit caveats.
  - Posting skills may require credentials, moderation, ownership proof, or a separate publisher account.
  - Installed skills need safe local path handling and should not overwrite user skills without consent.
  - This must work with the existing Agent Club skills/settings surfaces and preserve current whitelabel work.

## Goal Kind

`specific`

## Current Tranche

Prepare and execute the first safe local integration path: discover the existing skills surfaces, local agent skill wiring, and JourneyKits capabilities; choose the smallest reliable integration slice; implement discovery/install first; ensure installed skills propagate through supported agent/assistant paths; then add posting/publishing if the JourneyKits side exposes a safe supported route.

## Non-Negotiable Constraints

- Do not hard-code credentials or secrets.
- Do not claim JourneyKits install/posting works until verified against the live app and source behavior.
- Do not claim "all agents" are integrated unless every supported detected agent path has been mapped and verified or clearly documented as unsupported.
- Treat any JourneyKits authentication, publisher account, or moderation requirement as owner-gated.
- Preserve existing Agent Club whitelabeling and the current settings/navigation structure.
- Keep implementation slices small enough to test and push independently.
- Do not overwrite existing local skills without an explicit user action.
- Before the goal is marked complete, commit the finished JourneyKits changes and push them to GitHub.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete: discovery, install, supported-agent skill availability, and posting/publishing are implemented or explicitly blocked by documented JourneyKits-side requirements, with safe fallbacks, verification evidence, and a GitHub push receipt.

## Canonical Board

Machine truth lives at:

`docs/goals/journeykits-skills-discovery/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/journeykits-skills-discovery/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Re-check the original request, proof, blind spots, constraints, and likely misfire.
5. Work only on the active board task.
6. Write a compact task receipt.
7. Update the board.
8. If Judge selects a safe Worker task with `allowed_files`, `verify`, and `stop_if`, activate it and continue unless blocked.
9. Treat credentials, publishing accounts, and JourneyKits API gaps as task blockers, not whole-goal blockers.
10. Before final completion, commit and push the finished work to GitHub.
11. Finish only with a Judge/PM audit receipt that maps evidence back to discovery, install, supported-agent skill availability, posting/publishing, verification, and the pushed commit.
