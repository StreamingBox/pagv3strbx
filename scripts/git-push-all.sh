#!/usr/bin/env bash
# Sube todos los cambios al remoto (add + commit + push).
# Uso:
#   ./scripts/git-push-all.sh
#   ./scripts/git-push-all.sh "mensaje del commit"
#   REMOTE=pagv3strbx ./scripts/git-push-all.sh   # otro remoto
#
# Requiere: Git Bash, WSL o Linux/macOS. Autenticación: gh, SSH o credential helper.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-$(git branch --show-current)}"
COMMIT_MSG="${1:-chore: sync $(date -u +%Y-%m-%dT%H:%M:%SZ)}"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Error: no es un repositorio git." >&2
  exit 1
fi

git add -A

if git diff --cached --quiet; then
  echo "No hay cambios nuevos para commitear."
else
  git commit -m "$COMMIT_MSG"
fi

echo "Push a $REMOTE ($BRANCH)..."
git push -u "$REMOTE" "$BRANCH"
echo "Listo."
