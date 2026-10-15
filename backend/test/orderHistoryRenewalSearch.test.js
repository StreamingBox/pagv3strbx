const assert = require("node:assert/strict");
const test = require("node:test");
const pool = require("../src/db");
const { getRenewalsHistory } = require("../src/services/orderHistoryService");

test("renewal history applies the order-only filter to count and result queries", async () => {
    const originalQuery = pool.query;
    const calls = [];
    pool.query = async (sql, params) => {
        calls.push({ sql, params });
        return sql.includes("COUNT(*)") ? [[{ total: 0 }], []] : [[], []];
    };

    try {
        await getRenewalsHistory({ userId: 42, q: "6910" });
    } finally {
        pool.query = originalQuery;
    }

    assert.equal(calls.length, 2);
    for (const { sql, params } of calls) {
        assert.match(sql, /o\.id = \? OR o\.order_code_suffix LIKE/);
        assert.doesNotMatch(sql, /CAST\(s\.id AS CHAR\) LIKE|pa\.email LIKE|pa\.pin LIKE/);
        assert.deepEqual(params.slice(0, 3), [42, 6910, "6910%"]);
    }
});
