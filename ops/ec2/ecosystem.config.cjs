const path = require("node:path");

module.exports = {
    apps: [{
        name: process.env.PM2_APP || "pagev3-api",
        cwd: path.resolve(__dirname, "../../backend"),
        script: "src/index.js",
        exec_mode: "fork",
        instances: 1,
        watch: false,
        exp_backoff_restart_delay: 1000,
        min_uptime: 60000,
        max_restarts: 10,
        env: { NODE_ENV: "production" },
    }],
};
