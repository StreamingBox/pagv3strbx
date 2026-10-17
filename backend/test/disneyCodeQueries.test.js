const assert = require("node:assert/strict");
const test = require("node:test");
const pool = require("../src/db");
const { countDisneyDeliveredForPurchase } = require("../src/services/codeQueries");

test("counts every Disney code delivered for the current purchase, including admin deliveries", async (t) => {
    const purchasedAt = new Date("2026-10-17T12:00:00.000Z");
    const query = t.mock.method(pool, "query", async (sql, params) => {
        assert.match(sql, /cd\.status = 'delivered'/);
        assert.match(sql, /cd\.delivered_code IS NOT NULL/);
        assert.match(sql, /cd\.created_at >= \?/);
        assert.doesNotMatch(sql, /admin_requester/);
        assert.deepEqual(params, [901, purchasedAt]);
        return [[{ total: "1" }]];
    });

    const count = await countDisneyDeliveredForPurchase({ subscriptionId: 901, purchasedAt });

    assert.equal(count, 1);
    assert.equal(query.mock.callCount(), 1);
});
