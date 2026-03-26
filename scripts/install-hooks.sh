#!/usr/bin/env bash
# Mirrors tesse-backend/Makefile install-hooks: unset hooksPath, install from repo-root config.
# tesse: uv run pre-commit install --config "$(REPO_ROOT)/.pre-commit-config.yaml"
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
git config --local --unset-all core.hooksPath 2>/dev/null || true
if ! command -v pre-commit >/dev/null 2>&1; then
  echo "pre-commit is not installed."
  echo "Install it from https://pre-commit.com/#install (e.g. brew install pre-commit or pipx install pre-commit)"
  exit 1
fi
pre-commit install --config "$ROOT/.pre-commit-config.yaml" --hook-type pre-commit --hook-type pre-push
echo "pre-commit + pre-push hooks installed for $ROOT (config: $ROOT/.pre-commit-config.yaml)"
