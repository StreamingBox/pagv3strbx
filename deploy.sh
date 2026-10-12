#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$SCRIPT_DIR}"
export PROJECT_DIR

exec bash "$SCRIPT_DIR/scripts/deploy-on-ec2.sh" "$@"
