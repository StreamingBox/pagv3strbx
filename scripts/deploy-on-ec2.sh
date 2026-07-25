#!/usr/bin/env bash
# Production deployment with a local rollback point. Run on the EC2 instance.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PM2_APP="${PM2_APP:-pagev3-api}"
REPO_BRANCH="${REPO_BRANCH:-main}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/streaming-box}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/readiness}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"

cd "$PROJECT_DIR"
PREVIOUS_COMMIT="$(git rev-parse HEAD)"

mkdir -p "$BACKUP_DIR"
printf '%s\n' "$PREVIOUS_COMMIT" > "$BACKUP_DIR/previous-commit"
if [ -d frontend/dist ]; then
  tar -C frontend -czf "$BACKUP_DIR/frontend-dist.tgz" dist
fi

# Keep server-only configuration private; it is intentionally not copied into Git.
find backend -maxdepth 1 -type f -name '.env*.bak*' -exec chmod 600 {} \; 2>/dev/null || true

if [ "${SKIP_DB_BACKUP:-false}" != "true" ]; then
  echo ">>> production backup"
  bash scripts/backup-production.sh "$BACKUP_DIR"
fi

rollback() {
  echo ">>> deployment failed; restoring $PREVIOUS_COMMIT"
  git reset --hard "$PREVIOUS_COMMIT"
  if [ -f "$BACKUP_DIR/frontend-dist.tgz" ]; then
    rm -rf frontend/dist
    tar -C frontend -xzf "$BACKUP_DIR/frontend-dist.tgz"
  fi
  (cd backend && npm ci --omit=dev)
  pm2 restart "$PM2_APP" --update-env || true
}
trap rollback ERR

echo ">>> updating source"
git fetch origin "$REPO_BRANCH"
git reset --hard "origin/$REPO_BRANCH"

echo ">>> backend checks"
(cd backend && npm ci && npm run check && npm test)

echo ">>> database migrations"
(cd backend && npm run migrate)

echo ">>> frontend checks"
(cd frontend && npm ci && npm run lint && npm test && npm run build)

echo ">>> dependency audits"
npm audit --audit-level=high
(cd backend && npm audit --audit-level=high)
(cd frontend && node ../scripts/audit-dependencies.js \
  --allow=https://github.com/advisories/GHSA-mh99-v99m-4gvg \
  --allow=https://github.com/advisories/GHSA-qwww-vcr4-c8h2 \
  --allow-package=@eslint/config-array \
  --allow-package=@eslint/eslintrc \
  --allow-package=brace-expansion \
  --allow-package=eslint \
  --allow-package=minimatch \
  --allow-package=react-router \
  --allow-package=react-router-dom)

echo ">>> restarting API"
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
else
  (cd backend && pm2 start src/index.js --name "$PM2_APP" --update-env)
  pm2 save
fi

echo ">>> readiness check"
for attempt in $(seq 1 18); do
  if curl --fail --silent --show-error "$HEALTH_URL" >/dev/null; then
    trap - ERR
    echo ">>> deployment complete; backup: $BACKUP_DIR"
    exit 0
  fi
  sleep 2
done

echo "API did not become ready after restart." >&2
trap - ERR
rollback
exit 1
