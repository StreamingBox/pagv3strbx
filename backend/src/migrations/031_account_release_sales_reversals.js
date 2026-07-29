const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];
const IGNORE_DUP_KEY = ["ER_DUP_KEYNAME"];

module.exports = {
    id: "031_account_release_sales_reversals",
    name: "Reverse released sales in analytics",
    async up({ query }) {
        await query(
            "ALTER TABLE sales_adjustments ADD COLUMN source_type VARCHAR(64) NULL",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE sales_adjustments ADD COLUMN source_id BIGINT NULL",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE sales_adjustments ADD COLUMN release_log_id BIGINT NULL",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE sales_adjustments ADD COLUMN order_id BIGINT NULL",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE sales_adjustments ADD COLUMN order_item_id BIGINT NULL",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE sales_adjustments ADD COLUMN platform_id BIGINT NULL",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE sales_adjustments ADD COLUMN cost_reversal_amount DECIMAL(12,2) NULL",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE sales_adjustments ADD COLUMN cost_reversal_currency VARCHAR(10) NULL",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE sales_adjustments ADD COLUMN item_count_delta INT NOT NULL DEFAULT 0",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE account_release_logs ADD COLUMN sales_adjustment_id BIGINT NULL",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );

        await query(
            "CREATE UNIQUE INDEX uq_sales_adjustments_source ON sales_adjustments(source_type, source_id)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );
        await query(
            "CREATE INDEX idx_sales_adjustments_platform_period ON sales_adjustments(platform_id, adjustment_date)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );
        await query(
            "CREATE INDEX idx_account_release_logs_sales_adjustment ON account_release_logs(sales_adjustment_id)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );

        // Existing forced releases already restored the wallet. Mirror them in
        // the sales ledger using the original sale date so historical charts,
        // platform totals, costs and profit no longer count a cancelled sale.
        await query(`
            INSERT INTO sales_adjustments (
                adjustment_date,
                currency,
                amount,
                reason,
                created_by_user_id,
                applies_to_user_id,
                source_type,
                source_id,
                release_log_id,
                order_id,
                order_item_id,
                platform_id,
                cost_reversal_amount,
                cost_reversal_currency,
                item_count_delta
            )
            SELECT
                DATE(DATE_SUB(COALESCE(o.created_at, arl.created_at), INTERVAL 5 HOUR)),
                UPPER(COALESCE(NULLIF(arl.wallet_currency, ''), NULLIF(o.currency, ''), NULLIF(s.currency, ''), 'COP')),
                -ROUND(COALESCE(NULLIF(arl.wallet_amount, 0), NULLIF(oi.price, 0), NULLIF(s.price, 0)), 2),
                CONCAT(
                    'Reversa analitica por liberacion forzada',
                    CASE WHEN arl.order_code IS NULL OR arl.order_code = '' THEN '' ELSE CONCAT(': ', arl.order_code) END
                ),
                arl.admin_user_id,
                arl.user_id,
                'subscription_release_refund',
                arl.subscription_id,
                arl.id,
                COALESCE(arl.order_id, oi.order_id),
                oi.id,
                oi.platform_id,
                CASE WHEN oi.id IS NULL THEN NULL ELSE GREATEST(COALESCE(oi.cost_amount, 0), 0) END,
                CASE
                    WHEN oi.id IS NULL THEN NULL
                    ELSE UPPER(COALESCE(NULLIF(oi.cost_currency, ''), NULLIF(o.currency, ''), 'COP'))
                END,
                CASE WHEN oi.id IS NULL THEN 0 ELSE -1 END
            FROM account_release_logs arl
            LEFT JOIN subscriptions s ON s.id = arl.subscription_id
            LEFT JOIN orders o ON o.id = arl.order_id
            LEFT JOIN order_items oi ON oi.subscription_id = arl.subscription_id
            WHERE arl.forced = 1
              AND arl.subscription_id IS NOT NULL
              AND arl.wallet_transaction_id IS NOT NULL
              AND COALESCE(NULLIF(arl.wallet_amount, 0), NULLIF(oi.price, 0), NULLIF(s.price, 0), 0) > 0
            ON DUPLICATE KEY UPDATE
                release_log_id = COALESCE(sales_adjustments.release_log_id, VALUES(release_log_id)),
                order_id = COALESCE(sales_adjustments.order_id, VALUES(order_id)),
                order_item_id = COALESCE(sales_adjustments.order_item_id, VALUES(order_item_id)),
                platform_id = COALESCE(sales_adjustments.platform_id, VALUES(platform_id)),
                cost_reversal_amount = COALESCE(sales_adjustments.cost_reversal_amount, VALUES(cost_reversal_amount)),
                cost_reversal_currency = COALESCE(sales_adjustments.cost_reversal_currency, VALUES(cost_reversal_currency)),
                item_count_delta = CASE
                    WHEN sales_adjustments.item_count_delta = 0 THEN VALUES(item_count_delta)
                    ELSE sales_adjustments.item_count_delta
                END
        `);

        await query(`
            UPDATE account_release_logs arl
            JOIN sales_adjustments sa
              ON sa.source_type = 'subscription_release_refund'
             AND sa.source_id = arl.subscription_id
            SET arl.sales_adjustment_id = sa.id
            WHERE arl.sales_adjustment_id IS NULL
        `);
    },
};
