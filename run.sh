#!/usr/bin/env bash
# Start the Security Architecture Review Agent.
#
#   ./run.sh
#
# Creates the virtualenv and installs dependencies on first run.

set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "Creating virtualenv…"
  python3 -m venv .venv
  ./.venv/bin/pip install --quiet --upgrade pip
  ./.venv/bin/pip install --quiet -r requirements.txt
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Note: ANTHROPIC_API_KEY is not set. You can paste a key into the UI's Settings instead."
fi

exec ./.venv/bin/python server.py
