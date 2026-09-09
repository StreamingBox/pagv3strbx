const assert = require("node:assert/strict");
const test = require("node:test");

const migration = require("../src/migrations/034_support_management_expiry_extension");

test("support management migration adds the extension marker and event", async () => {
    const calls = [];
    await migration.up({
        query: async (sql, params, options) => calls.push({ sql, params, options }),
    });

    assert.equal(migration.id, "034_support_management_expiry_extension");
    assert.match(calls[0].sql, /ADD COLUMN management_extension_days TINYINT UNSIGNED NOT NULL DEFAULT 0/);
    assert.deepEqual(calls[0].options.ignoreCodes, ["ER_DUP_FIELDNAME"]);
    assert.match(calls[1].sql, /'management_extension'/);
});

