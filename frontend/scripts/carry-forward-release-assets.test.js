import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { carryForwardReleaseAssets } from "./carry-forward-release-assets.mjs";

let root;

function writeAsset(directory, relativePath, contents) {
    const destination = path.join(directory, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, contents);
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "strbx-release-assets-"));
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe("release asset retention", () => {
    it("carries missing hashed chunks while preserving the new release's entry", () => {
        const source = path.join(root, "old", "assets");
        const target = path.join(root, "new", "assets");
        fs.mkdirSync(source, { recursive: true });
        fs.mkdirSync(target, { recursive: true });
        writeAsset(source, "AdminOld-Abc123.js", "old route module");
        writeAsset(source, "AdminOld-Abc123.js.br", "compressed old route module");
        writeAsset(target, "index-New456.js", "new app entry");

        const result = carryForwardReleaseAssets([source], target);

        expect(result.copied).toBe(2);
        expect(result.conflicts).toEqual([]);
        expect(fs.readFileSync(path.join(target, "index-New456.js"), "utf8")).toBe("new app entry");
        expect(fs.readFileSync(path.join(target, "AdminOld-Abc123.js"), "utf8")).toBe("old route module");
        expect(fs.readFileSync(path.join(target, "AdminOld-Abc123.js.br"), "utf8")).toBe("compressed old route module");
    });

    it("aborts before copying anything when a path is reused with different contents", () => {
        const source = path.join(root, "old", "assets");
        const target = path.join(root, "new", "assets");
        fs.mkdirSync(source, { recursive: true });
        fs.mkdirSync(target, { recursive: true });
        writeAsset(source, "OldRoute-Abc123.js", "old route");
        writeAsset(source, "Shared-Def456.js", "old shared chunk");
        writeAsset(target, "Shared-Def456.js", "new shared chunk");

        expect(() => carryForwardReleaseAssets([source], target)).toThrow(/different bytes/);
        expect(fs.existsSync(path.join(target, "OldRoute-Abc123.js"))).toBe(false);
    });

    it("keeps the target version on an audited historical collision and adds other files", () => {
        const source = path.join(root, "old", "assets");
        const target = path.join(root, "new", "assets");
        fs.mkdirSync(source, { recursive: true });
        fs.mkdirSync(target, { recursive: true });
        writeAsset(source, "OldRoute-Abc123.js", "old route");
        writeAsset(source, "Shared-Def456.js", "old shared chunk");
        writeAsset(target, "Shared-Def456.js", "current shared chunk");

        const result = carryForwardReleaseAssets([source], target, { allowConflicts: true });

        expect(result.copied).toBe(1);
        expect(result.conflicts).toEqual(["Shared-Def456.js"]);
        expect(fs.readFileSync(path.join(target, "Shared-Def456.js"), "utf8")).toBe("current shared chunk");
        expect(fs.readFileSync(path.join(target, "OldRoute-Abc123.js"), "utf8")).toBe("old route");
    });

    it("uses the first historical source when sources conflict on a path missing from target", () => {
        const firstSource = path.join(root, "first", "assets");
        const secondSource = path.join(root, "second", "assets");
        const target = path.join(root, "new", "assets");
        for (const directory of [firstSource, secondSource, target]) fs.mkdirSync(directory, { recursive: true });
        writeAsset(firstSource, "LegacyRoute-Abc123.js", "first historical version");
        writeAsset(secondSource, "LegacyRoute-Abc123.js", "second historical version");

        const result = carryForwardReleaseAssets([firstSource, secondSource], target, { allowConflicts: true });

        expect(result.copied).toBe(1);
        expect(result.conflicts).toEqual(["LegacyRoute-Abc123.js"]);
        expect(fs.readFileSync(path.join(target, "LegacyRoute-Abc123.js"), "utf8")).toBe("first historical version");
    });
});
