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

module.exports = pool;
