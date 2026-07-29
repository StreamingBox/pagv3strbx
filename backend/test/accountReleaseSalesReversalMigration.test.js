const test = require("node:test");
const assert = require("node:assert/strict");

const migration = require("../src/migrations/031_account_release_sales_reversals");

test("forced release migration creates an idempotent analytics reversal and backfills prior refunds", async () => {
    const calls = [];
    await migration.up({
        query: async (sql, params, options) => calls.push({ sql, params, options }),
    });

    assert.equal(migration.id, "031_account_release_sales_reversals");
    assert.ok(calls.some(({ sql }) => /ADD COLUMN source_type VARCHAR\(64\) NULL/.test(sql)));
    assert.ok(calls.some(({ sql }) => /ADD COLUMN cost_reversal_amount DECIMAL\(12,2\) NULL/.test(sql)));
    assert.ok(calls.some(({ sql }) => /CREATE UNIQUE INDEX uq_sales_adjustments_source/.test(sql)));

    const backfill = calls.find(({ sql }) => /INSERT INTO sales_adjustments/.test(sql));
    assert.ok(backfill);
    assert.match(backfill.sql, /'subscription_release_refund'/);
    assert.match(backfill.sql, /DATE\(DATE_SUB\(COALESCE\(o\.created_at, arl\.created_at\), INTERVAL 5 HOUR\)\)/);
    assert.match(backfill.sql, /ON DUPLICATE KEY UPDATE/);
});
