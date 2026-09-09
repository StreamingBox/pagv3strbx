const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];
const IGNORE_DUP_INDEX = ["ER_DUP_KEYNAME"];

module.exports = {
    id: "033_event_links",
    name: "Add expiring YouTube event links",
    async up({ query }) {
        await query(
            "ALTER TABLE platforms ADD COLUMN is_event_link TINYINT(1) NOT NULL DEFAULT 0 AFTER type",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE platforms ADD COLUMN event_link_unit_cost DECIMAL(12,2) NOT NULL DEFAULT 3000.00 AFTER is_event_link",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE platforms ADD COLUMN event_link_monthly_cost DECIMAL(12,2) NOT NULL DEFAULT 20000.00 AFTER event_link_unit_cost",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );

        await query(`
            CREATE TABLE IF NOT EXISTS event_links (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                platform_id BIGINT NOT NULL,
                title VARCHAR(180) NOT NULL,
                url TEXT NOT NULL,
                ends_at DATETIME NOT NULL,
                unit_cost DECIMAL(12,2) NOT NULL DEFAULT 3000.00,
                currency VARCHAR(10) NOT NULL DEFAULT 'COP',
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                published_by_user_id BIGINT NULL,
                published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                closed_at DATETIME NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_event_links_platform_live (platform_id, is_active, ends_at),
                KEY idx_event_links_ends_at (ends_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await query(
            "ALTER TABLE subscriptions ADD COLUMN event_link_id BIGINT UNSIGNED NULL AFTER platform_account_id",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE subscriptions ADD COLUMN event_link_url TEXT NULL AFTER event_link_id",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE subscriptions ADD COLUMN event_link_title VARCHAR(180) NULL AFTER event_link_url",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE subscriptions ADD COLUMN event_link_ends_at DATETIME NULL AFTER event_link_title",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE subscriptions ADD INDEX idx_subscriptions_event_link (event_link_id)",
            [],
            { ignoreCodes: IGNORE_DUP_INDEX }
        );

        // This is the product explicitly created for Liga BetPlay links. It remains
        // inactive in the catalog until an event link with an end time is published.
        await query(
            `UPDATE platforms
                SET is_event_link = 1,
                    event_link_unit_cost = 3000.00,
                    event_link_monthly_cost = 20000.00
              WHERE slug = 'enlaces-ligabetplay-youtube'`
        );
    },
};
