# T011 Live Native Channel Smoke Blocker

## Status

Blocked on owner-approved credentials and explicit safe test targets.

## Why This Is Blocked

The local implementation is ready for controlled smoke testing, but the remaining proof requires sending and receiving real messages through external or personal channels. That should not happen without explicit owner approval and test-only targets.

## Required Inputs

Slack:
- Bot token for the installed Slack app.
- App-level token with Socket Mode enabled.
- A safe test workspace and either a test channel ID or DM target.
- Permission to send one inbound test mention/DM and one outbound Hermes reply.

Discord:
- Bot token for a test Discord application.
- Message Content intent and required gateway intents enabled.
- A safe test server/channel or DM target.
- Permission to send one inbound mention/DM and one outbound Hermes reply.

iMessage via BlueBubbles:
- BlueBubbles server URL.
- BlueBubbles server password/guid.
- A specific test chat GUID/contact.
- Permission to configure the Agent Club webhook and send one test reply only to that target.

## Safety Rules

- Do not record tokens, passwords, phone numbers, or chat GUIDs in the board.
- Do not read or send personal messages outside the explicit test target.
- Redact secrets from terminal output, screenshots, receipts, and commits.
- If any live smoke fails because of credentials or account setup, record only the platform, sanitized error class, and next owner action.

## Current Local Evidence

- Slack plugin: native Socket Mode ingest plus Web API send/edit path implemented and typechecked.
- Discord plugin: native Gateway ingest plus REST send/edit path implemented and typechecked.
- iMessage plugin: BlueBubbles REST send plus signed webhook ingress implemented and typechecked.
- UI smoke confirmed the visible channel set is Telegram, WeChat, Slack, Discord, and iMessage, with Lark, DingTalk, and WeCom hidden.
- Mocked BlueBubbles smoke confirmed ping and final stripped text send behavior.
