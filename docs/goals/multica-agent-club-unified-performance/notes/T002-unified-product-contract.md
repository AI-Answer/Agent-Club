# T002 Unified Product Contract

## Product Goal

Agent Club should feel like one operating system for local agents, not a desktop app that happens to embed a second app. The user should understand:

- where the work lives,
- what agents are doing,
- what is scheduled,
- what Hermes can take over,
- why something is slow or warming,
- and how to jump from a dashboard/chat/scheduled item into the exact underlying manager object.

## Current Surfaces

Agent Club shell:

- Search and quick chat
- Dashboard
- Month Map
- Scheduled Tasks
- Local Agent Manager entrypoint
- Settings, channels, Composio key, Hermes setup, and native app features

Embedded Local Agent Manager:

- Goals
- Issues and boards
- Projects
- Planner
- Agents
- Runtimes
- Skills
- Autopilots
- Squads
- Inbox
- Usage

Agent/runtime layer:

- Hermes Chief of Staff
- OpenClaw, Claude, Codex, and local runtime agents
- Multica daemon and local agent registrations
- Scheduled tasks and Hermes cron-style work
- Channels such as Discord, Slack, iMessage, WeChat, and future MCP backed connectors

Dashboard/service layer:

- `DashboardService` already pulls Agent Manager status and summary into the personal dashboard.
- Work items can already link back to `/agent-manager`.
- The dashboard already knows about source health, scheduled tasks, Hermes, channels, and agent manager state.

## Desired Integration Contract

### 1. One Source Of Truth For Work

Local Agent Manager remains the source of truth for native goal, issue, task, runtime, and agent work.

Agent Club shell surfaces should not maintain competing task models. They should show lenses into the manager data and launch manager actions.

### 2. One Shell Navigation Model

Agent Club should own top-level navigation.

The manager iframe can still render Multica screens, but shell links should deep-link into:

```text
/agent-manager?next=/agent-club/goals
/agent-manager?next=/agent-club/issues
/agent-manager?next=/agent-club/agents
```

The sidebar should make "Agent Manager" feel like a section of Agent Club, not a separate app.

### 3. One Runtime Status Model

`AgentManagerStatus` should eventually expose:

- service state
- backend URL and web URL
- current bootstrap phase
- phase timings
- warmed routes
- prewarm progress
- local workspace id/slug
- daemon health
- registered runtime agents
- last error with a user-usable next action

This lets Dashboard, Scheduled Tasks, and the manager page all show the same truth.

### 4. One Session/Auth Lifecycle

The boot page is useful as a safe auth bridge, but repeated iframe booting makes the app feel like a bolted-on tool.

Target behavior:

- first load may use `/agent-club-boot`;
- subsequent manager navigation should deep-link directly when session is valid;
- route changes should not remount the iframe unless the service URL or auth state changes;
- auth refresh should be visible as a short status, not a mysterious blank screen.

### 5. One Event Loop

Agent Manager events should be available to the shell:

- active goal changed
- active issue changed
- agent run started/completed/blocked
- route warmed
- runtime connected/disconnected
- scheduled Hermes task created/updated

The shell can use this for dashboard cards, sidebar badges, scheduled task views, and chat context.

### 6. One Control Plane For Agents

Hermes, OpenClaw, Claude, Codex, and future agents should be controlled through the same model:

- capabilities
- channels
- MCP/connectors
- schedules
- visible work items
- runtime health
- "open in manager" or "resume chat" links

This can start as adapters and summary endpoints rather than a full rewrite.

## Tightening Without A Rewrite

The fastest path is to keep the current Electron + embedded manager architecture and improve the seams that users feel:

1. Add visible warmup/readiness state.
2. Warm the real routes users click, including goals and planner.
3. Avoid iframe remount/auth churn.
4. Add shell-native manager shortcuts and status chips.
5. Push manager data into Dashboard and Scheduled Tasks through explicit summary APIs.
6. Lazy-load heavy embedded route chrome.
7. Only consider deeper architecture changes after those smaller slices are measured.

## Product Rule

If a feature is about doing, tracking, scheduling, or auditing agent work, it should be representable in Local Agent Manager. Agent Club can make it easier to access, understand, and operate, but should not hide the manager truth behind disconnected duplicate screens.
