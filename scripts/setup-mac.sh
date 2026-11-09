#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != Darwin ]]; then
  echo "Este instalador é para macOS." >&2
  exit 1
fi
if ! command -v brew >/dev/null 2>&1; then
  echo "Instale o Homebrew em https://brew.sh e execute este comando novamente." >&2
  exit 1
fi
if ! command -v python3.12 >/dev/null 2>&1; then
  brew install python@3.12
fi
if ! command -v cloudflared >/dev/null 2>&1; then
  brew install cloudflared
fi
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m backend.download_models --objects
echo "Instalação concluída. Inicie com: bash scripts/start-mac.sh"
