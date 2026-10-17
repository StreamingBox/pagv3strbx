import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync } from "node:zlib";
import { validateModuleGraph } from "./validate-module-graph.mjs";

export async function prepareCoherentRelease(sourceDirectory, outputDirectory, entryPath, expectedCurrentEntry) {
    const source = fs.realpathSync(sourceDirectory);
    const output = path.resolve(outputDirectory);
    const relative = path.relative(source, output);
    if (fs.existsSync(output)) throw new Error(`Output already exists: ${output}`);
    if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
        throw new Error("The output directory must be outside the active release.");
    }
    const html = fs.readFileSync(path.join(source, "index.html"), "utf8");
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]*\/assets\/index-[^"]+\.js)"/g)];
    if (scripts.length !== 1 || scripts[0][1] !== expectedCurrentEntry) {
        throw new Error("The active HTML entry differs from the reviewed release.");
    }
    const graph = await validateModuleGraph(source, entryPath);
    const nextHtml = html.replace(scripts[0][0], scripts[0][0].replace(expectedCurrentEntry, entryPath));
    fs.cpSync(source, output, { recursive: true, force: false, errorOnExist: true });
    fs.writeFileSync(path.join(output, "index.html"), nextHtml);
    if (fs.existsSync(path.join(output, "index.html.br"))) {
        fs.writeFileSync(path.join(output, "index.html.br"), brotliCompressSync(nextHtml));
    }
    return { output, previousEntry: expectedCurrentEntry, ...graph };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [source, output, entry, expectedCurrentEntry] = process.argv.slice(2);
    if (!source || !output || !entry || !expectedCurrentEntry) {
        throw new Error("Usage: node prepare-coherent-release.mjs <active-release> <new-directory> <entry> <expected-current-entry>");
    }
    console.log(JSON.stringify(await prepareCoherentRelease(source, output, entry, expectedCurrentEntry)));
}
