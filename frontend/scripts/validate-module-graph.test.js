import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { validateModuleGraph } from "./validate-module-graph.mjs";
import { prepareCoherentRelease } from "./prepare-coherent-release.mjs";

const fixtures = [];
function release(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "strbx-module-graph-test-"));
    fixtures.push(root);
    for (const [name, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
        fs.writeFileSync(path.join(root, name), content);
    }
    return root;
}
const bootstrap = 'const app = ReactDOM.createRoot(document.getElementById("root"));';
afterEach(() => fixtures.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

describe("production module graph", () => {
    it("accepts lazy routes that import the same application entry", async () => {
        const root = release({
            "entry.js": `export const context = {}; ${bootstrap} import('./route.js');`,
            "route.js": "import { context } from './entry.js'; export default context;",
        });
        await expect(validateModuleGraph(root, "/entry.js")).resolves.toMatchObject({ modules: 2, bootstrapModules: ["/entry.js"] });
    });

    it("rejects a renamed entry whose routes still bootstrap the original application", async () => {
        const root = release({
            "patched.js": `${bootstrap} import('./route.js');`,
            "original.js": `export const context = {}; ${bootstrap} import('./route.js');`,
            "route.js": "import { context } from './original.js'; export default context;",
        });
        await expect(validateModuleGraph(root, "/patched.js")).rejects.toThrow("Expected one application bootstrap, found 2");
    });

    it("rejects a missing lazy route before a release can be published", async () => {
        const root = release({ "entry.js": `${bootstrap} import('./missing.js');` });
        await expect(validateModuleGraph(root, "/entry.js")).rejects.toThrow("Missing imported module: /missing.js");
    });

    it("repairs HTML and its compressed copy while preserving every JavaScript module", async () => {
        const html = '<script type="module" src="/assets/index-patched.js"></script>';
        const original = `export const context = {}; ${bootstrap} import('./route.js');`;
        const root = release({
            "index.html": html,
            "index.html.br": brotliCompressSync(html),
            "assets/index-original.js": original,
            "assets/index-patched.js": `${bootstrap} import('./route.js');`,
            "assets/route.js": "import { context } from './index-original.js'; export default context;",
        });
        const output = `${root}-prepared`;
        fixtures.push(output);
        await prepareCoherentRelease(root, output, "/assets/index-original.js", "/assets/index-patched.js");
        const expected = html.replace("index-patched.js", "index-original.js");
        expect(fs.readFileSync(path.join(output, "index.html"), "utf8")).toBe(expected);
        expect(brotliDecompressSync(fs.readFileSync(path.join(output, "index.html.br"))).toString()).toBe(expected);
        expect(fs.readFileSync(path.join(output, "assets/index-original.js"), "utf8")).toBe(original);
        expect(fs.readFileSync(path.join(root, "index.html"), "utf8")).toBe(html);
    });
});
