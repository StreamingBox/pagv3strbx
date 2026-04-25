const fs = require("fs");
const path = require("path");

const isWin = process.platform === "win32";

function loadRootEnv() {
    const envPath = path.join(__dirname, ".env");
    if (!fs.existsSync(envPath)) return;

    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match || process.env[match[1]] !== undefined) continue;
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
}

loadRootEnv();

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
                GO_ENV: process.env.GO_ENV || "development",
                DB_HOST: process.env.DB_HOST || "",
                DB_USER: process.env.DB_USER || "",
                DB_PASS: process.env.DB_PASS || "",
                DB_NAME: process.env.DB_NAME || "",
                CODES_SERVICE_URL: process.env.CODES_SERVICE_URL || "http://localhost:8001",
                STORE_SERVICE_URL: process.env.STORE_SERVICE_URL || "http://localhost:8002",
                INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN || "",
                PORT: process.env.GATEWAY_PORT || "8000"
            },
            env_production: {
                GO_ENV: "production",
                CODES_SERVICE_URL: process.env.CODES_SERVICE_URL || "http://127.0.0.1:8001",
                STORE_SERVICE_URL: process.env.STORE_SERVICE_URL || "http://127.0.0.1:8002",
                INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN || "",
                PORT: process.env.GATEWAY_PORT || "8000"
            }
        },
        {
            name: "go-codes-service",
            script: isWin ? "codes.exe" : "./codes",
            cwd: "./go-backend/codes-service",
            watch: false,
            env: {
                GO_ENV: process.env.GO_ENV || "development",
                DB_HOST: process.env.DB_HOST || "",
                DB_USER: process.env.DB_USER || "",
                DB_PASS: process.env.DB_PASS || "",
                DB_NAME: process.env.DB_NAME || "",
                GMAIL_EMAIL: process.env.GMAIL_EMAIL || "",
                GMAIL_IMAP_PASS: process.env.GMAIL_IMAP_PASS || "",
                INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN || "",
                GO_SERVICE_BIND_ADDR: process.env.GO_SERVICE_BIND_ADDR || "127.0.0.1",
                PORT: process.env.CODES_PORT || "8001"
            },
            env_production: {
                GO_ENV: "production",
                INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN || "",
                GO_SERVICE_BIND_ADDR: process.env.GO_SERVICE_BIND_ADDR || "127.0.0.1",
                PORT: process.env.CODES_PORT || "8001"
            }
        },
        {
            name: "go-store-service",
            script: isWin ? "store.exe" : "./store",
            cwd: "./go-backend/store-service",
            watch: false,
            env: {
                GO_ENV: process.env.GO_ENV || "development",
                DB_HOST: process.env.DB_HOST || "",
                DB_USER: process.env.DB_USER || "",
                DB_PASS: process.env.DB_PASS || "",
                DB_NAME: process.env.DB_NAME || "",
                INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN || "",
                GO_SERVICE_BIND_ADDR: process.env.GO_SERVICE_BIND_ADDR || "127.0.0.1",
                PORT: process.env.STORE_PORT || "8002"
            },
            env_production: {
                GO_ENV: "production",
                INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN || "",
                GO_SERVICE_BIND_ADDR: process.env.GO_SERVICE_BIND_ADDR || "127.0.0.1",
                PORT: process.env.STORE_PORT || "8002"
            }
        },
    ],
};
