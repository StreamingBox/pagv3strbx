#!/usr/bin/env bash
# Publish a built Vite frontend without ever exposing unreadable assets to nginx.
set -euo pipefail

SOURCE_DIR="${1:?Usage: publish-frontend.sh /path/to/built/dist [frontend-root]}"
FRONTEND_ROOT="${2:-/var/www/pageV3/frontend}"
RELEASES_DIR="$FRONTEND_ROOT/releases"
CURRENT_LINK="$FRONTEND_ROOT/current"
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
STAGING_DIR="$RELEASES_DIR/.staging-$RELEASE_ID"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFY_SCRIPT="$SCRIPT_DIR/../../frontend/scripts/verify-release.mjs"
PRESERVE_ASSETS_SCRIPT="$SCRIPT_DIR/../../frontend/scripts/carry-forward-release-assets.mjs"
SMOKE_URL="${FRONTEND_SMOKE_URL:-https://strbx.com.co/admin}"
SMOKE_HOST="${FRONTEND_SMOKE_HOST:-strbx.com.co}"
SOURCE_COMMIT="${FRONTEND_SOURCE_COMMIT:-}"
if [[ -z "$SOURCE_COMMIT" ]]; then
  SOURCE_REPO="$(git -C "$SCRIPT_DIR/../.." rev-parse --show-toplevel 2>/dev/null || true)"
  [[ -n "$SOURCE_REPO" && -z "$(git -C "$SOURCE_REPO" status --porcelain --untracked-files=normal)" ]] || {
    echo "Publish from a clean checkout, or supply the exact commit of a reviewed external build." >&2
    exit 1
  }
  SOURCE_COMMIT="$(git -C "$SOURCE_REPO" rev-parse HEAD)"
fi
[[ "$SOURCE_COMMIT" =~ ^[0-9a-f]{40}$ ]] || {
  echo "A full source commit SHA is required for release traceability." >&2
  exit 1
}

[[ -f "$SOURCE_DIR/index.html" ]] || {
  echo "The build is missing index.html: $SOURCE_DIR" >&2
  exit 1
}

[[ -f "$VERIFY_SCRIPT" ]] || {
  echo "The frontend release verifier is missing: $VERIFY_SCRIPT" >&2
  exit 1
}

[[ -f "$PRESERVE_ASSETS_SCRIPT" ]] || {
  echo "The frontend asset-retention script is missing: $PRESERVE_ASSETS_SCRIPT" >&2
  exit 1
}

if [[ -e "$CURRENT_LINK" && ! -L "$CURRENT_LINK" ]]; then
  echo "Refusing to replace a non-symlink frontend path: $CURRENT_LINK" >&2
  exit 1
fi

PREVIOUS_RELEASE=""
if [[ -L "$CURRENT_LINK" ]]; then
  PREVIOUS_RELEASE="$(readlink -f -- "$CURRENT_LINK" 2>/dev/null || true)"
  [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE/assets" ]] || {
    echo "The current frontend release or its assets cannot be resolved safely: $CURRENT_LINK" >&2
    exit 1
  }
fi

mkdir -p "$RELEASES_DIR"
[[ ! -e "$RELEASE_DIR" && ! -e "$STAGING_DIR" ]] || {
  echo "Release path already exists: $RELEASE_ID" >&2
  exit 1
}

trap 'if [[ -d "$STAGING_DIR" ]]; then rm -rf -- "$STAGING_DIR"; fi' EXIT
mkdir "$STAGING_DIR"
cp -a "$SOURCE_DIR/." "$STAGING_DIR/"
if [[ -n "$PREVIOUS_RELEASE" ]]; then
  node "$PRESERVE_ASSETS_SCRIPT" "$PREVIOUS_RELEASE/assets" "$STAGING_DIR/assets"
fi

# nginx normally runs as www-data. Directories must be traversable and files
# readable after every deployment, regardless of the deploy user's umask.
find "$STAGING_DIR" -type d -exec chmod 755 {} +
find "$STAGING_DIR" -type f -exec chmod 644 {} +

node "$VERIFY_SCRIPT" "$STAGING_DIR"

ENTRY_ASSET="$(grep -oE '/assets/index-[^\" ]+\.js' "$STAGING_DIR/index.html" | head -n 1 || true)"
[[ -n "$ENTRY_ASSET" && -r "$STAGING_DIR$ENTRY_ASSET" ]] || {
  echo "The built entry JavaScript is missing or unreadable." >&2
  exit 1
}

node - "$STAGING_DIR/release.json" "$SOURCE_COMMIT" "$RELEASE_ID" "$STAGING_DIR$ENTRY_ASSET" "$ENTRY_ASSET" <<'NODE'
const fs = require("node:fs");
const crypto = require("node:crypto");
const [manifest, sourceCommit, release, entryFile, entry] = process.argv.slice(2);
const entrySha256 = crypto.createHash("sha256").update(fs.readFileSync(entryFile)).digest("hex");
fs.writeFileSync(manifest, `${JSON.stringify({ sourceCommit, release, entry, entrySha256 }, null, 2)}\n`, { mode: 0o644 });
NODE

mv "$STAGING_DIR" "$RELEASE_DIR"
NEXT_LINK="$FRONTEND_ROOT/.current-$RELEASE_ID"
ln -s "$RELEASE_DIR" "$NEXT_LINK"
mv -Tf "$NEXT_LINK" "$CURRENT_LINK"

rollback_frontend() {
  if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    local rollback_link="$FRONTEND_ROOT/.rollback-$RELEASE_ID"
    ln -s "$PREVIOUS_RELEASE" "$rollback_link"
    mv -Tf "$rollback_link" "$CURRENT_LINK"
  elif [[ "$(readlink -f -- "$CURRENT_LINK" 2>/dev/null || true)" == "$RELEASE_DIR" ]]; then
    rm -f -- "$CURRENT_LINK"
  fi
}

if ! SERVED_HTML="$(curl --fail --silent --show-error --compressed --max-time 20 \
  --resolve "$SMOKE_HOST:443:127.0.0.1" \
  -H 'Cache-Control: no-cache' "$SMOKE_URL")"; then
  echo "Frontend smoke test failed; restoring the previous release." >&2
  rollback_frontend
  exit 1
fi

if ! grep -Fq "$ENTRY_ASSET" <<< "$SERVED_HTML"; then
  echo "Nginx did not serve the new frontend entry asset; restoring the previous release." >&2
  rollback_frontend
  exit 1
fi

MISSING_ASSET_SMOKE_URL="https://$SMOKE_HOST/assets/__strbx_missing_asset_probe__.js"
if ! MISSING_ASSET_STATUS="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 20 \
  --resolve "$SMOKE_HOST:443:127.0.0.1" "$MISSING_ASSET_SMOKE_URL")"; then
  echo "Missing-asset smoke request failed; restoring the previous release." >&2
  rollback_frontend
  exit 1
fi

if [[ "$MISSING_ASSET_STATUS" != "404" ]]; then
  echo "Missing assets must return HTTP 404 (received $MISSING_ASSET_STATUS); restoring the previous release." >&2
  rollback_frontend
  exit 1
fi

echo "Published frontend release $RELEASE_ID from $SOURCE_COMMIT"
