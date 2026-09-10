const test = require("node:test");
const assert = require("node:assert/strict");

const migration = require("../src/migrations/043_platform_price_drop_badges");

test("price drop migration adds previous regular and Lite prices", async () => {
    const calls = [];
    await migration.up({
        query: async (sql, params, options) => calls.push({ sql, params, options }),
    });

    assert.equal(migration.id, "043_platform_price_drop_badges");
    assert.match(calls[0].sql, /ADD COLUMN previous_price DECIMAL\(12,2\) NULL AFTER price/);
    assert.match(calls[1].sql, /ADD COLUMN previous_lite_price_cop DECIMAL\(12,2\) NULL AFTER lite_price_cop/);
    assert.deepEqual(calls[0].options.ignoreCodes, ["ER_DUP_FIELDNAME"]);
    assert.deepEqual(calls[1].options.ignoreCodes, ["ER_DUP_FIELDNAME"]);
});
