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
    connectTimeout: 10000,
    // Ensure timestamps from DB are parsed as UTC so our manual UTC-5
    // offset in SQL queries (DATE_SUB 5 HOUR) works correctly.
    timezone: "+00:00",
});

module.exports = pool;
