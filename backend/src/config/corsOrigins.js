const PRODUCTION_ORIGINS = [
    "https://strbx.com.co",
    "https://www.strbx.com.co",
    "https://crm.strbx.com.co",
];

const DEVELOPMENT_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
];

const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function createAllowedOrigins({ nodeEnv = process.env.NODE_ENV, extraOrigins = process.env.CORS_EXTRA_ORIGINS } = {}) {
    const allowedOrigins = new Set(PRODUCTION_ORIGINS);

    if (nodeEnv !== "production") {
        for (const origin of DEVELOPMENT_ORIGINS) allowedOrigins.add(origin);
    }

    if (extraOrigins) {
        for (const raw of String(extraOrigins).split(/[,;\s]+/)) {
            const origin = raw.trim().replace(/\/+$/, "");
            if (origin) allowedOrigins.add(origin);
        }
    }

    return allowedOrigins;
}

function isLocalDevOrigin(origin) {
    return LOCAL_DEV_ORIGIN.test(String(origin || ""));
}

function createCorsOptions({ allowedOrigins, allowLocalDev = false } = {}) {
    return {
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (allowedOrigins?.has(origin) || (allowLocalDev && isLocalDevOrigin(origin))) {
                return callback(null, true);
            }
            return callback(new Error(`CORS blocked: ${origin}`));
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    };
}

module.exports = { createAllowedOrigins, createCorsOptions, isLocalDevOrigin };
