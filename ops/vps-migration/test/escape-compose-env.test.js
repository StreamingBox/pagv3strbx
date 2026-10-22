const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createComposeEnvironment } = require("../escape-compose-env");

test("escapes Compose interpolation without changing dotenv quoting or layout", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pagev3-compose-env-"));
    const source = path.join(root, "source.env");
    const destination = path.join(root, "target.env");
    const original = "JWT=left$unresolved$right\r\nPRIVATE='line one\\nline two'\r\n";

    try {
        fs.writeFileSync(source, original);
        createComposeEnvironment(source, destination);
        assert.equal(fs.readFileSync(destination, "utf8"), original.replace(/\$/g, () => "$$"));
        assert.throws(() => createComposeEnvironment(source, destination), { code: "EEXIST" });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
