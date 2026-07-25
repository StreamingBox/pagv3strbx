#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const allowedAdvisories = new Set(
    process.argv
        .filter((arg) => arg.startsWith("--allow="))
        .map((arg) => arg.slice("--allow=".length))
        .filter(Boolean)
);

const auditCommand = process.platform === "win32"
    ? { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", "npm audit --json"] }
    : { command: "npm", args: ["audit", "--json"] };
const result = spawnSync(auditCommand.command, auditCommand.args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
});

if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
    process.exit(1);
}

let report;
try {
    report = JSON.parse(result.stdout || "{}");
} catch {
    process.stderr.write(result.stderr || result.stdout || "No se pudo leer npm audit.\n");
    process.exit(1);
}

const vulnerabilities = report.vulnerabilities || {};
const allowedCache = new Map();

function isAllowedVulnerability(name, visiting = new Set()) {
    if (allowedCache.has(name)) return allowedCache.get(name);
    if (visiting.has(name)) return false;

    const vulnerability = vulnerabilities[name];
    if (!vulnerability || !Array.isArray(vulnerability.via) || vulnerability.via.length === 0) {
        return false;
    }

    const nextVisiting = new Set(visiting);
    nextVisiting.add(name);
    const allowed = vulnerability.via.every((source) => {
        if (typeof source === "string") {
            return isAllowedVulnerability(source, nextVisiting);
        }
        return Boolean(source?.url && allowedAdvisories.has(source.url));
    });
    allowedCache.set(name, allowed);
    return allowed;
}

const blocking = Object.entries(vulnerabilities).filter(([name, vulnerability]) => {
    if (!["high", "critical"].includes(vulnerability?.severity)) return false;
    return !isAllowedVulnerability(name);
});

if (blocking.length > 0) {
    process.stderr.write(result.stdout || result.stderr || "npm audit encontro vulnerabilidades bloqueantes.\n");
    process.exit(1);
}

const accepted = Object.keys(vulnerabilities).filter((name) => isAllowedVulnerability(name));
if (accepted.length > 0) {
    console.log(`npm audit: excepcion documentada aceptada para ${accepted.join(", ")}.`);
}
console.log("npm audit: no hay vulnerabilidades altas o criticas bloqueantes.");
