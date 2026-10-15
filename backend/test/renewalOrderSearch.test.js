const assert = require("node:assert/strict");
const test = require("node:test");
const { buildRenewalSubscriptionSearch } = require("../src/utils/renewalOrderSearch");

test("renewal search matches only the exact subscription ID", () => {
    assert.deepEqual(buildRenewalSubscriptionSearch(" 6910 "), {
        sql: "s.id = ?",
        params: ["6910"],
    });
});

test("renewal search never broadens to all results for a non-numeric query", () => {
    assert.deepEqual(buildRenewalSubscriptionSearch("ORD-ABC"), {
        sql: "1 = 0",
        params: [],
    });
});

test("renewal search ignores an empty query", () => {
    assert.equal(buildRenewalSubscriptionSearch("  "), null);
});
