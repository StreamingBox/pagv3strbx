const isWin = process.platform === "win32";

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
                DB_HOST: "srv1845.hstgr.io",
                DB_USER: "u727938325_adminpagv2strb",
                DB_PASS: "3*O1iWImas52",
                DB_NAME: "u727938325_pagv2strbx",
                CODES_SERVICE_URL: "http://localhost:8001",
                PORT: "8000"
            },
        },
        {
            name: "go-codes-service",
            script: isWin ? "codes.exe" : "./codes",
            cwd: "./go-backend/codes-service",
            watch: false,
            env: {
                DB_HOST: "srv1845.hstgr.io",
                DB_USER: "u727938325_adminpagv2strb",
                DB_PASS: "3*O1iWImas52",
                DB_NAME: "u727938325_pagv2strbx",
                GMAIL_EMAIL: "cuentastrbx@gmail.com",
                GMAIL_IMAP_PASS: "stoe ohci bwmj efzz",
                PORT: "8001"
            },
        },
        {
            name: "go-store-service",
            script: isWin ? "store.exe" : "./store",
            cwd: "./go-backend/store-service",
            watch: false,
            env: {
                DB_HOST: "srv1845.hstgr.io",
                DB_USER: "u727938325_adminpagv2strb",
                DB_PASS: "3*O1iWImas52",
                DB_NAME: "u727938325_pagv2strbx",
                PORT: "8002"
            },
        },
    ],
};
