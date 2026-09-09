const assert = require("node:assert/strict");
const test = require("node:test");
const { getStockSummary } = require("../src/services/stockSummary.service");

test("normalizes the aggregate stock rows without exposing credentials", async () => {
    const fakeDb = {
        async query() {
            return [[
                {
                    platform_id: "12",
                    platform: "Netflix",
                    slug: "netflix",
                    available: "5",
                    total: "8",
                    email: "should-not-be-returned@example.com",
                },
            ]];
        },
    };

    const result = await getStockSummary(fakeDb);

    assert.deepEqual(result, [{
        platformId: 12,
        platform: "Netflix",
        slug: "netflix",
        available: 5,
        total: 8,
    }]);
    assert.equal(Object.hasOwn(result[0], "email"), false);
});
