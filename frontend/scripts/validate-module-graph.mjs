import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { init, parse } from "es-module-lexer";

const RELEASE_ORIGIN = "https://release.invalid";
const ROOT_MOUNT = /\bcreateRoot\s*\(\s*document\.getElementById\s*\(\s*["']root["']\s*\)/;

export async function validateModuleGraph(directory, entryPath) {
    await init;
    const root = fs.realpathSync(directory);
    const entry = new URL(entryPath, RELEASE_ORIGIN);
    const visited = new Set();
    const bootstrapModules = [];
    const pending = [entry];

    while (pending.length) {
        const url = pending.pop();
        const key = `${url.pathname}${url.search}`;
        if (visited.has(key)) continue;
        visited.add(key);
        const filename = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
        const relative = path.relative(root, filename);
        if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
            throw new Error(`Module escapes the release directory: ${key}`);
        }
        if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
            throw new Error(`Missing imported module: ${key}`);
        }
        const source = fs.readFileSync(filename, "utf8");
        if (ROOT_MOUNT.test(source)) bootstrapModules.push(key);
        const [imports] = parse(source, key);
        for (const dependency of imports) {
            if (!dependency.n) continue;
            if (!dependency.n.startsWith(".") && !dependency.n.startsWith("/")) {
                if (/^(?:https?:|data:|node:)/.test(dependency.n)) continue;
                throw new Error(`Unbundled module ${dependency.n} imported by ${key}`);
            }
            const target = new URL(dependency.n, url);
            if (target.origin === RELEASE_ORIGIN) pending.push(target);
        }
    }

    if (bootstrapModules.length !== 1) {
        throw new Error(`Expected one application bootstrap, found ${bootstrapModules.length}: ${bootstrapModules.join(", ")}`);
    }
    return { entry: `${entry.pathname}${entry.search}`, modules: visited.size, bootstrapModules };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [directory, entryPath] = process.argv.slice(2);
    if (!directory || !entryPath) throw new Error("Usage: node validate-module-graph.mjs <release-directory> <entry-path>");
    console.log(JSON.stringify(await validateModuleGraph(directory, entryPath)));
}
