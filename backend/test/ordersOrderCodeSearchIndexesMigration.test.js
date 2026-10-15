const assert = require("node:assert/strict");
const test = require("node:test");
const migration = require("../src/migrations/053_orders_order_code_search_indexes");

test("order search migration adds the generated suffix and both indexes when missing", async () => {
    const calls = [];
    await migration.up({
        query: async (sql, params) => {
            calls.push({ sql, params });
            if (sql === "SHOW COLUMNS FROM orders") return [[], []];
            return [[], []];
        },
    });

    assert.match(calls[0].sql, /SHOW COLUMNS FROM orders/);
    assert.match(calls[1].sql, /GENERATED ALWAYS AS \(RIGHT\(order_code, 6\)\) STORED/);
    assert.match(calls[2].sql, /SHOW INDEX FROM orders/);
    assert.match(calls[3].sql, /CREATE INDEX idx_orders_order_code ON orders\(order_code\)/);
    assert.match(calls[5].sql, /CREATE INDEX idx_orders_order_code_suffix ON orders\(order_code_suffix\)/);
});

test("order search migration is idempotent when the column and indexes already exist", async () => {
    const calls = [];
    await migration.up({
        query: async (sql, params) => {
            calls.push({ sql, params });
            if (sql === "SHOW COLUMNS FROM orders") {
                return [[{ Field: "order_code_suffix" }], []];
            }
            return [[{ Field: "order_code_suffix", Key_name: params?.[0] }], []];
        },
    });

    assert.equal(calls.length, 3);
    assert.ok(calls.every(({ sql }) => sql.startsWith("SHOW ")));
});
