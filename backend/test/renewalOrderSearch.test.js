const assert = require("node:assert/strict");
const test = require("node:test");
const { buildRenewalOrderSearch } = require("../src/utils/renewalOrderSearch");

test("renewal search matches only an exact order ID or an indexed order-code suffix", () => {
    assert.deepEqual(buildRenewalOrderSearch("6910"), {
        sql: "(o.id = ? OR o.order_code_suffix LIKE ? ESCAPE '!')",
        params: [6910, "6910%"],
    });
});

test("renewal search matches an order-code prefix", () => {
    assert.deepEqual(buildRenewalOrderSearch(" ord-mtxsxnvs "), {
        sql: "o.order_code LIKE ? ESCAPE '!'",
        params: ["ORD-MTXSXNVS%"],
    });
});

test("renewal search normalizes suffixes and treats LIKE wildcards literally", () => {
    assert.deepEqual(buildRenewalOrderSearch("ab%_!"), {
        sql: "o.order_code_suffix LIKE ? ESCAPE '!'",
        params: ["AB!%!_!!%"],
    });
});

test("renewal search ignores an empty query", () => {
    assert.equal(buildRenewalOrderSearch("  "), null);
});
