#!/usr/bin/env bash
set -euo pipefail

ROOT=/opt/pagev3-migration
EXPECTED_HOST=srv2086935
RUNTIME=$ROOT/runtime-final
BASE=$RUNTIME/ops/vps-migration
SHA=${1:-}
ACTION=${2:-}
STAGE=$ROOT/staging/$SHA
RELEASE=$ROOT/releases/$SHA

[[ $(hostname) == "$EXPECTED_HOST" ]] || { echo 'Unexpected production host.' >&2; exit 1; }
[[ $SHA =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected a full Git commit SHA.' >&2; exit 2; }
[[ $ACTION == prepare || $ACTION == activate ]] || { echo 'Use prepare or activate.' >&2; exit 2; }
[[ -f $STAGE/deploy-release.sh && $(readlink -f "${BASH_SOURCE[0]}") == $(readlink -f "$STAGE/deploy-release.sh") ]] || {
    echo 'Run the deployment script staged for this release.' >&2; exit 1;
}

exec 9>/run/lock/pagev3-release-deploy.lock
flock -n 9 || { echo 'Another PageV3 release is running.' >&2; exit 1; }

COMMON=(docker compose --project-name pagev3-migration
    --env-file "$ROOT/compose.env"
    --env-file "$ROOT/compose.cutover.env"
    -f "$BASE/compose.yaml" -f "$BASE/compose.cutover.yaml"
    -f "$BASE/compose.egress.yaml" -f "$BASE/compose.proxy.yaml")
export PAGEV3_RELEASE_ROOT=$ROOT
export PAGEV3_RELEASE_SHA=$SHA
NEW=("${COMMON[@]}" -f "$STAGE/compose.release-images.template.yaml")

wait_healthy() {
    for attempt in $(seq 1 75); do
        [[ $(docker inspect --format '{{.State.Health.Status}}' "$1") == healthy ]] && return 0
        sleep 2
    done
    return 1
}

verify_backups() {
    local since=${BACKUP_SINCE:-}
    [[ $since =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || {
        echo 'Set BACKUP_SINCE to the UTC start time of the verified backups.' >&2
        return 1
    }
    docker exec -i pagev3-migration-api-1 node - "$since" <<'NODE'
const fs = require('node:fs');
const path = '/home/node/.strbx-drive-receipts';
const since = Date.parse(process.argv[2]);
const required = ['source', 'database', 'production'];
const receipts = fs.readdirSync(path)
    .filter(name => name.endsWith('.verified.json'))
    .map(name => { try { return JSON.parse(fs.readFileSync(`${path}/${name}`, 'utf8')); } catch { return null; } })
    .filter(Boolean);
for (const kind of required) {
    const ok = receipts.some(item => item.kind === kind && item.verified === true
        && Date.parse(item.createdAt) >= since
        && /^gdrive:StreamingBoxBackups\/production\//.test(item.driveTarget || '')
        && /^[a-f0-9]{64}$/.test(item.sha256 || '') && Number(item.bytes) > 0);
    if (!ok) { console.error(`Missing recent verified ${kind} backup.`); process.exit(1); }
}
console.log('Recent source, database and production backups have verified Drive read-back hashes.');
NODE
}

if [[ $ACTION == prepare ]]; then
    SOURCE_SHA256=${3:-}
    DIST_SHA256=${4:-}
    [[ $SOURCE_SHA256 =~ ^[a-f0-9]{64}$ && $DIST_SHA256 =~ ^[a-f0-9]{64}$ ]] || {
        echo 'Provide SHA-256 hashes for source.tar and dist.tgz.' >&2; exit 2;
    }
    [[ ! -e $RELEASE ]] || { echo 'Release path already exists; preserving it.' >&2; exit 1; }
    [[ $(sha256sum "$STAGE/source.tar" | cut -d' ' -f1) == "$SOURCE_SHA256" ]]
    [[ $(sha256sum "$STAGE/dist.tgz" | cut -d' ' -f1) == "$DIST_SHA256" ]]
    [[ $(git get-tar-commit-id < "$STAGE/source.tar") == "$SHA" ]]
    [[ $(tar -tf "$STAGE/source.tar" | awk '$0 == "ops/vps-migration/deploy-release.sh"') == "ops/vps-migration/deploy-release.sh" ]] || {
        echo 'Source archive must contain the repository tree at its root.' >&2; exit 1;
    }
    mkdir -m 755 "$RELEASE"
    tar -xf "$STAGE/source.tar" -C "$RELEASE"
    [[ -f $RELEASE/ops/vps-migration/deploy-release.sh ]] || {
        echo 'Staged deployment script is missing from the source archive.' >&2; exit 1;
    }
    cmp -s <(sed 's/\r$//' "$STAGE/deploy-release.sh") <(sed 's/\r$//' "$RELEASE/ops/vps-migration/deploy-release.sh") || {
        echo 'Staged deployment script differs from the source archive.' >&2; exit 1;
    }
    [[ ! -e $RELEASE/frontend/dist ]]
    mkdir -m 755 "$RELEASE/frontend/dist"
    tar -xzf "$STAGE/dist.tgz" -C "$RELEASE/frontend/dist"
    [[ -f $RELEASE/frontend/dist/index.html ]]
    "${NEW[@]}" config --quiet
    "${NEW[@]}" build api web netflix-tv-worker
    docker image inspect "pagev3-migration-api:$SHA" "pagev3-migration-web:$SHA" "pagev3-migration-netflix-tv-worker:$SHA" >/dev/null
    echo "Prepared release $SHA; production containers were not changed."
    exit 0
fi

[[ -f $RELEASE/frontend/dist/index.html ]] || { echo 'Prepared frontend release is missing.' >&2; exit 1; }
declare -A PREVIOUS_SHA OLD_OVERLAY
already_active=1
for service in api web netflix-tv-worker; do
    container="pagev3-migration-$service-1"
    [[ $(docker inspect --format '{{.State.Health.Status}}' "$container") == healthy ]] || {
        echo "Active $service is not healthy; refusing activation." >&2; exit 1;
    }

    image=$(docker inspect --format '{{.Config.Image}}' "$container")
    [[ $image =~ ^pagev3-migration-${service}:([0-9a-f]{40})$ ]] || {
        echo "Unexpected active $service image." >&2; exit 1;
    }
    previous=${BASH_REMATCH[1]}
    PREVIOUS_SHA[$service]=$previous
    [[ $previous == "$SHA" ]] || already_active=0

    old_stage=$ROOT/staging/$previous
    old_overlay=$old_stage/compose.release-images.yaml
    [[ -f $old_overlay ]] || old_overlay=$old_stage/compose.release-images.template.yaml
    [[ -f $old_overlay ]] || { echo "Previous $service release overlay is missing; refusing activation." >&2; exit 1; }
    OLD_OVERLAY[$service]=$old_overlay

    export PAGEV3_RELEASE_SHA=$previous
    OLD=("${COMMON[@]}" -f "$old_overlay")
    "${OLD[@]}" config --quiet
    expected=$("${OLD[@]}" config --hash "$service" | awk -v service="$service" '$1 == service { print $2 }')
    actual=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' "$container")
    [[ -n $expected && $expected == "$actual" ]] || {
        echo "Active $service configuration drifted; refusing activation." >&2; exit 1;
    }
    docker image inspect "pagev3-migration-$service:$previous" >/dev/null || {
        echo "Rollback image for $service is missing; refusing activation." >&2; exit 1;
    }
done
[[ $already_active == 0 ]] || { echo 'This release is already active.' >&2; exit 1; }
export PAGEV3_RELEASE_SHA=$SHA
verify_backups
docker image inspect "pagev3-migration-api:$SHA" "pagev3-migration-web:$SHA" "pagev3-migration-netflix-tv-worker:$SHA" >/dev/null

rollback() {
    trap - ERR
    echo 'Release health check failed; restoring each service to its previous image.' >&2
    local failed=0 service previous container
    for service in web api netflix-tv-worker; do
        previous=${PREVIOUS_SHA[$service]}
        container="pagev3-migration-$service-1"
        export PAGEV3_RELEASE_SHA=$previous
        OLD=("${COMMON[@]}" -f "${OLD_OVERLAY[$service]}")
        if ! "${OLD[@]}" up -d --no-deps --no-build --pull never "$service"; then
            echo "Rollback command failed for $service." >&2
            failed=1
            continue
        fi
        if ! wait_healthy "$container"; then
            echo "Rollback health check failed for $service." >&2
            failed=1
        fi
    done
    if (( failed )); then
        echo 'Rollback was incomplete; inspect all three service images and health states.' >&2
        exit 1
    fi
    echo 'Previous per-service release set restored and healthy.' >&2
    exit 1
}

trap rollback ERR
"${NEW[@]}" up -d --no-deps --no-build --pull never netflix-tv-worker
wait_healthy pagev3-migration-netflix-tv-worker-1
"${NEW[@]}" up -d --no-deps --no-build --pull never api
wait_healthy pagev3-migration-api-1
"${NEW[@]}" up -d --no-deps --no-build --pull never web
wait_healthy pagev3-migration-web-1
curl --fail --silent --show-error http://127.0.0.1:13100/api/readiness
curl --fail --silent --show-error -o /dev/null http://127.0.0.1:18081/
trap - ERR
docker inspect --format '{{.Name}} {{.Config.Image}} {{.State.Health.Status}}' pagev3-migration-api-1 pagev3-migration-web-1 pagev3-migration-netflix-tv-worker-1
