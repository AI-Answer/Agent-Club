#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${AGENT_CLUB_REPO:-https://github.com/Samin12/Agent-Club.git}"
INSTALL_DIR="${AGENT_CLUB_DIR:-$HOME/Agent-Club}"
START_APP=1

usage() {
  cat <<'EOF'
Agent Club macOS source installer

Usage:
  scripts/install-mac.sh [--repo <url>] [--dir <path>] [--no-start]

Environment variables:
  AGENT_CLUB_REPO   Git repository URL. Defaults to https://github.com/Samin12/Agent-Club.git
  AGENT_CLUB_DIR    Install directory. Defaults to ~/Agent-Club

Examples:
  curl -fsSL https://raw.githubusercontent.com/Samin12/Agent-Club/main/scripts/install-mac.sh | bash
  AGENT_CLUB_DIR="$HOME/Code/Agent-Club" bash scripts/install-mac.sh --no-start
EOF
}

log() {
  printf '[agent-club] %s\n' "$*"
}

fail() {
  printf '[agent-club] ERROR: %s\n' "$*" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo)
      REPO_URL="${2:-}"
      [ -n "$REPO_URL" ] || fail "--repo requires a URL"
      shift 2
      ;;
    --dir)
      INSTALL_DIR="${2:-}"
      [ -n "$INSTALL_DIR" ] || fail "--dir requires a path"
      shift 2
      ;;
    --no-start)
      START_APP=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

if [ "$(uname -s)" != "Darwin" ]; then
  fail "This installer is for macOS. Use scripts/install-windows.ps1 on Windows."
fi

ensure_git() {
  if command_exists git; then
    return
  fi

  log "Git is missing. Opening Apple's Command Line Tools installer..."
  xcode-select --install 2>/dev/null || true
  fail "Install Apple's Command Line Tools, then run this script again."
}

ensure_bun() {
  if command_exists bun; then
    log "Bun $(bun --version) is installed"
    return
  fi

  if ! command_exists curl; then
    fail "curl is required to install Bun."
  fi

  log "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"

  command_exists bun || fail "Bun installed, but it is not on PATH. Open a new terminal and run this script again."
  log "Bun $(bun --version) installed"
}

node_version_ok() {
  command_exists node || return 1
  node -e "const major=Number(process.versions.node.split('.')[0]); process.exit(major >= 22 && major < 25 ? 0 : 1)"
}

ensure_node() {
  if node_version_ok; then
    log "Node $(node --version) is installed"
    return
  fi

  if command_exists brew; then
    log "Installing Node 22 with Homebrew..."
    brew install node@22 || brew upgrade node@22 || true
    export PATH="/opt/homebrew/opt/node@22/bin:/usr/local/opt/node@22/bin:$PATH"
  else
    fail "Node.js >=22 and <25 is required. Install Node 22 or 24, then run this script again: https://nodejs.org/"
  fi

  node_version_ok || fail "Node.js is still not in the supported range. Current: $(node --version 2>/dev/null || echo missing)"
  log "Node $(node --version) is ready"
}

clone_or_update_repo() {
  mkdir -p "$(dirname "$INSTALL_DIR")"

  if [ -d "$INSTALL_DIR/.git" ]; then
    log "Updating existing checkout at $INSTALL_DIR"
    git -C "$INSTALL_DIR" fetch --prune
    git -C "$INSTALL_DIR" pull --ff-only
    return
  fi

  if [ -e "$INSTALL_DIR" ]; then
    fail "$INSTALL_DIR exists but is not a git checkout. Move it or set AGENT_CLUB_DIR to another path."
  fi

  log "Cloning Agent Club into $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
}

install_dependencies() {
  cd "$INSTALL_DIR"
  log "Installing dependencies with Bun..."
  bun install
}

start_app() {
  cd "$INSTALL_DIR"
  log "Starting Agent Club. Keep this terminal open while using the dev app."
  exec bun run start
}

main() {
  log "Installing Agent Club from $REPO_URL"
  ensure_git
  ensure_node
  ensure_bun
  clone_or_update_repo
  install_dependencies

  if [ "$START_APP" -eq 1 ]; then
    start_app
  fi

  log "Done. Start later with: cd \"$INSTALL_DIR\" && bun run start"
}

main
