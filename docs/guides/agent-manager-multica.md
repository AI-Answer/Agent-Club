# Agent Manager and Multica Reference

This repo vendors the Agent Manager/Multica workspace under `apps/agent-manager`.
Keep this page as the quick map for what lives in git, what is generated locally,
and what should stay out of commits.

## Repo Layout

- `apps/agent-manager/` is the embedded Agent Manager source tree.
- `apps/agent-manager/apps/web/` is the local Agent Manager web UI.
- `apps/agent-manager/server/` contains the Multica server and CLI source.
- `scripts/prepareMulticaCli.js` builds a repo-local Multica CLI into
  `resources/bundled-multica/<platform>-<arch>/`.
- `scripts/setup-multica-cli.mjs` installs the built CLI into
  `~/.agent-club/bin/multica` and can link it to `~/.local/bin/multica`.

`resources/bundled-multica/` is generated build output and intentionally ignored
by git.

## Local Machine State

Verified on May 14, 2026:

- Global CLI: `~/.local/bin/multica`
- Installed CLI version: `multica 0.2.32`
- Local config/state: `~/.multica/`
- Desktop app data: `~/Library/Application Support/Multica`
- Local workspaces: `~/multica_workspaces` and
  `~/multica_workspaces_desktop-api.multica.ai`

Do not paste or commit `~/.multica/config.json`; it contains auth material.

## Runtime Ports

These are the ports to check when debugging the embedded Agent Manager stack:

- `3330`: Agent Manager web UI
- `18330`: Agent Manager API/backend
- `55432`: local Postgres
- `25809`: separate WebUI/login mode, when enabled

Current snapshot from the same verification pass:

- Multica daemon status: stopped
- Agent Manager web UI was listening on `3330`
- Local Postgres was listening on `55432`
- The running Agent Manager processes came from
  `/Users/saminyasar/Documents/test-team/Agent-Club`, not the canonical
  `/Users/saminyasar/Agent-Club` checkout

Use that path difference when a UI looks alive but the repo you are editing does
not seem to affect it.

## Useful Checks

From the repo root:

```sh
~/.local/bin/multica --version
~/.local/bin/multica daemon status
lsof -nP -iTCP:3330 -sTCP:LISTEN
lsof -nP -iTCP:18330 -sTCP:LISTEN
lsof -nP -iTCP:55432 -sTCP:LISTEN
```

Build or reinstall the repo-managed CLI:

```sh
bun run prepare:multica-cli
bun run setup:multica-cli
```

## Git Hygiene

Commit the Agent Manager source and integration docs, but do not commit local
runtime state:

- `apps/agent-manager/.agent-club/`
- `apps/agent-manager/.agent-club/postgres-data/`
- `apps/agent-manager/.agent-club/jwt-secret`
- `apps/agent-manager/.agent-club/postgres-password`
- `~/.multica/`
- `~/multica_workspaces*`

Those folders contain local databases, generated binaries, uploads, secrets, and
machine-specific daemon state.
