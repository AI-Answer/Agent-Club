# Month Map Planner Agent Access

The Month Map is a personal planning surface that agents can read and update through the authenticated `multica planner` CLI commands. The UI and the CLI use the same planner API, so changes made by an agent show up on the calendar and changes made in the app are visible to agents.

## Daily Context

Agents should read the planner before answering questions about priorities, focus, or what to do next:

```bash
multica planner context today --output json
```

Use a specific day when needed:

```bash
multica planner context 2026-05-14 --output json
```

Read the whole month:

```bash
multica planner month 2026 5 --output json
```

## Updating Priorities

When the user says something like "my top 3 today are x, y, z", update the board directly:

```bash
multica planner top3 \
  --task "x" \
  --task "y" \
  --task "z" \
  --output json
```

By default, matching task titles are updated and new task titles are added. Use `--replace` only when the user clearly wants the existing day cleared first:

```bash
multica planner top3 --replace \
  --task "First priority" \
  --task "Second priority" \
  --task "Third priority" \
  --output json
```

Add a single task:

```bash
multica planner add \
  --date today \
  --title "Draft webinar outline" \
  --body "Use the current webinar notes as context." \
  --priority high \
  --status planned \
  --output json
```

## Highlighting Days

Use day marks for travel, blocked days, event days, or visual reminders:

```bash
multica planner mark \
  --date 2026-05-18 \
  --color "#fde68a" \
  --label "Webinar" \
  --output json
```

Clear a mark:

```bash
multica planner unmark 2026-05-18 --output json
```

## Remote Access

Remote agents, Claude Desktop on another computer, or an MCP wrapper can use the same CLI as long as they have:

- `MULTICA_SERVER_URL`, for example `http://<agent-club-mac-ip>:18330`
- `MULTICA_WORKSPACE_ID`
- `MULTICA_TOKEN`, a personal access token for the Agent Club server

Example:

```bash
export MULTICA_SERVER_URL="http://<agent-club-mac-ip>:18330"
export MULTICA_WORKSPACE_ID="<workspace-id>"
export MULTICA_TOKEN="mul_..."

multica planner context today --output json
```

For local Agent Club dev, the `agent-club` profile is already configured:

```bash
multica --profile agent-club planner context today --output json
```

## Agent Runtime Prompt

Agent Club also injects these commands into the generated Multica Agent Runtime instructions, so in-app agents know the planner exists without relying on this guide. The guide is the durable human reference; the runtime prompt is the active instruction layer agents see during task execution.
