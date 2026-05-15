# Agent Club

Agent Club is a desktop workspace for running AI agents, planning work, and keeping track of what those agents are doing.

It brings chat, local agents, tasks, goals, schedules, tools, and a personal planner into one app so you can work with agents like a small team instead of juggling separate terminal windows, browser tabs, and notes.

## What Agent Club Is For

Agent Club is built for people who want to delegate real work to AI agents and still stay in control.

Use it to:

- Chat with different AI agents from one desktop app
- Create goals, projects, and tasks that agents can work on
- Track what agents are doing and what still needs attention
- Plan your month and daily priorities in a visual planner
- Connect tools, skills, MCP servers, and local capabilities
- Run recurring or scheduled agent workflows
- Keep agent work tied to the files, prompts, and context that matter

## Why It Is Useful

Most agent workflows get messy fast. You might have one task in a chat, another in a terminal, notes in a document, and progress hidden inside logs.

Agent Club gives you a shared operating space for that work:

- **One place to start work**: create a goal, task, or chat without switching tools.
- **One place to monitor agents**: see running work, completed work, and stuck work.
- **One planner for priorities**: use the month map to organize what matters today and across the month.
- **Local-first control**: run the desktop app on your machine and connect local tools when needed.
- **Agent-readable context**: planner entries, goals, and tasks can become context that agents use while working.
- **Simple installation**: download the app, drag it into Applications, and start using it.

## What the App Can Do

Agent Club includes:

- AI chat workspace with support for multiple agent and model backends
- Local Agent Manager for projects, goals, issues, task queues, and agent activity
- Month Map planner for daily priorities, notes, objectives, and agent-updatable planning context
- Scheduled task and automation surfaces
- Skills and assistant presets
- MCP tool setup for extending what agents can access
- Voice, image generation, and file-oriented workflows where configured
- Remote/WebUI settings for accessing or pairing agent workflows from other surfaces
- Desktop packaging for a normal macOS app install

## Screenshots

### Chat Workspace

Start a chat, pick an agent, attach files, select models, and use assistant presets from one home screen.

![Agent Club chat workspace](docs/assets/readme/agent-club-chat.jpg)

### Month Map Planner

Plan daily priorities across the month. Tasks, notes, and main objectives can become context for agents.

![Agent Club Month Map planner](docs/assets/readme/agent-club-month-map.jpg)

### Local Agent Manager Boards

Track projects, goals, issues, priorities, and agent work in the embedded Local Agent Manager board.

![Agent Club Local Agent Manager board](docs/assets/readme/agent-club-agent-manager-board.jpg)

### Scheduled Tasks

Create recurring agent tasks and keep scheduled work visible. This screenshot shows the empty state when no tasks are configured yet.

![Agent Club scheduled tasks](docs/assets/readme/agent-club-scheduled-tasks.jpg)

### Teams

Run multiple agents together in a team workspace with shared files and per-agent chat lanes.

![Agent Club team workspace](docs/assets/readme/agent-club-teams.jpg)

## Install Agent Club

The easiest way to install Agent Club on a Mac is from the latest GitHub release:

https://github.com/Samin12/Agent-Club/releases/latest

For Apple Silicon Macs, download the latest file ending in `mac-arm64.dmg`, open it, and drag `AgentClub.app` into your Applications folder.

Right now the published desktop installer is for Apple Silicon Macs. Intel Mac, Windows, and Linux builds can be added from the same packaging setup once release signing and CI are configured for those platforms.

### Copy-Paste Install Prompt

If you use Codex, ChatGPT, Claude Code, or another assistant that can access your local terminal, paste this prompt and let it do the setup for you:

```text
Install Agent Club on this Mac from GitHub.

Release page:
https://github.com/Samin12/Agent-Club/releases/latest

Please do the full install for me:
1. Check the Mac architecture with `uname -m`.
2. If this is an Apple Silicon Mac (`arm64`), download the newest release asset ending in `mac-arm64.dmg`.
3. Mount the DMG.
4. Quit Agent Club if it is already running.
5. Copy `AgentClub.app` into `/Applications`, replacing an older copy if one exists.
6. Detach the DMG.
7. Open `/Applications/AgentClub.app`.
8. If macOS blocks the app because it is not notarized yet, do not bypass security silently. Show me the exact right-click Open or System Settings > Privacy & Security step I need to approve.
9. Tell me the installed app path, the release version, and whether the app opened successfully.

Use terminal commands where possible instead of making me do manual steps.
```

### Manual Mac Install

1. Open the latest release page:
   https://github.com/Samin12/Agent-Club/releases/latest
2. Download `Agent-Club-*-mac-arm64.dmg`.
3. Open the DMG.
4. Drag `AgentClub.app` into Applications.
5. Open Agent Club from Applications.

If macOS says the app is from an unidentified developer, right-click `AgentClub.app`, choose Open, then approve the prompt. This happens because local releases are currently ad-hoc signed and not notarized with an Apple Developer ID yet.

## Community

For support, discussion, and updates, join Claude Club:

https://www.skool.com/claude

## Developer Setup

Use this path if you want to run the app from source instead of installing the DMG.

Install dependencies:

```bash
bun install
```

Start the desktop app in development mode:

```bash
bun run start
```

Run targeted lint checks:

```bash
bun run lint
```

Build the renderer web bundle:

```bash
bun run build:renderer:web
```

Build a local macOS DMG and ZIP:

```bash
bun run dist:mac
```

## Project Structure

- `src/renderer/` - desktop UI, routes, settings, and pages
- `src/process/` - main-process services, agents, channels, and background work
- `src/common/` - shared config, types, and IPC contracts
- `src/preload/` - bridge code between the renderer and main process
- `apps/agent-manager/` - embedded Local Agent Manager / Multica workspace
- `resources/` - packaged icons, images, and app resources
- `docs/` - product notes, implementation plans, and architecture references

## Verification

Useful checks while developing:

```bash
bun run lint
bun run build:renderer:web
node scripts/check-i18n.js
```
