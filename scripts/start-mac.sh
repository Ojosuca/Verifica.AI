#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -x .venv/bin/python ]]; then
  echo "Execute primeiro: bash scripts/setup-mac.sh" >&2
  exit 1
fi
# Evita que o Mac durma enquanto o teste está em execução.
if command -v caffeinate >/dev/null 2>&1; then
  exec caffeinate -i .venv/bin/python scripts/run_local.py --share "$@"
fi
exec .venv/bin/python scripts/run_local.py --share "$@"
