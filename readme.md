# Agent Club

Agent Club is a local AI agent workspace for hands-on work with your tools, files, automations, and assistants.

The app is being whitelabeled around the Agent Club experience. Product-facing docs, metadata, settings, and help surfaces should use Agent Club branding and route users to the Claude Club community:

https://www.skool.com/claude

## What It Includes

- Local desktop workspace for AI agent conversations
- Support for multiple agent backends and model providers
- Skills, MCP tools, image generation, speech-to-text, and remote WebUI settings
- Scheduled task and automation surfaces
- Settings pages for agents, assistants, capabilities, hooks, display, remote access, system preferences, and about/help
- Help button in the sidebar that opens the Claude Club community directly
- Cmd/Ctrl+N shortcut for starting a new chat

## Quick Start

Install dependencies:

```bash
npm install
```

Start the desktop app in development mode:

```bash
npm run start
```

Run targeted lint checks:

```bash
npm run lint
```

Build the renderer web bundle:

```bash
npm run build:renderer:web
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
npm run lint
npm run build:renderer:web
node scripts/check-i18n.js
```

For GoalBuddy tracking, the active board is:

```text
docs/goals/agent-club-whitelabel
```
