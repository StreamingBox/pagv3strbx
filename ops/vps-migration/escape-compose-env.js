#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function createComposeEnvironment(source, destination) {
    const input = path.resolve(source);
    const output = path.resolve(destination);
    if (input === output) throw new Error("source and destination must differ");

    const contents = fs.readFileSync(input, "utf8");
    fs.writeFileSync(output, contents.replace(/\$/g, () => "$$"), { flag: "wx", mode: 0o600 });
    fs.chmodSync(output, 0o600);
}

if (require.main === module) {
    const [source, destination] = process.argv.slice(2);
    if (!source || !destination) {
        console.error("Usage: escape-compose-env.js <source-env> <destination-env>");
        process.exitCode = 2;
    } else {
        try {
            createComposeEnvironment(source, destination);
        } catch {
            console.error("Could not create Compose-safe environment file; existing files are preserved.");
            process.exitCode = 1;
        }
    }
}

module.exports = { createComposeEnvironment };
