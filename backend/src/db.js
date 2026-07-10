const dns = require("node:dns");
const mysql = require("mysql2/promise");
const { buildDbConfig } = require("./utils/dbConfig");

dns.setDefaultResultOrder(process.env.DB_DNS_RESULT_ORDER || "ipv4first");

const pool = mysql.createPool(buildDbConfig());

const originalGetConnection = pool.getConnection.bind(pool);
const originalQuery = pool.query.bind(pool);
const strictSqlModeEnabled = String(
    process.env.DB_STRICT_SQL_MODE ?? (process.env.NODE_ENV === "production" ? "true" : "false")
).toLowerCase() !== "false";

function isTransientDatabaseError(error) {
    return ["ECONNRESET", "ETIMEDOUT", "PROTOCOL_CONNECTION_LOST", "ECONNREFUSED"].includes(error?.code);
}

function isReadOnlySql(sql) {
    return /^\s*(SELECT|SHOW|EXPLAIN|DESCRIBE)\b/i.test(String(sql || ""));
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function configureConnection(conn) {
    if (!strictSqlModeEnabled) return conn;
    const rawConnection = conn.connection || conn;
    if (rawConnection.__strbxStrictSqlModeConfigured) return conn;
    await conn.query(
        `SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode,
            'STRICT_TRANS_TABLES', 'ERROR_FOR_DIVISION_BY_ZERO', 'NO_ZERO_DATE', 'NO_ZERO_IN_DATE')`
    );
    rawConnection.__strbxStrictSqlModeConfigured = true;
    return conn;
}

pool.getConnection = async function getConfiguredConnection() {
    const conn = await originalGetConnection();
    try {
        return await configureConnection(conn);
    } catch (error) {
        conn.destroy();
        throw error;
    }
};

// Direct pool reads are safe to retry once after a transient network reset.
// Writes and explicit transactions stay single-attempt to avoid duplicate money movements.
pool.query = async function queryWithReadRetry(sql, params) {
    const run = async () => {
        const conn = await pool.getConnection();
        try {
            return await conn.query(sql, params);
        } finally {
            conn.release();
        }
    };
    try {
        return await run();
    } catch (error) {
        if (!isReadOnlySql(sql) || !isTransientDatabaseError(error)) throw error;
        await wait(120 + Math.floor(Math.random() * 180));
        return run();
    }
};

// Preserve a reference for diagnostics without exposing it to application code.
pool.__originalQuery = originalQuery;

module.exports = pool;
