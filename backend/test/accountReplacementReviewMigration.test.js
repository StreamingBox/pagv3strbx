const test = require("node:test");
const assert = require("node:assert/strict");
const migration = require("../src/migrations/059_account_replacement_review");

test("replacement review migration adds its columns and index once", async () => {
    const columns = new Set();
    const indexes = new Set();
    const changes = [];
    const query = async (sql, params = []) => {
        if (sql.startsWith("SHOW COLUMNS")) {
            return [[...(columns.has(params[0]) ? [{ Field: params[0] }] : [])], []];
        }
        if (sql.startsWith("SHOW INDEX")) {
            return [[...(indexes.has(params[0]) ? [{ Key_name: params[0] }] : [])], []];
        }
        changes.push(sql);
        const column = sql.match(/ADD COLUMN ([a-z_]+)/i)?.[1];
        if (column) columns.add(column);
        const index = sql.match(/CREATE INDEX ([a-z_]+)/i)?.[1];
        if (index) indexes.add(index);
        return [[], []];
    };

    await migration.up({ query });
    await migration.up({ query });

    assert.deepEqual([...columns].sort(), ["reviewed_at", "reviewed_by_user_id"]);
    assert.deepEqual([...indexes], ["idx_replacement_review_created"]);
    assert.equal(changes.length, 3);
});
