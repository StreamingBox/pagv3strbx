const fs = require("fs");
const path = require("path");

const IGNORE_DUP_KEY = ["ER_DUP_KEYNAME", "ER_DUP_ENTRY"];
const BOGOTA_TODAY_SQL = "DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-05:00'))";

function migrateLegacyPublicTopupProofs() {
    const backendRoot = path.join(__dirname, "..", "..");
    const destination = path.join(backendRoot, "storage", "topup-proofs");
    const legacyDirectories = [
        path.join(backendRoot, "..", "frontend", "public", "topup-proofs"),
        path.join(backendRoot, "..", "frontend", "dist", "topup-proofs"),
    ];
    fs.mkdirSync(destination, { recursive: true });
    let moved = 0;
    for (const directory of legacyDirectories) {
        if (!fs.existsSync(directory)) continue;
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            const source = path.join(directory, entry.name);
            const target = path.join(destination, path.basename(entry.name));
            if (!fs.existsSync(target)) fs.copyFileSync(source, target);
            fs.unlinkSync(source);
            moved += 1;
        }
    }
    if (moved) console.info(`[migrate] ${moved} comprobante(s) publico(s) movido(s) a almacenamiento privado.`);
}

module.exports = {
    id: "024_integrity_idempotency_outbox",
    name: "Harden account integrity, checkout retries and notification delivery",
    async up({ query }) {
        // The legacy ENUM silently converted unsupported values to an empty string.
        // Keep the column permissive long enough to classify every legacy record first.
        await query("ALTER TABLE platform_accounts MODIFY COLUMN status VARCHAR(24) NOT NULL DEFAULT 'available'");
        await query("UPDATE platform_accounts SET status = LOWER(TRIM(status)) WHERE TRIM(COALESCE(status, '')) <> ''");
        await query(`
            UPDATE platform_accounts pa
            JOIN subscriptions s ON s.platform_account_id = pa.id
               SET pa.status = 'assigned',
                   pa.assigned_to_user_id = s.user_id,
                   pa.expires_at = CONCAT(DATE_ADD(DATE(s.expires_at), INTERVAL 1 DAY), ' 04:59:59')
             WHERE TRIM(COALESCE(pa.status, '')) = ''
               AND s.status = 'active'
               AND s.expires_at >= ${BOGOTA_TODAY_SQL}
               AND NOT EXISTS (
                    SELECT 1
                      FROM subscriptions newer
                     WHERE newer.platform_account_id = s.platform_account_id
                       AND newer.status = 'active'
                       AND newer.expires_at >= ${BOGOTA_TODAY_SQL}
                       AND (newer.expires_at > s.expires_at OR (newer.expires_at = s.expires_at AND newer.id > s.id))
               )
        `);
        await query(`
            UPDATE platform_accounts pa
               SET status = 'sold'
             WHERE TRIM(COALESCE(pa.status, '')) = ''
               AND EXISTS (
                    SELECT 1
                     FROM account_replacement_logs arl
                     WHERE arl.old_account_id = pa.id
               )
               AND NOT EXISTS (
                    SELECT 1
                      FROM subscriptions s
                     WHERE s.platform_account_id = pa.id
                       AND s.status = 'active'
                       AND s.expires_at >= ${BOGOTA_TODAY_SQL}
               )
        `);
        await query(`
            UPDATE platform_accounts
               SET status = 'legacy_review'
             WHERE TRIM(COALESCE(status, '')) = ''
        `);
        await query(`
            UPDATE platform_accounts
               SET status = 'legacy_review'
             WHERE status NOT IN ('available', 'assigned', 'sold', 'inactive', 'down', 'expired', 'disabled', 'legacy_review')
        `);
        await query(`
            ALTER TABLE platform_accounts
              ADD CONSTRAINT chk_platform_accounts_status
              CHECK (status IN ('available', 'assigned', 'sold', 'inactive', 'down', 'expired', 'disabled', 'legacy_review'))
        `, [], { ignoreCodes: IGNORE_DUP_KEY });
        await query(
            "CREATE INDEX idx_platform_accounts_stock_lookup ON platform_accounts(platform_id, status, expires_at, id)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );
        await query(
            "CREATE INDEX idx_subscriptions_contract_expiry ON subscriptions(status, expires_at, platform_account_id)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );
        await query(
            "CREATE INDEX idx_orders_currency_created ON orders(currency, created_at, user_id)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );

        await query("ALTER TABLE platform_accounts ADD COLUMN unit_cost_currency VARCHAR(10) NOT NULL DEFAULT 'COP'", [], { ignoreCodes: ["ER_DUP_FIELDNAME"] });
        await query("ALTER TABLE order_items ADD COLUMN cost_currency VARCHAR(10) NOT NULL DEFAULT 'COP'", [], { ignoreCodes: ["ER_DUP_FIELDNAME"] });

        await query(`
            CREATE TABLE IF NOT EXISTS account_integrity_conflicts (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                conflict_key VARCHAR(255) NOT NULL,
                conflict_type VARCHAR(64) NOT NULL,
                details_json LONGTEXT NOT NULL,
                status ENUM('open', 'resolved', 'ignored') NOT NULL DEFAULT 'open',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                resolved_at DATETIME NULL,
                UNIQUE KEY uq_account_integrity_conflicts_key (conflict_key),
                INDEX idx_account_integrity_conflicts_status (status, created_at)
            )
        `);
        await query(`
            INSERT IGNORE INTO account_integrity_conflicts (conflict_key, conflict_type, details_json)
            SELECT
                CONCAT('active-account:', s.platform_account_id),
                'active_account_multiple_users',
                JSON_OBJECT('platformAccountId', s.platform_account_id, 'users', COUNT(DISTINCT s.user_id), 'subscriptions', COUNT(*))
              FROM subscriptions s
             WHERE s.status = 'active'
               AND s.expires_at >= ${BOGOTA_TODAY_SQL}
               AND s.platform_account_id IS NOT NULL
             GROUP BY s.platform_account_id
            HAVING COUNT(DISTINCT s.user_id) > 1
        `);
        await query(`
            INSERT IGNORE INTO account_integrity_conflicts (conflict_key, conflict_type, details_json)
            SELECT
                CONCAT('active-identity:', pa.platform_id, ':', LOWER(TRIM(pa.email)), ':', COALESCE(pa.profile_number, -1)),
                'active_identity_multiple_users',
                JSON_OBJECT('platformId', pa.platform_id, 'email', LOWER(TRIM(pa.email)), 'profile', COALESCE(pa.profile_number, -1), 'users', COUNT(DISTINCT s.user_id))
              FROM subscriptions s
              JOIN platform_accounts pa ON pa.id = s.platform_account_id
             WHERE s.status = 'active'
               AND s.expires_at >= ${BOGOTA_TODAY_SQL}
             GROUP BY pa.platform_id, LOWER(TRIM(pa.email)), COALESCE(pa.profile_number, -1)
            HAVING COUNT(DISTINCT s.user_id) > 1
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS checkout_idempotency (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT NOT NULL,
                idempotency_key VARCHAR(160) NOT NULL,
                request_hash CHAR(64) NOT NULL,
                status ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'pending',
                order_id BIGINT NULL,
                order_code VARCHAR(64) NULL,
                response_json LONGTEXT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                completed_at DATETIME NULL,
                UNIQUE KEY uq_checkout_idempotency_user_key (user_id, idempotency_key),
                INDEX idx_checkout_idempotency_status (status, updated_at)
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS code_request_reservations (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                order_id BIGINT NOT NULL,
                platform_slug VARCHAR(80) NOT NULL,
                action VARCHAR(32) NOT NULL,
                credential_fingerprint VARCHAR(128) NOT NULL,
                reset_marker BIGINT NOT NULL DEFAULT 0,
                status ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'pending',
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_code_request_reservation (order_id, platform_slug, action, credential_fingerprint, reset_marker),
                INDEX idx_code_request_reservations_expiry (status, expires_at)
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS notification_outbox (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                channel ENUM('email', 'telegram') NOT NULL,
                event_type VARCHAR(80) NOT NULL,
                dedupe_key VARCHAR(191) NULL,
                payload_json LONGTEXT NOT NULL,
                status ENUM('pending', 'processing', 'sent', 'failed') NOT NULL DEFAULT 'pending',
                attempts INT NOT NULL DEFAULT 0,
                available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                sent_at DATETIME NULL,
                last_error TEXT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_notification_outbox_dedupe (dedupe_key),
                INDEX idx_notification_outbox_delivery (status, available_at, id)
            )
        `);

        migrateLegacyPublicTopupProofs();
    },
};
