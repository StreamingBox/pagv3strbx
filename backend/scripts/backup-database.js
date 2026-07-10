#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), override: false });

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createGzip } = require("node:zlib");

const output = process.argv[2];
if (!output) {
    console.error("Usage: node backup-database.js /absolute/path/database.sql.gz");
    process.exit(2);
}

const required = ["DB_HOST", "DB_USER", "DB_NAME"];
const missing = required.filter((key) => !String(process.env[key] || "").trim());
if (missing.length) {
    console.error(`Missing database configuration: ${missing.join(", ")}`);
    process.exit(2);
}

fs.mkdirSync(path.dirname(output), { recursive: true });
const args = [
    "--single-transaction",
    "--quick",
    "--skip-lock-tables",
    "-h", process.env.DB_HOST,
    "-u", process.env.DB_USER,
];
if (process.env.DB_PORT) args.push("-P", String(process.env.DB_PORT));
args.push(process.env.DB_NAME);

const dump = spawn("mysqldump", args, {
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASS || "" },
    stdio: ["ignore", "pipe", "pipe"],
});
const outputFile = fs.createWriteStream(output, { mode: 0o600 });
const gzip = createGzip({ level: 9 });
let stderr = "";

dump.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
});
dump.stdout.pipe(gzip).pipe(outputFile);

Promise.all([
    new Promise((resolve, reject) => dump.once("error", reject).once("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `mysqldump exited with ${code}`));
    })),
    new Promise((resolve, reject) => outputFile.once("finish", resolve).once("error", reject)),
]).then(() => {
    console.log(`Database backup created: ${output}`);
}).catch((error) => {
    try { fs.unlinkSync(output); } catch { /* no partial backup left behind */ }
    console.error(`Database backup failed: ${error.message}`);
    process.exitCode = 1;
});
