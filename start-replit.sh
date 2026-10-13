#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v nix-shell >/dev/null 2>&1; then
  echo 'This launcher needs Replit Nix (nix-shell). Use npm start on other platforms.' >&2
  exit 1
fi
npx playwright install chromium
export CHROMIUM_PATH="$(node -e "process.stdout.write(require('playwright').chromium.executablePath())")"
exec nix-shell playwright-shell.nix --run 'node server.cjs'
