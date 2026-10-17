#!/usr/bin/env node
require("../src/utils/backupEnvironment").loadBackupEnvironment(
    require("node:path").join(__dirname, "..", ".env")
);

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pipeline } = require("node:stream/promises");
const { createGzip } = require("node:zlib");
const { createGunzip } = require("node:zlib");
const { Writable } = require("node:stream");
const { uploadBackup } = require("../src/services/backupDrive.service");

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
if (!streamToStdout && fs.existsSync(output)) {
    console.error("Backup destination already exists; existing backup preserved.");
    process.exit(2);
}
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
    : fs.createWriteStream(output, { mode: 0o600, flags: "wx" });
const gzip = createGzip({ level: 9 });
dump.stderr.resume();

Promise.all([
    new Promise((resolve, reject) => dump.once("error", reject).once("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Database dump client exited with ${code}`));
    })),
    pipeline(dump.stdout, gzip, outputStream),
]).then(async () => {
    if (streamToStdout) { console.error("Database dump streamed; caller must verify its Drive destination."); return; }
    await pipeline(fs.createReadStream(output), createGunzip(), new Writable({ write(chunk, encoding, callback) { callback(); } }));
    const receipt = await uploadBackup(output, { kind: "database" });
    console.log(`Database backup verified in Drive: ${receipt.driveTarget}`);
}).catch((error) => {
    console.error(`Database backup failed or pending in Drive: ${error.code || "backup_generation_failed"}. Local files preserved.`);
    process.exitCode = 1;
});
