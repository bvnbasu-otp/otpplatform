#!/usr/bin/env bash
# Reset OTP demo to walkthrough-ready state (Linux/macOS/Git Bash)
set -euo pipefail
cd "$(dirname "$0")/../.."
pnpm demo:reset
