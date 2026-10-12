const assert = require("node:assert/strict");
const test = require("node:test");
const migration = require("../src/migrations/052_platform_accounts_email_index");

test("platform account email index migration skips an existing index", async () => {
    const statements = [];

    await migration.up({
        query: async (sql, params) => {
            statements.push({ sql, params });
            return [[{ Key_name: "idx_platform_accounts_email" }], []];
        },
    });

    assert.equal(statements.length, 1);
    assert.match(statements[0].sql, /SHOW INDEX FROM platform_accounts/);
});

test("platform account email index migration creates the missing index", async () => {
    const statements = [];

    await migration.up({
        query: async (sql, params) => {
            statements.push({ sql, params });
            return [[], []];
        },
    });

    assert.equal(statements.length, 2);
    assert.match(statements[1].sql, /CREATE INDEX idx_platform_accounts_email ON platform_accounts\(email\)/);
});
