const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("API support uploads use the mounted container storage path", () => {
    const composePath = path.join(__dirname, "..", "compose.yaml");
    const compose = fs.readFileSync(composePath, "utf8");

    assert.match(compose, /SUPPORT_UPLOAD_DIR:\s*\/app\/backend\/storage\/support/);
});
