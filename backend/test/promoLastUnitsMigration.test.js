const test = require("node:test");
const assert = require("node:assert/strict");

const migration = require("../src/migrations/025_platform_promo_last_units_notice");

test("promo last units migration adds an opt-in platform field and clears non-promotions", async () => {
    const calls = [];
    await migration.up({
        query: async (sql, params, options) => calls.push({ sql, params, options }),
    });

    assert.equal(migration.id, "025_platform_promo_last_units_notice");
    assert.match(calls[0].sql, /ADD COLUMN show_promo_last_units TINYINT\(1\) NOT NULL DEFAULT 0/);
    assert.deepEqual(calls[0].options.ignoreCodes, ["ER_DUP_FIELDNAME"]);
    assert.match(calls[1].sql, /SET show_promo_last_units = 0 WHERE COALESCE\(is_promo, 0\) = 0/);
});
