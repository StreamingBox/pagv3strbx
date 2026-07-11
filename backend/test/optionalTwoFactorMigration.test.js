const test = require("node:test");
const assert = require("node:assert/strict");

const migration = require("../src/migrations/026_optional_two_factor_credentials");

test("optional two-factor migration adds a nullable credential field", async () => {
    const calls = [];
    await migration.up({
        query: async (sql, params, options) => calls.push({ sql, params, options }),
    });

    assert.equal(migration.id, "026_optional_two_factor_credentials");
    assert.match(calls[0].sql, /ADD COLUMN two_factor_secret TEXT NULL AFTER pin/);
    assert.deepEqual(calls[0].options.ignoreCodes, ["ER_DUP_FIELDNAME"]);
});
