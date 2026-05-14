# Agent Club - Project Guide

All contributors, human or AI, should keep the product surface aligned with Agent Club branding and preserve unrelated user work.

## Code Conventions

### File And Directory Structure

- Keep modules small and organized by responsibility.
- Split large directories before they become hard to scan.
- Put renderer-only code under `src/renderer/`.
- Put main-process services under `src/process/`.
- Put shared contracts and config under `src/common/`.
- Keep cross-process communication behind the IPC bridge in `src/preload.ts`.

### Naming

- Components: PascalCase, such as `SettingsPanel.tsx`.
- Utilities: camelCase, such as `formatDate.ts`.
- React hooks: camelCase with a `use` prefix, such as `useTheme.ts`.
- Constants files: camelCase file names, with exported constants in UPPER_SNAKE_CASE when appropriate.
- Type files: camelCase, such as `types.ts`.
- Style files: kebab-case or `ComponentName.module.css`.
- Unused parameters: prefix with `_`.

### UI Library And Icons

- Use `@arco-design/web-react` for interactive UI controls.
- Use `@icon-park/react` icons when a matching icon exists.
- Keep user-facing text behind i18n keys.
- Follow the existing settings layout patterns before introducing new layouts.

### CSS

- Prefer UnoCSS utility classes for component layout.
- Use CSS Modules for complex component-specific styles.
- Use semantic theme tokens and CSS variables instead of hardcoded colors.
- Keep global styles in `src/renderer/styles/`.

### TypeScript

- Keep strict TypeScript assumptions intact.
- Avoid `any` unless there is a clear compatibility boundary.
- Use path aliases such as `@/*`, `@process/*`, `@renderer/*`, and `@worker/*`.
- Prefer `type` for local type declarations.
- Write code comments in English.

## Product And Whitelabel Rules

- Product-facing copy should use Agent Club.
- Help and community links should point to https://www.skool.com/claude.
- Do not add new upstream product branding to UI, docs, metadata, or settings.
- Do not remove legal attribution or license text unless that decision is explicitly reviewed.
- Do not blindly rename internal compatibility identifiers, protocol names, event names, or environment variables.
- Keep top-level docs English-first unless a localized docs plan is intentionally added.

## Settings

Settings routes live under `/settings`.

- Add sidebar items in `src/renderer/pages/settings/components/SettingsSider.tsx`.
- Add mobile settings nav items through `SettingsPageWrapper.tsx`.
- Add routes in `src/renderer/components/layout/Router.tsx`.
- Add settings copy in `src/renderer/services/i18n/locales/en-US/settings.json`.

The built-in Hooks settings page is `/settings/hooks`.

## Testing

Run focused checks for the files you change. Useful commands:

```bash
npm run lint
npm run build:renderer:web
node scripts/check-i18n.js
```

When editing GoalBuddy state, validate the board:

```bash
node /Users/saminyasar/.codex/plugins/cache/goalbuddy/goalbuddy/0.3.6/skills/goalbuddy/scripts/check-goal-state.mjs docs/goals/agent-club-whitelabel/state.yaml
```

## Git And Change Safety

- Do not revert user changes unless the user explicitly asks.
- Keep commits and PR descriptions free of AI signatures.
- Use concise commit subjects in English.
- Keep refactors scoped to the requested change.
