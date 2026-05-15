# Agent Club

Agent Club is a local AI agent workspace for hands-on work with your tools, files, automations, planners, and assistants.

The app is being whitelabeled around the Agent Club experience. Product-facing docs, metadata, settings, and help surfaces should use Agent Club branding and route users to the Claude Club community:

https://www.skool.com/claude

## Install Agent Club

The easiest way to install Agent Club on a Mac is from the latest GitHub release:

https://github.com/Samin12/Agent-Club/releases/latest

For Apple Silicon Macs, download the latest file ending in `mac-arm64.dmg`, open it, and drag `AgentClub.app` into your Applications folder.

Right now the published desktop installer is for Apple Silicon Macs. Intel Mac, Windows, and Linux builds can be added from the same packaging setup once release signing and CI are configured for those platforms.

### Copy-Paste Setup Prompt

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

## What It Includes

- Local desktop workspace for AI agent conversations
- Support for multiple agent backends and model providers
- Skills, MCP tools, image generation, speech-to-text, and remote WebUI settings
- Scheduled task and automation surfaces
- Settings pages for agents, assistants, capabilities, hooks, display, remote access, system preferences, and about/help
- Help button in the sidebar that opens the Claude Club community directly
- Cmd/Ctrl+N shortcut for starting a new chat

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

## Main Project Areas

- `src/renderer/` - desktop and WebUI renderer screens, routes, settings, and UI components
- `src/process/` - main-process services, agents, extensions, channels, and background work
- `src/preload.ts` - bridge between renderer and main-process APIs
- `src/common/` - shared config, types, and IPC contracts
- `docs/` - implementation notes, product specs, and architecture references
- `resources/` - packaged images, icons, and app resources

## Settings Surfaces

Agent Club settings are routed under `/settings`.

- `/settings/gemini` - model and provider setup
- `/settings/agent` - local and remote agent setup
- `/settings/model` - model platform configuration
- `/settings/assistants` - assistant presets and skills
- `/settings/capabilities` - skills, MCP tools, voice, and related capabilities
- `/settings/hooks` - extension lifecycle hook reference
- `/settings/display` - theme and visual preferences
- `/settings/webui` - remote access and channels
- `/settings/system` - application preferences
- `/settings/about` - about, updates, and support links

## Hook Support

Agent Club supports extension lifecycle hooks through extension manifests. The built-in Hooks settings page documents the supported lifecycle names:

- `onInstall`
- `onActivate`
- `onDeactivate`

Backend hook execution behavior lives in the extension runtime. The settings page is the visible product surface for users and builders.

## Whitelabel Rules

- Product-facing copy should say Agent Club.
- Help and community links should point to https://www.skool.com/claude.
- New visible UI text should use i18n keys.
- Preserve legally required license attribution until it is reviewed explicitly.
- Avoid broad blind renames of internal protocol names, event names, or compatibility identifiers.
- Keep top-level docs English-first unless a localized documentation strategy is intentionally added later.

## Verification

Useful checks for the current whitelabel work:

```bash
bun run lint
bun run build:renderer:web
node scripts/check-i18n.js
```

For GoalBuddy tracking, the active board is:

```text
docs/goals/agent-club-whitelabel
```
