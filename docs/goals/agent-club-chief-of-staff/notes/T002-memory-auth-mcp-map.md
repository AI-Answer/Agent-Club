# T002 Memory, Auth, MCP, And Hook Map

## Local Discovery

- `codex mcp list` shows a configured `honcho` MCP server.
- `command -v hermes` returned no local executable.
- `command -v gogcli` returned no local executable.
- `command -v op` returned no local 1Password CLI executable.
- Repository search found no existing Honcho, Supermemory, gogcli, or memory-hook settings code outside this goal plan.
- Agent Manager OpenClaw testdata contains `1password` and `1password-credentials`, but the live Codex MCP list does not currently show a 1Password MCP server.

## Existing Integration Points

- `ConfigStorage` already persists MCP servers and agent MCP sync status through `mcp.config` and `mcp.agentInstallStatus`.
- `ToolsModalContent` already lists MCP servers, supports import/edit/delete/OAuth login, and syncs enabled MCPs to detected agents.
- `HooksSettings` is currently extension lifecycle documentation only; it does not configure global agent memory updates.
- Main settings routing and sidebar can add a first-class Memory settings tab with low blast radius.
- Agent Manager settings can later add deeper workspace-level memory/auth/MCP tabs once the main app foundation exists.

## Owner-Gated Work

- Google Workspace authentication through `gogcli.sh` needs the owner to install/authenticate or approve an external auth flow.
- 1Password MCP access needs a local 1Password CLI or MCP server to exist before the UI can verify it.
- Supermemory needs a real endpoint/API key or local MCP/server before hooks can be treated as operational.
- Hermes needs to be installed/detected or declared as a custom local agent before runtime coupling can be verified.

## Recommended First Slice

Implement a visible main-app Chief of Staff foundation that does not require credentials:

1. Add Memory settings for Honcho, Supermemory, Google Workspace setup, and global memory hook toggles.
2. Store settings locally in `ConfigStorage` without claiming backend memory writes are live.
3. Remove the development Agent Hub / install-from-market modal from Local Agents.
4. Sort detected local agents with Hermes first when present, then Codex, Claude Code, OpenClaw, then the rest.

Defer real Honcho/Supermemory write hooks, gogcli authentication, 1Password detection, and Agent Manager dashboard/goals kanban to later tranches after this visible foundation is verified.
