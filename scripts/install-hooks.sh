#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
if ! command -v pre-commit >/dev/null 2>&1; then
  echo "pre-commit is not installed."
  echo "Install it from https://pre-commit.com/#install (e.g. brew install pre-commit or pipx install pre-commit)"
  exit 1
fi
pre-commit install
pre-commit install --hook-type pre-push
echo "pre-commit and pre-push hooks installed for $(pwd)"
