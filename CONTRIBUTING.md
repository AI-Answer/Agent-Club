# Contributing To Agent Club

Agent Club contribution guidance is being rebuilt as part of the whitelabel pass.

## Working Rules

- Keep product-facing text branded as Agent Club.
- Send support and community references to https://www.skool.com/claude.
- Keep new visible UI text in i18n files.
- Preserve legal attribution unless it has been reviewed explicitly.
- Avoid broad runtime identifier renames unless the compatibility impact is understood.
- Run focused verification for every change.

## Useful Checks

```bash
npm run lint
npm run build:renderer:web
node scripts/check-i18n.js
```
