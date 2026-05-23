const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];
const IGNORE_DUP_KEY = ["ER_DUP_KEYNAME"];

const statements = [
    { sql: "ALTER TABLE wallet_transactions MODIFY COLUMN type VARCHAR(50) NOT NULL" },
    { sql: 'UPDATE wallet_transactions SET type="invest_adj" WHERE reference_type="admin_invest_adj" AND type=""' },
    { sql: 'UPDATE wallet_transactions SET type="profit_adj" WHERE reference_type="admin_profit_adj" AND type=""' },

    { sql: "ALTER TABLE subscriptions ADD COLUMN reminder_sent TINYINT(1) DEFAULT 0", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE platforms ADD COLUMN is_promo TINYINT(1) NOT NULL DEFAULT 0", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE platforms ADD COLUMN promo_color VARCHAR(24) NULL DEFAULT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscriptions ADD COLUMN delivered_platform_id INT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE order_items ADD COLUMN delivered_platform_id INT NULL", ignoreCodes: IGNORE_DUP_COLUMN },

    {
        sql: `
            CREATE TABLE IF NOT EXISTS platform_fallbacks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                source_platform_id INT NOT NULL,
                fallback_platform_id INT NOT NULL,
                priority INT NOT NULL DEFAULT 1,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_platform_fallback_pair (source_platform_id, fallback_platform_id),
                INDEX idx_platform_fallback_source (source_platform_id, is_active, priority),
                INDEX idx_platform_fallback_target (fallback_platform_id)
            )
        `,
    },
    { sql: "ALTER TABLE platform_fallbacks ADD COLUMN priority INT NOT NULL DEFAULT 1", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE platform_fallbacks ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE platform_fallbacks ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "CREATE UNIQUE INDEX uq_platform_fallback_pair ON platform_fallbacks(source_platform_id, fallback_platform_id)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_platform_fallback_source ON platform_fallbacks(source_platform_id, is_active, priority)", ignoreCodes: IGNORE_DUP_KEY },

    {
        sql: `
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                token_hash CHAR(64) NOT NULL,
                expires_at DATETIME NOT NULL,
                used_at DATETIME NULL DEFAULT NULL,
                requested_ip VARCHAR(64) NULL DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_password_reset_token_hash (token_hash),
                INDEX idx_password_reset_user_created (user_id, created_at),
                INDEX idx_password_reset_expires (expires_at)
            )
        `,
    },
    { sql: "ALTER TABLE password_reset_tokens ADD COLUMN used_at DATETIME NULL DEFAULT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE password_reset_tokens ADD COLUMN requested_ip VARCHAR(64) NULL DEFAULT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "CREATE UNIQUE INDEX uq_password_reset_token_hash ON password_reset_tokens(token_hash)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_password_reset_user_created ON password_reset_tokens(user_id, created_at)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_password_reset_expires ON password_reset_tokens(expires_at)", ignoreCodes: IGNORE_DUP_KEY },

    {
        sql: `
            CREATE TABLE IF NOT EXISTS stock_subscriptions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                platform_price_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_notified BOOLEAN DEFAULT FALSE,
                UNIQUE KEY unique_subs (user_id, platform_price_id)
            )
        `,
    },
    {
        sql: `
            CREATE TABLE IF NOT EXISTS user_notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_unread (user_id, is_read)
            )
        `,
    },

    { sql: "CREATE INDEX idx_orders_user_created ON orders(user_id, created_at)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_orders_created ON orders(created_at)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_order_items_order_platform ON order_items(order_id, platform_id)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "ALTER TABLE platform_accounts ADD COLUMN parent_account_cost_total DECIMAL(12,2) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE platform_accounts ADD COLUMN parent_profiles_total INT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE platform_accounts ADD COLUMN unit_cost DECIMAL(12,2) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE platform_accounts MODIFY COLUMN access_url TEXT NULL" },
    { sql: "CREATE INDEX idx_platform_accounts_unit_cost ON platform_accounts(unit_cost)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "ALTER TABLE order_items ADD COLUMN cost_amount DECIMAL(12,2) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE order_items ADD COLUMN profit_amount DECIMAL(12,2) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE order_items ADD COLUMN combo_id INT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE order_items ADD COLUMN combo_name VARCHAR(160) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "CREATE INDEX idx_order_items_subscription_id ON order_items(subscription_id)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_order_items_combo_id ON order_items(combo_id)", ignoreCodes: IGNORE_DUP_KEY },

    {
        sql: `
            CREATE TABLE IF NOT EXISTS combos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(160) NOT NULL,
                slug VARCHAR(180) NOT NULL,
                description TEXT NULL,
                badge VARCHAR(80) NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                sort_order INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_combos_slug (slug),
                INDEX idx_combos_active_sort (is_active, sort_order)
            )
        `,
    },
    {
        sql: `
            CREATE TABLE IF NOT EXISTS combo_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                combo_id INT NOT NULL,
                platform_id INT NOT NULL,
                duration_id INT NOT NULL,
                quantity INT NOT NULL DEFAULT 1,
                sort_order INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_combo_item_plan (combo_id, platform_id, duration_id),
                INDEX idx_combo_items_combo (combo_id),
                INDEX idx_combo_items_plan (platform_id, duration_id)
            )
        `,
    },
    {
        sql: `
            CREATE TABLE IF NOT EXISTS combo_prices (
                id INT AUTO_INCREMENT PRIMARY KEY,
                combo_id INT NOT NULL,
                currency VARCHAR(10) NOT NULL,
                price DECIMAL(12,2) NOT NULL DEFAULT 0,
                compare_at_price DECIMAL(12,2) NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_combo_price_currency (combo_id, currency),
                INDEX idx_combo_prices_active (currency, is_active)
            )
        `,
    },
    { sql: "ALTER TABLE combos ADD COLUMN description TEXT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE combos ADD COLUMN badge VARCHAR(80) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE combos ADD COLUMN sort_order INT NOT NULL DEFAULT 0", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE combos ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE combo_items ADD COLUMN quantity INT NOT NULL DEFAULT 1", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE combo_items ADD COLUMN sort_order INT NOT NULL DEFAULT 0", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE combo_prices ADD COLUMN compare_at_price DECIMAL(12,2) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE combo_prices ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1", ignoreCodes: IGNORE_DUP_COLUMN },

    {
        sql: `
            CREATE TABLE IF NOT EXISTS account_replacement_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                subscription_id INT NOT NULL,
                order_id INT NULL,
                order_code VARCHAR(64) NULL,
                user_id INT NULL,
                admin_user_id INT NULL,
                platform_id INT NULL,
                old_account_id INT NOT NULL,
                old_account_email VARCHAR(191) NULL,
                new_account_id INT NOT NULL,
                new_account_email VARCHAR(191) NULL,
                previous_expires_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_replacement_logs_created (created_at),
                INDEX idx_replacement_logs_subscription (subscription_id),
                INDEX idx_replacement_logs_order (order_id),
                INDEX idx_replacement_logs_platform (platform_id)
            )
        `,
    },
    { sql: "ALTER TABLE account_replacement_logs ADD COLUMN order_id INT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE account_replacement_logs ADD COLUMN order_code VARCHAR(64) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE account_replacement_logs ADD COLUMN user_id INT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE account_replacement_logs ADD COLUMN admin_user_id INT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE account_replacement_logs ADD COLUMN platform_id INT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE account_replacement_logs ADD COLUMN old_account_email VARCHAR(191) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE account_replacement_logs ADD COLUMN new_account_email VARCHAR(191) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE account_replacement_logs ADD COLUMN previous_expires_at DATETIME NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "CREATE INDEX idx_replacement_logs_created ON account_replacement_logs(created_at)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_replacement_logs_subscription ON account_replacement_logs(subscription_id)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_replacement_logs_order ON account_replacement_logs(order_id)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_replacement_logs_platform ON account_replacement_logs(platform_id)", ignoreCodes: IGNORE_DUP_KEY },

    {
        sql: `
            CREATE TABLE IF NOT EXISTS account_upload_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                type ENUM('manual','bulk') NOT NULL DEFAULT 'manual',
                admin_id INT NULL,
                admin_email VARCHAR(120) NULL,
                platform_id INT NULL,
                platform_name VARCHAR(100) NULL,
                total_rows INT NOT NULL DEFAULT 1,
                inserted INT NOT NULL DEFAULT 0,
                skipped INT NOT NULL DEFAULT 0,
                errors INT NOT NULL DEFAULT 0,
                source_filename VARCHAR(255) NULL,
                notes TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_upload_logs_created (created_at),
                INDEX idx_upload_logs_type (type),
                INDEX idx_upload_logs_admin (admin_id)
            )
        `,
    },
    {
        sql: `
            CREATE TABLE IF NOT EXISTS subscription_renewal_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                subscription_id INT NOT NULL,
                previous_order_id INT NULL,
                previous_order_code VARCHAR(64) NULL,
                renewal_order_id INT NOT NULL,
                renewal_order_code VARCHAR(64) NOT NULL,
                user_id INT NOT NULL,
                actor_user_id INT NOT NULL,
                actor_role VARCHAR(32) NOT NULL,
                platform_id INT NULL,
                platform_price_id INT NULL,
                previous_account_id INT NULL,
                new_account_id INT NULL,
                previous_expires_at DATETIME NULL,
                new_expires_at DATETIME NOT NULL,
                amount_charged DECIMAL(12,2) NOT NULL DEFAULT 0,
                currency VARCHAR(10) NOT NULL DEFAULT 'COP',
                deduct_wallet TINYINT(1) NOT NULL DEFAULT 1,
                wallet_id INT NULL,
                balance_before DECIMAL(12,2) NULL,
                balance_after DECIMAL(12,2) NULL,
                note TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_renewal_logs_created (created_at),
                INDEX idx_renewal_logs_subscription (subscription_id),
                INDEX idx_renewal_logs_user (user_id),
                INDEX idx_renewal_logs_actor (actor_user_id),
                INDEX idx_renewal_logs_platform (platform_id),
                INDEX idx_renewal_logs_order (renewal_order_id)
            )
        `,
    },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN previous_order_id INT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN previous_order_code VARCHAR(64) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN renewal_order_id INT NOT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN renewal_order_code VARCHAR(64) NOT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN user_id INT NOT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN actor_user_id INT NOT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN actor_role VARCHAR(32) NOT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN platform_id INT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN platform_price_id INT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN previous_account_id INT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN new_account_id INT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN previous_expires_at DATETIME NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN new_expires_at DATETIME NOT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN amount_charged DECIMAL(12,2) NOT NULL DEFAULT 0", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'COP'", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN deduct_wallet TINYINT(1) NOT NULL DEFAULT 1", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN wallet_id INT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN balance_before DECIMAL(12,2) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN balance_after DECIMAL(12,2) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE subscription_renewal_logs ADD COLUMN note TEXT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "CREATE INDEX idx_renewal_logs_created ON subscription_renewal_logs(created_at)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_renewal_logs_subscription ON subscription_renewal_logs(subscription_id)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_renewal_logs_user ON subscription_renewal_logs(user_id)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_renewal_logs_actor ON subscription_renewal_logs(actor_user_id)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_renewal_logs_platform ON subscription_renewal_logs(platform_id)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_renewal_logs_order ON subscription_renewal_logs(renewal_order_id)", ignoreCodes: IGNORE_DUP_KEY },

    {
        sql: `
            CREATE TABLE IF NOT EXISTS manual_topup_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                request_code VARCHAR(32) NOT NULL,
                user_id INT NOT NULL,
                wallet_id INT NULL,
                method_key VARCHAR(32) NOT NULL DEFAULT 'binance',
                method_label VARCHAR(64) NOT NULL DEFAULT 'Binance',
                amount DECIMAL(12,2) NOT NULL,
                currency VARCHAR(10) NOT NULL DEFAULT 'USD',
                proof_file_url VARCHAR(255) NOT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'submitted',
                submitted_email_sent_at DATETIME NULL,
                reviewing_email_sent_at DATETIME NULL,
                approved_email_sent_at DATETIME NULL,
                rejected_email_sent_at DATETIME NULL,
                admin_user_id INT NULL,
                admin_note TEXT NULL,
                balance_before DECIMAL(12,2) NULL,
                balance_after DECIMAL(12,2) NULL,
                approved_at DATETIME NULL,
                rejected_at DATETIME NULL,
                reviewing_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_manual_topup_request_code (request_code),
                INDEX idx_manual_topup_user (user_id),
                INDEX idx_manual_topup_status (status),
                INDEX idx_manual_topup_created (created_at)
            )
        `,
    },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN request_code VARCHAR(32) NOT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN wallet_id INT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN method_key VARCHAR(32) NOT NULL DEFAULT 'binance'", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN method_label VARCHAR(64) NOT NULL DEFAULT 'Binance'", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN amount DECIMAL(12,2) NOT NULL DEFAULT 0", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'USD'", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN proof_file_url VARCHAR(255) NOT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'submitted'", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN submitted_email_sent_at DATETIME NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN reviewing_email_sent_at DATETIME NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN approved_email_sent_at DATETIME NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN rejected_email_sent_at DATETIME NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN admin_user_id INT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN admin_note TEXT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN balance_before DECIMAL(12,2) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN balance_after DECIMAL(12,2) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN approved_at DATETIME NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN rejected_at DATETIME NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN reviewing_at DATETIME NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN payer_name VARCHAR(160) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN declared_paid_at DATETIME NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN auto_validation_status VARCHAR(32) NOT NULL DEFAULT 'pending'", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN auto_validation_note TEXT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN last_auto_checked_at DATETIME NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN matched_email_uid VARCHAR(255) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN matched_email_subject VARCHAR(255) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN matched_sender_name VARCHAR(255) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN matched_email_amount DECIMAL(12,2) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_requests ADD COLUMN matched_email_received_at DATETIME NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "CREATE UNIQUE INDEX uq_manual_topup_request_code ON manual_topup_requests(request_code)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_manual_topup_user ON manual_topup_requests(user_id)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_manual_topup_status ON manual_topup_requests(status)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_manual_topup_created ON manual_topup_requests(created_at)", ignoreCodes: IGNORE_DUP_KEY },

    {
        sql: `
            CREATE TABLE IF NOT EXISTS manual_topup_proof_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                token VARCHAR(64) NOT NULL,
                topup_id INT NOT NULL,
                proof_file_url VARCHAR(255) NOT NULL,
                created_by_user_id INT NULL,
                created_by_role VARCHAR(32) NULL,
                opened_at DATETIME NULL,
                revoked_at DATETIME NULL,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_manual_topup_proof_token (token),
                INDEX idx_manual_topup_proof_topup (topup_id),
                INDEX idx_manual_topup_proof_expires (expires_at)
            )
        `,
    },
    { sql: "ALTER TABLE manual_topup_proof_tokens ADD COLUMN token VARCHAR(64) NOT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_proof_tokens ADD COLUMN topup_id INT NOT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_proof_tokens ADD COLUMN proof_file_url VARCHAR(255) NOT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_proof_tokens ADD COLUMN created_by_user_id INT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_proof_tokens ADD COLUMN created_by_role VARCHAR(32) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_proof_tokens ADD COLUMN opened_at DATETIME NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_proof_tokens ADD COLUMN revoked_at DATETIME NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE manual_topup_proof_tokens ADD COLUMN expires_at DATETIME NOT NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "CREATE UNIQUE INDEX uq_manual_topup_proof_token ON manual_topup_proof_tokens(token)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_manual_topup_proof_topup ON manual_topup_proof_tokens(topup_id)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_manual_topup_proof_expires ON manual_topup_proof_tokens(expires_at)", ignoreCodes: IGNORE_DUP_KEY },

    {
        sql: `
            CREATE TABLE IF NOT EXISTS advertising_folders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                folder_id VARCHAR(255) NOT NULL,
                folder_name VARCHAR(255) NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_advertising_folder_id (folder_id),
                INDEX idx_advertising_folder_active (is_active)
            )
        `,
    },
    { sql: "ALTER TABLE advertising_folders ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE advertising_folders ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "CREATE UNIQUE INDEX uq_advertising_folder_id ON advertising_folders(folder_id)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_advertising_folder_active ON advertising_folders(is_active)", ignoreCodes: IGNORE_DUP_KEY },

    {
        sql: `
            CREATE TABLE IF NOT EXISTS advertising_images (
                id INT AUTO_INCREMENT PRIMARY KEY,
                folder_name VARCHAR(255) NOT NULL,
                folder_id VARCHAR(255) NULL,
                file_name VARCHAR(255) NOT NULL,
                file_id VARCHAR(255) NOT NULL,
                file_hash CHAR(64) NULL,
                mime_type VARCHAR(100) NULL DEFAULT 'image/jpeg',
                web_view_link TEXT NULL,
                thumbnail_link TEXT NULL,
                image_size INT NULL DEFAULT 0,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                sort_order INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_advertising_folder (folder_name),
                INDEX idx_advertising_active (is_active),
                INDEX idx_advertising_sort (sort_order)
            )
        `,
    },
    { sql: "ALTER TABLE advertising_images ADD COLUMN folder_id VARCHAR(255) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE advertising_images ADD COLUMN file_hash CHAR(64) NULL", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE advertising_images ADD COLUMN image_size INT NULL DEFAULT 0", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "ALTER TABLE advertising_images ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP", ignoreCodes: IGNORE_DUP_COLUMN },
    { sql: "CREATE INDEX idx_advertising_folder ON advertising_images(folder_name)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_advertising_active ON advertising_images(is_active)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_advertising_sort ON advertising_images(sort_order)", ignoreCodes: IGNORE_DUP_KEY },
    { sql: "CREATE INDEX idx_advertising_file_hash ON advertising_images(file_hash)", ignoreCodes: IGNORE_DUP_KEY },
];

module.exports = {
    id: "001_baseline_schema_updates",
    name: "Baseline schema updates moved from db.js",
    async up({ query }) {
        for (const statement of statements) {
            await query(statement.sql, [], { ignoreCodes: statement.ignoreCodes });
        }
    },
};
