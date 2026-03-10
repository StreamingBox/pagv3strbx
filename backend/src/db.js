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

module.exports = pool;
