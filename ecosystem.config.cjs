const isWin = process.platform === "win32";

/**
 * PM2: no commitear secretos. Usa variables de entorno o `pm2 start ecosystem.config.cjs --env production`
 * y define DB_* en el servidor o en un archivo `.env` cargado antes de `pm2 start`.
 */
module.exports = {
    apps: [
        {
            name: "node-backend",
            script: "src/index.js",
            cwd: "./backend",
            watch: false,
            env: {
                NODE_ENV: "development",
            },
            env_production: {
                NODE_ENV: "production",
            }
        },
        {
            name: "react-frontend",
            script: "node_modules/vite/bin/vite.js",
            cwd: "./frontend",
            watch: false,
            env: {
                NODE_ENV: "development",
            },
            env_production: {
                NODE_ENV: "production",
            }
        },
        {
            name: "go-api-gateway",
            script: isWin ? "api-gateway.exe" : "./api-gateway",
            cwd: "./go-backend/api-gateway",
            watch: false,
            env: {
                DB_HOST: process.env.DB_HOST || "",
                DB_USER: process.env.DB_USER || "",
                DB_PASS: process.env.DB_PASS || "",
                DB_NAME: process.env.DB_NAME || "",
                CODES_SERVICE_URL: process.env.CODES_SERVICE_URL || "http://localhost:8001",
                PORT: process.env.GATEWAY_PORT || "8000"
            },
        },
        {
            name: "go-codes-service",
            script: isWin ? "codes.exe" : "./codes",
            cwd: "./go-backend/codes-service",
            watch: false,
            env: {
                DB_HOST: process.env.DB_HOST || "",
                DB_USER: process.env.DB_USER || "",
                DB_PASS: process.env.DB_PASS || "",
                DB_NAME: process.env.DB_NAME || "",
                GMAIL_EMAIL: process.env.GMAIL_EMAIL || "",
                GMAIL_IMAP_PASS: process.env.GMAIL_IMAP_PASS || "",
                PORT: process.env.CODES_PORT || "8001"
            },
        },
        {
            name: "go-store-service",
            script: isWin ? "store.exe" : "./store",
            cwd: "./go-backend/store-service",
            watch: false,
            env: {
                DB_HOST: process.env.DB_HOST || "",
                DB_USER: process.env.DB_USER || "",
                DB_PASS: process.env.DB_PASS || "",
                DB_NAME: process.env.DB_NAME || "",
                PORT: process.env.STORE_PORT || "8002"
            },
        },
    ],
};
