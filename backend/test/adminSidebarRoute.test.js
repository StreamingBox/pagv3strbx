const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/db");
const router = require("../src/routes/admin.sidebar");

const route = router.stack.find((layer) => layer.route?.path === "/admin/sidebar-counts")?.route;
const handler = route?.stack.at(-1)?.handle;

test("admin sidebar counts aggregate the same visible badge populations behind admin auth", async () => {
    assert.ok(route);
    assert.equal(route.stack.length, 3);
    assert.equal(route.stack[0].handle.name, "requireAuth");
    const deniedResponse = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
    route.stack[1].handle({}, deniedResponse, () => assert.fail("non-admin request passed the role guard"));
    assert.equal(deniedResponse.statusCode, 401);

    const originalQuery = pool.query;
    const statements = [];
    const resultCounts = [4, 5, 6, 7];
    pool.query = async (sql) => {
        statements.push(sql);
        return [[{ count: resultCounts[statements.length - 1] }], []];
    };

    const response = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };

    try {
        await handler({}, response);
    } finally {
        pool.query = originalQuery;
    }

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { stock: 4, expirations: 5, topups: 6, support: 7 });
    assert.equal(statements.length, 4);
    assert.match(statements[0], /JOIN platform_prices pp/);
    assert.match(statements[0], /s\.is_notified = FALSE/);
    assert.match(statements[1], /s\.expires_at < DATE_ADD/);
    assert.match(statements[2], /m\.status = 'submitted'/);
    assert.match(statements[3], /status IN \('open', 'in_progress'\)/);
});
