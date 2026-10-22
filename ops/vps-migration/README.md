# PageV3 migration stack

This Compose project is isolated from the existing CRM stack. Its default network is internal, so staging workers cannot reach external providers, email, Telegram, or payment APIs while the old VPS remains live.

The API image uses Node 24 LTS; Node 20 reached end of life before this migration.

## Staging

1. Copy `compose.env.example` to `compose.env`, set the database name and user, and keep it mode `0600`. Put the production backend environment in `backend/.env`, also mode `0600`; generate the Compose-safe copy with `node ops/vps-migration/escape-compose-env.js backend/.env backend/.env.compose`. Keep both mode `0600`; never commit either file.
2. Create `secrets/db-password`, `secrets/db-root-password`, and `secrets/netflix-worker.env` with mode `0600`. The worker file should contain only its token and runtime settings; do not copy the complete backend environment into it.
3. Set `PAGEV3_ROOT` and `PAGEV3_DATA_ROOT` in `compose.env` to the dedicated deployment and persistent-data directories.
4. Validate without printing resolved secrets:

   ```sh
   docker compose --env-file compose.env -f ops/vps-migration/compose.yaml config --quiet
   ```

5. Start staging with only the base file. Its internal network blocks outbound requests from the API and browser worker. Do not enable `compose.egress.yaml` or `compose.proxy.yaml` until cutover preparation is approved and the source workers are stopped.

## Final cutover

Keep the staging database intact. Create `compose.cutover.env` from `compose.cutover.env.example`, set `PAGEV3_FINAL_DB_NAME` to a new schema, grant the configured application user access to it, and restore the final source dump there. Start the API and backup jobs with `compose.cutover.yaml` so they use that schema. Attach only the web service to `strbx_proxy` with `compose.proxy.yaml`; keep the existing CRM Caddy route unchanged and add the `strbx.com.co` site from `Caddyfile`. Enable API/worker egress only after the source API and workers are stopped.

The web, API, and database bind only to loopback on ports 18081, 13100, and 13306 by default. The browser worker has no published host port. Do not use `docker compose down -v`; it removes persistent database data.

## Backups

The `maintenance` profile provides a daily backup and a retry-only Drive sync. The backup keeps a local copy if upload or remote verification fails. After a matching verified receipt is found, the runner removes only that new backup directory; older backups and all Drive history are preserved. The sync job intentionally does not use `--backfill` on the new host.

Install `pagev3-migration-backup.service`, `pagev3-migration-backup.timer`, `pagev3-migration-backup-sync.service`, and `pagev3-migration-backup-sync.timer` in `/etc/systemd/system` after staging validation. Run `systemctl daemon-reload` but leave both timers disabled until the cutover is approved. The backup-only egress overlay never attaches the staged API or browser worker to the internet.
