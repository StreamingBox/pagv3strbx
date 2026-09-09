#!/usr/bin/env bash
# Publish a built Vite frontend without ever exposing unreadable assets to nginx.
set -euo pipefail

SOURCE_DIR="${1:?Usage: publish-frontend.sh /path/to/built/dist [frontend-root]}"
FRONTEND_ROOT="${2:-/var/www/pageV3/frontend}"
RELEASES_DIR="$FRONTEND_ROOT/releases"
CURRENT_LINK="$FRONTEND_ROOT/current"
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"

[[ -f "$SOURCE_DIR/index.html" ]] || {
  echo "The build is missing index.html: $SOURCE_DIR" >&2
  exit 1
}

mkdir -p "$RELEASE_DIR"
cp -a "$SOURCE_DIR/." "$RELEASE_DIR/"

# nginx normally runs as www-data. Directories must be traversable and files
# readable after every deployment, regardless of the deploy user's umask.
find "$RELEASE_DIR" -type d -exec chmod 755 {} +
find "$RELEASE_DIR" -type f -exec chmod 644 {} +

ENTRY_ASSET="$(grep -oE '/assets/index-[^\" ]+\.js' "$RELEASE_DIR/index.html" | head -n 1 || true)"
[[ -n "$ENTRY_ASSET" && -r "$RELEASE_DIR$ENTRY_ASSET" ]] || {
  echo "The built entry JavaScript is missing or unreadable." >&2
  rm -rf "$RELEASE_DIR"
  exit 1
}

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK.next"
mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"

# Keep the two newest releases so a failed smoke check can be rolled back.
find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -nr | tail -n +3 | cut -d' ' -f2- | xargs -r rm -rf

echo "Published frontend release $RELEASE_ID"
