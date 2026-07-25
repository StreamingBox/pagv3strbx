const test = require("node:test");
const assert = require("node:assert/strict");

const migration = require("../src/migrations/030_platform_new_product_badge");

test("new product migration adds an opt-in catalog field", async () => {
    const calls = [];
    await migration.up({
        query: async (sql, params, options) => calls.push({ sql, params, options }),
    });

    assert.equal(migration.id, "030_platform_new_product_badge");
    assert.match(calls[0].sql, /ADD COLUMN is_new_product TINYINT\(1\) NOT NULL DEFAULT 0/);
    assert.deepEqual(calls[0].options.ignoreCodes, ["ER_DUP_FIELDNAME"]);
});
