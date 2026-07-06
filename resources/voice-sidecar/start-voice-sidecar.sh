#!/bin/sh
# Start the Agent Club voice sidecar (see README.md for one-time setup).
cd "$(dirname "$0")" || exit 1
if [ ! -x .venv/bin/python ]; then
  echo "voice-sidecar: no .venv found — run the one-time setup in README.md" >&2
  exit 1
fi
exec .venv/bin/python server.py
