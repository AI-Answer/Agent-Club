# T004 Link Polish Receipt

## Result

Done.

## Summary

Polished the chat links so the user can stay inside the Agent Club app window:

- Generated goal links now use internal `/agent-manager?next=...` app routes instead of external localhost URLs.
- Markdown link handling routes Agent Manager links through React navigation in the Electron window.
- Existing old `localhost:3330/agent-club-boot?next=...` links are still intercepted as a compatibility fallback.
- The `Project board` link now opens the project Kanban page, while `Goal` opens the goal detail page.

## Verification

- Electron/CDP smoke confirmed the rendered board link has `href=/agent-manager?...`.
- The board link's `next` parameter points at `/agent-club/projects/<projectId>`.
- Clicking the board link navigated the app to `#/agent-manager?next=...` and loaded the Local Agent Manager project Kanban inside the iframe.
- Throwaway `Slash ... smoke` goals created by testing were deleted through the local API.
