const test = require("node:test");
const assert = require("node:assert/strict");

const pool = require("../src/db");
const { patchInventory } = require("../src/services/inventory.service");
const migration = require("../src/migrations/055_platform_account_sale_priority");

function createMockConnection() {
    const calls = [];
    const connection = {
        async beginTransaction() {},
        async commit() {},
        async rollback() { this.didRollback = true; },
        release() {},
        async query(sql, params = []) {
            calls.push({ sql, params });
            if (/SELECT pa\.id, pa\.identity_id/.test(sql)) {
                return [[{
                    id: 42,
                    email: "disney@example.test",
                    password: null,
                    access_url: null,
                    pin: null,
                    two_factor_secret: null,
                    profile_number: null,
                    youtube_channel_name: null,
                    platform_name: "Disney Premium",
                    platform_slug: "disney-premium",
                }]];
            }
            return [{ affectedRows: 1 }, []];
        },
    };
    return { connection, calls };
}

test("admin can enable or disable sale priority without changing account status", async () => {
    const originalGetConnection = pool.getConnection;
    const { connection, calls } = createMockConnection();
    pool.getConnection = async () => connection;

    try {
        await patchInventory(42, { sale_priority: true });
        await patchInventory(42, { sale_priority: false });

        const updates = calls.filter(({ sql }) => /UPDATE platform_accounts/.test(sql));
        assert.equal(updates.length, 2);
        assert.match(updates[0].sql, /SET sale_priority = \?/);
        assert.deepEqual(updates.map(({ params }) => params), [[1, 42], [0, 42]]);
        assert.doesNotMatch(updates[0].sql, /status\s*=/);
    } finally {
        pool.getConnection = originalGetConnection;
    }
});

test("admin sale priority rejects values outside booleans and 0/1", async () => {
    const originalGetConnection = pool.getConnection;
    const { connection } = createMockConnection();
    pool.getConnection = async () => connection;

    try {
        await assert.rejects(
            patchInventory(42, { sale_priority: "yes" }),
            (error) => error.status === 400
        );
        assert.equal(connection.didRollback, true);
    } finally {
        pool.getConnection = originalGetConnection;
    }
});

test("migration adds a disabled-by-default column and is idempotent", async () => {
    const statements = [];
    await migration.up({
        async query(sql) {
            statements.push(sql);
            return sql.startsWith("SHOW COLUMNS") ? [[], []] : [{}, []];
        },
    });
    assert.equal(statements.length, 2);
    assert.match(statements[1], /sale_priority TINYINT\(1\) NOT NULL DEFAULT 0/);

    const existingColumnStatements = [];
    await migration.up({
        async query(sql) {
            existingColumnStatements.push(sql);
            return [[{ Field: "sale_priority" }], []];
        },
    });
    assert.equal(existingColumnStatements.length, 1);
});
