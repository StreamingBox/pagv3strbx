const fs = require("fs");
const path = require("path");

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
    ],
};
