#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), override: false });

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pipeline } = require("node:stream/promises");
const { createGzip } = require("node:zlib");

function resolveExecutable(command) {
    if (path.isAbsolute(command) || command.includes(path.sep)) {
        try {
            fs.accessSync(command, process.platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK);
            return command;
        } catch {
            return null;
        }
    }

    const extensions = process.platform === "win32"
        ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";")
        : [""];
    for (const directory of (process.env.PATH || "").split(path.delimiter)) {
        for (const extension of extensions) {
            const candidate = path.join(directory, `${command}${extension}`);
            try {
                fs.accessSync(candidate, process.platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK);
                return candidate;
            } catch {
                // Continue through PATH until a usable dump client is found.
            }
        }
    }
    return null;
}

const output = process.argv[2];
if (!output) {
    console.error("Usage: node backup-database.js /absolute/path/database.sql.gz|- (stdout)");
    process.exit(2);
}

const required = ["DB_HOST", "DB_USER", "DB_NAME"];
const missing = required.filter((key) => !String(process.env[key] || "").trim());
if (missing.length) {
    console.error(`Missing database configuration: ${missing.join(", ")}`);
    process.exit(2);
}

const dumpCandidates = process.env.MYSQLDUMP_BIN
    ? [process.env.MYSQLDUMP_BIN]
    : ["mysqldump", "mariadb-dump"];
const dumpBinary = dumpCandidates.map(resolveExecutable).find(Boolean);
if (!dumpBinary) {
    console.error(`No mysqldump-compatible client found. Tried: ${dumpCandidates.join(", ")}`);
    process.exit(127);
}

const streamToStdout = output === "-";
if (!streamToStdout) fs.mkdirSync(path.dirname(output), { recursive: true });
const args = [
    "--single-transaction",
    "--quick",
    "--skip-lock-tables",
    "-h", process.env.DB_HOST,
    "-u", process.env.DB_USER,
];
if (process.env.DB_PORT) args.push("-P", String(process.env.DB_PORT));
args.push(process.env.DB_NAME);

const dump = spawn(dumpBinary, args, {
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASS || "" },
    stdio: ["ignore", "pipe", "pipe"],
});
const outputStream = streamToStdout
    ? process.stdout
    : fs.createWriteStream(output, { mode: 0o600 });
const gzip = createGzip({ level: 9 });
let stderr = "";

dump.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
});

Promise.all([
    new Promise((resolve, reject) => dump.once("error", reject).once("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `mysqldump exited with ${code}`));
    })),
    pipeline(dump.stdout, gzip, outputStream),
]).then(() => {
    const message = `Database backup completed: ${output}`;
    if (streamToStdout) console.error(message);
    else console.log(message);
}).catch((error) => {
    if (!streamToStdout) {
        try { fs.unlinkSync(output); } catch { /* no partial backup left behind */ }
    }
    console.error(`Database backup failed: ${error.message}`);
    process.exitCode = 1;
});
