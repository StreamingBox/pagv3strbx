module.exports = {
    apps: [
        {
            name: "node-backend",
            script: "npm",
            args: "run dev:backend",
            cwd: "./",
            watch: false,
            env: {
                NODE_ENV: "development",
            },
        },
        {
            name: "react-frontend",
            script: "npm",
            args: "run dev:frontend",
            cwd: "./",
            watch: false,
            env: {
                NODE_ENV: "development",
            },
        },
        {
            name: "go-api-gateway",
            script: "api-gateway.exe",
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
            script: "codes.exe",
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
            script: "store.exe",
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
