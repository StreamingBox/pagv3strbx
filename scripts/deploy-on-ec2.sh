#!/usr/bin/env bash
# Production deployment with a local rollback point. Run on the EC2 instance.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
PM2_APP="${PM2_APP:-pagev3-api}"
REPO_BRANCH="${REPO_BRANCH:-main}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/streaming-box}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/readiness}"
FRONTEND_ROOT="${FRONTEND_ROOT:-/var/www/pageV3/frontend}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/pagev3-deploy.lock}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)-$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"

is_preserved_untracked() {
  local candidate="$1" item
  local -a preserved=()
  IFS=',' read -r -a preserved <<< "${DEPLOY_PRESERVED_UNTRACKED:-}"
  for item in "${preserved[@]}"; do
    [[ "$item" == "$candidate" ]] && return 0
  done
  return 1
}

assert_clean_checkout() {
  local entry status path
  while IFS= read -r entry; do
    [[ -z "$entry" ]] && continue
    status="${entry:0:2}"
    path="${entry:3}"
    if [[ "$status" == "??" ]] && is_preserved_untracked "$path"; then
      echo "Preserving explicitly allowlisted untracked file: $path"
      continue
    fi
    echo "Hay cambios locales sin registrar. No se desplegará:" >&2
    git status --short >&2
    return 1
  done < <(git status --porcelain --untracked-files=all)
}

exec 9>"$DEPLOY_LOCK_FILE"
if ! flock -n 9; then
  echo "Another deployment is already running." >&2
  exit 1
fi

cd "$PROJECT_DIR"
CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "$REPO_BRANCH" ]]; then
  assert_clean_checkout || exit 1
  git switch "$REPO_BRANCH"
fi

assert_clean_checkout || exit 1

PREVIOUS_COMMIT="$(git rev-parse HEAD)"

umask 077
[[ ! -e "$BACKUP_DIR" ]] || { echo "Backup destination already exists; history preserved" >&2; exit 1; }
mkdir -p "$BACKUP_ROOT"
mkdir -m 700 "$BACKUP_DIR"
printf '%s\n' "$PREVIOUS_COMMIT" > "$BACKUP_DIR/previous-commit"
if [ -d frontend/dist ]; then
  tar -C frontend -czf "$BACKUP_DIR/frontend-dist.tgz" dist
fi

# Keep server-only configuration private; it is intentionally not copied into Git.
find backend -maxdepth 1 -type f -name '.env*.bak*' -exec chmod 600 {} \; 2>/dev/null || true

if [ "${SKIP_DB_BACKUP:-false}" != "true" ]; then
  echo ">>> production backup"
  bash scripts/backup-production.sh "$BACKUP_DIR/production"
fi

# The rollback files also require Drive, even when no database dump is requested.
node backend/scripts/upload-backup-drive.js "$BACKUP_DIR" deployment

rollback() {
  echo ">>> deployment failed; restoring $PREVIOUS_COMMIT"
  git switch --detach "$PREVIOUS_COMMIT"
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
if ! git merge-base --is-ancestor HEAD "origin/$REPO_BRANCH"; then
  echo "La rama local tiene commits que no están publicados en origin/$REPO_BRANCH. No se desplegó." >&2
  exit 1
fi
git merge --ff-only "origin/$REPO_BRANCH"

echo ">>> backend checks"
(cd backend && npm ci && npm run check && npm test)

echo ">>> database migrations"
(cd backend && npm run migrate)

echo ">>> frontend checks"
if [[ -n "${FRONTEND_LINT_TARGETS:-}" ]]; then
  read -r -a FRONTEND_LINT_TARGET_ARRAY <<< "$FRONTEND_LINT_TARGETS"
  (cd frontend && npm ci && npx eslint "${FRONTEND_LINT_TARGET_ARRAY[@]}" && npm test && npm run build && node scripts/verify-release.mjs dist)
else
  (cd frontend && npm ci && npm run lint && npm test && npm run build && node scripts/verify-release.mjs dist)
fi

echo ">>> dependency audits"
npm audit --audit-level=high
(cd backend && npm audit --omit=dev --audit-level=high)
(cd frontend && AUDIT_ALLOW_ADVISORIES="https://github.com/advisories/GHSA-mh99-v99m-4gvg,https://github.com/advisories/GHSA-qwww-vcr4-c8h2" AUDIT_ALLOW_PACKAGES="@eslint/config-array,@eslint/eslintrc,brace-expansion,eslint,minimatch,react-router,react-router-dom" node ../scripts/audit-dependencies.js)

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
    echo ">>> publishing verified frontend"
    bash ops/ec2/publish-frontend.sh frontend/dist "$FRONTEND_ROOT"
    trap - ERR
    echo ">>> deployment complete; commit: $(git rev-parse --short HEAD); backup: $BACKUP_DIR"
    exit 0
  fi
  sleep 2
done

echo "API did not become ready after restart." >&2
trap - ERR
rollback
exit 1
