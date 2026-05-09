const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_POOL_LIMIT || "2", 10),
    maxIdle: parseInt(process.env.DB_POOL_MAX_IDLE || "2", 10),
    idleTimeout: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || "600000", 10),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: 10000,      // 10s para establecer conexión
    // Ensure timestamps from DB are parsed as UTC so our manual UTC-5
    // offset in SQL queries (DATE_SUB 5 HOUR) works correctly.
    timezone: '+00:00',
});

// Ejecutar parche para la tabla automáticamente (convierte ENUM a VARCHAR y repara los registros en blanco)
pool.query('ALTER TABLE wallet_transactions MODIFY COLUMN type VARCHAR(50) NOT NULL;').catch(() => { });
pool.query('UPDATE wallet_transactions SET type="invest_adj" WHERE reference_type="admin_invest_adj" AND type=""').catch(() => { });
pool.query('UPDATE wallet_transactions SET type="profit_adj" WHERE reference_type="admin_profit_adj" AND type=""').catch(() => { });

// Migraciones automáticas para nuevas columnas (ignoran error si ya existe)
pool.query('ALTER TABLE subscriptions ADD COLUMN whatsapp_phone VARCHAR(50) DEFAULT NULL').catch(() => { });
pool.query('ALTER TABLE subscriptions ADD COLUMN reminder_sent TINYINT(1) DEFAULT 0').catch(() => { });
pool.query('ALTER TABLE users ADD COLUMN whatsapp VARCHAR(50) DEFAULT NULL').catch(() => { });
pool.query("ALTER TABLE platforms ADD COLUMN is_promo TINYINT(1) NOT NULL DEFAULT 0").catch(() => { });
pool.query("ALTER TABLE platforms ADD COLUMN promo_color VARCHAR(24) NULL DEFAULT NULL").catch(() => { });

pool.query(`
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
`).catch(() => { });

pool.query("ALTER TABLE password_reset_tokens ADD COLUMN used_at DATETIME NULL DEFAULT NULL").catch(() => { });
pool.query("ALTER TABLE password_reset_tokens ADD COLUMN requested_ip VARCHAR(64) NULL DEFAULT NULL").catch(() => { });
pool.query("CREATE UNIQUE INDEX uq_password_reset_token_hash ON password_reset_tokens(token_hash)").catch(() => { });
pool.query("CREATE INDEX idx_password_reset_user_created ON password_reset_tokens(user_id, created_at)").catch(() => { });
pool.query("CREATE INDEX idx_password_reset_expires ON password_reset_tokens(expires_at)").catch(() => { });

pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_queue (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
        source VARCHAR(32) NOT NULL DEFAULT 'queue',
        created_by_user_id INT NULL,
        created_by_role VARCHAR(32) NULL,
        wasender_msg_id VARCHAR(128) NULL,
        wa_status_code INT NULL,
        wa_status_label VARCHAR(32) NULL,
        wa_event VARCHAR(64) NULL,
        provider_response_json LONGTEXT NULL,
        attempts INT NOT NULL DEFAULT 0,
        error_message TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_whatsapp_queue_created_at (created_at),
        INDEX idx_whatsapp_queue_status (status),
        INDEX idx_whatsapp_queue_wasender_msg_id (wasender_msg_id)
    )
`).catch(() => { });

// Migraciones no destructivas para instalaciones existentes
pool.query("ALTER TABLE whatsapp_queue ADD COLUMN source VARCHAR(32) NOT NULL DEFAULT 'queue'").catch(() => { });
pool.query("ALTER TABLE whatsapp_queue ADD COLUMN created_by_user_id INT NULL").catch(() => { });
pool.query("ALTER TABLE whatsapp_queue ADD COLUMN created_by_role VARCHAR(32) NULL").catch(() => { });
pool.query("ALTER TABLE whatsapp_queue ADD COLUMN wasender_msg_id VARCHAR(128) NULL").catch(() => { });
pool.query("ALTER TABLE whatsapp_queue ADD COLUMN wa_status_code INT NULL").catch(() => { });
pool.query("ALTER TABLE whatsapp_queue ADD COLUMN wa_status_label VARCHAR(32) NULL").catch(() => { });
pool.query("ALTER TABLE whatsapp_queue ADD COLUMN wa_event VARCHAR(64) NULL").catch(() => { });
pool.query("ALTER TABLE whatsapp_queue ADD COLUMN provider_response_json LONGTEXT NULL").catch(() => { });
pool.query("ALTER TABLE whatsapp_queue ADD COLUMN attempts INT NOT NULL DEFAULT 0").catch(() => { });
pool.query("ALTER TABLE whatsapp_queue ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP").catch(() => { });
pool.query("CREATE INDEX idx_whatsapp_queue_created_at ON whatsapp_queue(created_at)").catch(() => { });
pool.query("CREATE INDEX idx_whatsapp_queue_status ON whatsapp_queue(status)").catch(() => { });
pool.query("CREATE INDEX idx_whatsapp_queue_wasender_msg_id ON whatsapp_queue(wasender_msg_id)").catch(() => { });

// Notificaciones de stock
pool.query(`
    CREATE TABLE IF NOT EXISTS stock_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        platform_price_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_notified BOOLEAN DEFAULT FALSE,
        UNIQUE KEY unique_subs (user_id, platform_price_id)
    )
`)
    .catch(() => { });

// Notificaciones internas de usuario
pool.query(`
    CREATE TABLE IF NOT EXISTS user_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_unread (user_id, is_read)
    )
`).catch(() => { });

// Optimizaciones de Base de datos automáticas (Ignoran el error si ya existen o la tabla aún no existe al completo)
pool.query("CREATE INDEX idx_orders_user_created ON orders(user_id, created_at)").catch(() => { });
pool.query("CREATE INDEX idx_orders_created ON orders(created_at)").catch(() => { });
pool.query("CREATE INDEX idx_order_items_order_platform ON order_items(order_id, platform_id)").catch(() => { });
pool.query("CREATE INDEX idx_whatsapp_queue_status_time ON whatsapp_queue(wa_status_label, created_at)").catch(() => { });
pool.query("ALTER TABLE platform_accounts ADD COLUMN parent_account_cost_total DECIMAL(12,2) NULL").catch(() => { });
pool.query("ALTER TABLE platform_accounts ADD COLUMN parent_profiles_total INT NULL").catch(() => { });
pool.query("ALTER TABLE platform_accounts ADD COLUMN unit_cost DECIMAL(12,2) NULL").catch(() => { });
pool.query("ALTER TABLE platform_accounts MODIFY COLUMN access_url TEXT NULL").catch(() => { });
pool.query("CREATE INDEX idx_platform_accounts_unit_cost ON platform_accounts(unit_cost)").catch(() => { });
pool.query("ALTER TABLE order_items ADD COLUMN cost_amount DECIMAL(12,2) NULL").catch(() => { });
pool.query("ALTER TABLE order_items ADD COLUMN profit_amount DECIMAL(12,2) NULL").catch(() => { });
pool.query("ALTER TABLE order_items ADD COLUMN combo_id INT NULL").catch(() => { });
pool.query("ALTER TABLE order_items ADD COLUMN combo_name VARCHAR(160) NULL").catch(() => { });
pool.query("CREATE INDEX idx_order_items_subscription_id ON order_items(subscription_id)").catch(() => { });
pool.query("CREATE INDEX idx_order_items_combo_id ON order_items(combo_id)").catch(() => { });

pool.query(`
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
`).catch(() => { });
pool.query(`
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
`).catch(() => { });
pool.query(`
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
`).catch(() => { });
pool.query("ALTER TABLE combos ADD COLUMN description TEXT NULL").catch(() => { });
pool.query("ALTER TABLE combos ADD COLUMN badge VARCHAR(80) NULL").catch(() => { });
pool.query("ALTER TABLE combos ADD COLUMN sort_order INT NOT NULL DEFAULT 0").catch(() => { });
pool.query("ALTER TABLE combos ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP").catch(() => { });
pool.query("ALTER TABLE combo_items ADD COLUMN quantity INT NOT NULL DEFAULT 1").catch(() => { });
pool.query("ALTER TABLE combo_items ADD COLUMN sort_order INT NOT NULL DEFAULT 0").catch(() => { });
pool.query("ALTER TABLE combo_prices ADD COLUMN compare_at_price DECIMAL(12,2) NULL").catch(() => { });
pool.query("ALTER TABLE combo_prices ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1").catch(() => { });

pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_webhook_dedupe (
        event_key VARCHAR(191) PRIMARY KEY,
        msg_id VARCHAR(128) NULL,
        fingerprint VARCHAR(191) NULL,
        event_name VARCHAR(64) NULL,
        phone VARCHAR(50) NULL,
        message_preview VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        INDEX idx_whatsapp_webhook_expires (expires_at),
        INDEX idx_whatsapp_webhook_msg_id (msg_id)
    )
`).catch(() => { });
pool.query("ALTER TABLE whatsapp_webhook_dedupe ADD COLUMN msg_id VARCHAR(128) NULL").catch(() => { });
pool.query("ALTER TABLE whatsapp_webhook_dedupe ADD COLUMN fingerprint VARCHAR(191) NULL").catch(() => { });
pool.query("ALTER TABLE whatsapp_webhook_dedupe ADD COLUMN event_name VARCHAR(64) NULL").catch(() => { });
pool.query("ALTER TABLE whatsapp_webhook_dedupe ADD COLUMN phone VARCHAR(50) NULL").catch(() => { });
pool.query("ALTER TABLE whatsapp_webhook_dedupe ADD COLUMN message_preview VARCHAR(255) NULL").catch(() => { });
pool.query("ALTER TABLE whatsapp_webhook_dedupe ADD COLUMN expires_at DATETIME NOT NULL").catch(() => { });
pool.query("CREATE INDEX idx_whatsapp_webhook_expires ON whatsapp_webhook_dedupe(expires_at)").catch(() => { });
pool.query("CREATE INDEX idx_whatsapp_webhook_msg_id ON whatsapp_webhook_dedupe(msg_id)").catch(() => { });

pool.query(`
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
`).catch(() => { });
pool.query("ALTER TABLE account_replacement_logs ADD COLUMN order_id INT NULL").catch(() => { });
pool.query("ALTER TABLE account_replacement_logs ADD COLUMN order_code VARCHAR(64) NULL").catch(() => { });
pool.query("ALTER TABLE account_replacement_logs ADD COLUMN user_id INT NULL").catch(() => { });
pool.query("ALTER TABLE account_replacement_logs ADD COLUMN admin_user_id INT NULL").catch(() => { });
pool.query("ALTER TABLE account_replacement_logs ADD COLUMN platform_id INT NULL").catch(() => { });
pool.query("ALTER TABLE account_replacement_logs ADD COLUMN old_account_email VARCHAR(191) NULL").catch(() => { });
pool.query("ALTER TABLE account_replacement_logs ADD COLUMN new_account_email VARCHAR(191) NULL").catch(() => { });
pool.query("ALTER TABLE account_replacement_logs ADD COLUMN previous_expires_at DATETIME NULL").catch(() => { });
pool.query("CREATE INDEX idx_replacement_logs_created ON account_replacement_logs(created_at)").catch(() => { });
pool.query("CREATE INDEX idx_replacement_logs_subscription ON account_replacement_logs(subscription_id)").catch(() => { });
pool.query("CREATE INDEX idx_replacement_logs_order ON account_replacement_logs(order_id)").catch(() => { });
pool.query("CREATE INDEX idx_replacement_logs_platform ON account_replacement_logs(platform_id)").catch(() => { });

// ──────────────────────────────────────────────────────────────
// Tabla de logs de carga de cuentas (manual y masiva)
// ──────────────────────────────────────────────────────────────
pool.query(`
    CREATE TABLE IF NOT EXISTS account_upload_logs (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        type        ENUM('manual','bulk') NOT NULL DEFAULT 'manual',
        admin_id    INT NULL,
        admin_email VARCHAR(120) NULL,
        platform_id INT NULL,
        platform_name VARCHAR(100) NULL,
        total_rows  INT NOT NULL DEFAULT 1,
        inserted    INT NOT NULL DEFAULT 0,
        skipped     INT NOT NULL DEFAULT 0,
        errors      INT NOT NULL DEFAULT 0,
        source_filename VARCHAR(255) NULL,
        notes       TEXT NULL,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_upload_logs_created (created_at),
        INDEX idx_upload_logs_type (type),
        INDEX idx_upload_logs_admin (admin_id)
    )
`).catch(() => { });

pool.query(`
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
`).catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN previous_order_id INT NULL").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN previous_order_code VARCHAR(64) NULL").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN renewal_order_id INT NOT NULL").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN renewal_order_code VARCHAR(64) NOT NULL").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN user_id INT NOT NULL").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN actor_user_id INT NOT NULL").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN actor_role VARCHAR(32) NOT NULL").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN platform_id INT NULL").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN platform_price_id INT NULL").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN previous_account_id INT NULL").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN new_account_id INT NULL").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN previous_expires_at DATETIME NULL").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN new_expires_at DATETIME NOT NULL").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN amount_charged DECIMAL(12,2) NOT NULL DEFAULT 0").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'COP'").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN deduct_wallet TINYINT(1) NOT NULL DEFAULT 1").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN wallet_id INT NULL").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN balance_before DECIMAL(12,2) NULL").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN balance_after DECIMAL(12,2) NULL").catch(() => { });
pool.query("ALTER TABLE subscription_renewal_logs ADD COLUMN note TEXT NULL").catch(() => { });
pool.query("CREATE INDEX idx_renewal_logs_created ON subscription_renewal_logs(created_at)").catch(() => { });
pool.query("CREATE INDEX idx_renewal_logs_subscription ON subscription_renewal_logs(subscription_id)").catch(() => { });
pool.query("CREATE INDEX idx_renewal_logs_user ON subscription_renewal_logs(user_id)").catch(() => { });
pool.query("CREATE INDEX idx_renewal_logs_actor ON subscription_renewal_logs(actor_user_id)").catch(() => { });
pool.query("CREATE INDEX idx_renewal_logs_platform ON subscription_renewal_logs(platform_id)").catch(() => { });
pool.query("CREATE INDEX idx_renewal_logs_order ON subscription_renewal_logs(renewal_order_id)").catch(() => { });

pool.query(`
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
`).catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN request_code VARCHAR(32) NOT NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN wallet_id INT NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN method_key VARCHAR(32) NOT NULL DEFAULT 'binance'").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN method_label VARCHAR(64) NOT NULL DEFAULT 'Binance'").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN amount DECIMAL(12,2) NOT NULL DEFAULT 0").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'USD'").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN proof_file_url VARCHAR(255) NOT NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'submitted'").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN submitted_email_sent_at DATETIME NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN reviewing_email_sent_at DATETIME NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN approved_email_sent_at DATETIME NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN rejected_email_sent_at DATETIME NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN admin_user_id INT NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN admin_note TEXT NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN balance_before DECIMAL(12,2) NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN balance_after DECIMAL(12,2) NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN approved_at DATETIME NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN rejected_at DATETIME NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN reviewing_at DATETIME NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN payer_name VARCHAR(160) NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN declared_paid_at DATETIME NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN auto_validation_status VARCHAR(32) NOT NULL DEFAULT 'pending'").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN auto_validation_note TEXT NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN last_auto_checked_at DATETIME NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN matched_email_uid VARCHAR(255) NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN matched_email_subject VARCHAR(255) NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN matched_sender_name VARCHAR(255) NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN matched_email_amount DECIMAL(12,2) NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_requests ADD COLUMN matched_email_received_at DATETIME NULL").catch(() => { });
pool.query("CREATE UNIQUE INDEX uq_manual_topup_request_code ON manual_topup_requests(request_code)").catch(() => { });
pool.query("CREATE INDEX idx_manual_topup_user ON manual_topup_requests(user_id)").catch(() => { });
pool.query("CREATE INDEX idx_manual_topup_status ON manual_topup_requests(status)").catch(() => { });
pool.query("CREATE INDEX idx_manual_topup_created ON manual_topup_requests(created_at)").catch(() => { });

pool.query(`
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
`).catch(() => { });
pool.query("ALTER TABLE manual_topup_proof_tokens ADD COLUMN token VARCHAR(64) NOT NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_proof_tokens ADD COLUMN topup_id INT NOT NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_proof_tokens ADD COLUMN proof_file_url VARCHAR(255) NOT NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_proof_tokens ADD COLUMN created_by_user_id INT NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_proof_tokens ADD COLUMN created_by_role VARCHAR(32) NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_proof_tokens ADD COLUMN opened_at DATETIME NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_proof_tokens ADD COLUMN revoked_at DATETIME NULL").catch(() => { });
pool.query("ALTER TABLE manual_topup_proof_tokens ADD COLUMN expires_at DATETIME NOT NULL").catch(() => { });
pool.query("CREATE UNIQUE INDEX uq_manual_topup_proof_token ON manual_topup_proof_tokens(token)").catch(() => { });
pool.query("CREATE INDEX idx_manual_topup_proof_topup ON manual_topup_proof_tokens(topup_id)").catch(() => { });
pool.query("CREATE INDEX idx_manual_topup_proof_expires ON manual_topup_proof_tokens(expires_at)").catch(() => { });

// ──────────────────────────────────────────────────────────────
// Tabla de publicidad / advertising (Google Drive)
// ──────────────────────────────────────────────────────────────
pool.query(`
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
`).catch(() => { });
pool.query("ALTER TABLE advertising_folders ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1").catch(() => { });
pool.query("ALTER TABLE advertising_folders ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP").catch(() => { });
pool.query("CREATE UNIQUE INDEX uq_advertising_folder_id ON advertising_folders(folder_id)").catch(() => { });
pool.query("CREATE INDEX idx_advertising_folder_active ON advertising_folders(is_active)").catch(() => { });

pool.query(`
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
`).catch(() => { });
pool.query("ALTER TABLE advertising_images ADD COLUMN folder_id VARCHAR(255) NULL").catch(() => { });
pool.query("ALTER TABLE advertising_images ADD COLUMN file_hash CHAR(64) NULL").catch(() => { });
pool.query("ALTER TABLE advertising_images ADD COLUMN image_size INT NULL DEFAULT 0").catch(() => { });
pool.query("ALTER TABLE advertising_images ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP").catch(() => { });
pool.query("CREATE INDEX idx_advertising_folder ON advertising_images(folder_name)").catch(() => { });
pool.query("CREATE INDEX idx_advertising_active ON advertising_images(is_active)").catch(() => { });
pool.query("CREATE INDEX idx_advertising_sort ON advertising_images(sort_order)").catch(() => { });
pool.query("CREATE INDEX idx_advertising_file_hash ON advertising_images(file_hash)").catch(() => { });

module.exports = pool;
