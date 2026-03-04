const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_POOL_LIMIT || "10", 10),
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

module.exports = pool;
