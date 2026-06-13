const assert = require("node:assert/strict");
const test = require("node:test");
const { buildDbConfig } = require("../src/utils/dbConfig");

test("database keeps MySQL DATE values as calendar strings", () => {
    const config = buildDbConfig({
        DB_HOST: "localhost",
        DB_USER: "user",
        DB_PASS: "secret",
        DB_NAME: "database",
    });

    assert.deepEqual(config.dateStrings, ["DATE"]);
    assert.equal(config.timezone, "+00:00");
});
