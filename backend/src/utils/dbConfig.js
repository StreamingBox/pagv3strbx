function buildDbConfig(env = process.env) {
    return {
        host: env.DB_HOST,
        user: env.DB_USER,
        password: env.DB_PASS,
        database: env.DB_NAME,
        waitForConnections: true,
        connectionLimit: parseInt(env.DB_POOL_LIMIT || "2", 10),
        maxIdle: parseInt(env.DB_POOL_MAX_IDLE || "2", 10),
        idleTimeout: parseInt(env.DB_POOL_IDLE_TIMEOUT_MS || "600000", 10),
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        connectTimeout: 10000,
        timezone: "+00:00",
        // MySQL DATE values are calendar days, not instants in time. Keeping
        // them as strings prevents clients in UTC-5 from displaying day - 1.
        dateStrings: ["DATE"],
    };
}

module.exports = { buildDbConfig };
