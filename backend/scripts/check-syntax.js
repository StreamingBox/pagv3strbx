const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const scanDirs = ["src", "scripts", "test"];
const skippedDirs = new Set(["node_modules", ".runtime", ".tmp-uploads", "coverage"]);

function collectJsFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skippedDirs.has(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectJsFiles(fullPath, files);
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
            files.push(fullPath);
        }
    }

    return files;
}

const files = scanDirs.flatMap((dir) => collectJsFiles(path.join(root, dir))).sort();
let failed = false;

for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], {
        cwd: root,
        encoding: "utf8",
    });

    if (result.status !== 0) {
        failed = true;
        process.stderr.write(result.stderr || result.stdout || `Syntax check failed: ${file}\n`);
    }
}

if (failed) process.exit(1);
console.log(`Syntax OK (${files.length} files)`);
