const assert = require("node:assert/strict");
const test = require("node:test");
const migration = require("../src/migrations/067_apple_tv_code_platform");

test("seeds Apple TV code settings when the platform is not configured", async () => {
    const calls = [];
    await migration.up({
        query: async (sql, params = []) => {
            calls.push({ sql, params });
            return sql.startsWith("SELECT") ? [[]] : [{}];
        },
    });

    assert.equal(migration.id, "067_apple_tv_code_platform");
    assert.match(calls[1].sql, /INSERT INTO code_platforms/);
    assert.deepEqual(calls[1].params, ["appletv", "Apple TV", "apple.com", "([0-9]{6})", 30]);
});

test("updates the existing Apple TV code settings instead of inserting a duplicate", async () => {
    const calls = [];
    await migration.up({
        query: async (sql, params = []) => {
            calls.push({ sql, params });
            return sql.startsWith("SELECT") ? [[{ id: 42 }]] : [{}];
        },
    });

    assert.equal(calls.length, 2);
    assert.match(calls[1].sql, /UPDATE code_platforms/);
    assert.deepEqual(calls[1].params, ["Apple TV", "apple.com", "([0-9]{6})", 30, 42]);
});
