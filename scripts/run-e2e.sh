#!/usr/bin/env bash
# Run Playwright E2E tests for a Chrome MV3 extension.
#
# Chrome extensions require headless:false. On Linux CI there is no
# real display, so we wrap the run in Xvfb and set PWHEADLESS=true so
# the extension fixtures position the browser window off-screen.
#
# Usage:
#   bash scripts/run-e2e.sh                  # all projects
#   bash scripts/run-e2e.sh --project=smoke  # one project
set -euo pipefail

if [[ "$(uname -s)" == "Linux" ]]; then
  exec xvfb-run \
    --auto-servernum \
    --server-args="-screen 0 1280x960x24" \
    env PWHEADLESS=true npx playwright test "$@"
else
  # macOS / Windows: real display available, just move the window off-screen.
  exec env PWHEADLESS=true npx playwright test "$@"
fi
