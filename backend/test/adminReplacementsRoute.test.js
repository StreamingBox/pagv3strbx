const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const Module = require("node:module");
const express = require("express");

function installMockModule(filename, exports) {
    const resolved = require.resolve(filename);
    const previous = require.cache[resolved];
    const mock = new Module(resolved);
    mock.filename = resolved;
    mock.loaded = true;
    mock.exports = exports;
    require.cache[resolved] = mock;
    return { resolved, previous };
}

test("admin replacements supports Bogota date and platform filters and remains admin-only", async () => {
    const calls = [];
    const mockedModules = [
        installMockModule("../src/middleware/requireAuth", (req, _res, next) => {
            req.user = { id: 42, role: req.headers["x-test-role"] || "admin" };
            next();
        }),
        installMockModule("../src/middleware/requireRole", (role) => (req, res, next) => {
            if (req.user?.role !== role) return res.status(403).json({ message: "Forbidden" });
            next();
        }),
        installMockModule("../src/db", {
            query: async (sql, params = []) => {
                calls.push({ sql, params });
                if (sql.includes("COUNT(*) AS total")) return [[{ total: 1 }], []];
                if (sql.includes("SELECT DISTINCT p.id, p.name")) return [[{ id: 12, name: "Paramount Plus" }], []];
                return [[{
                    id: 862,
                    subscription_id: 8202,
                    order_code: "ORD-TEST",
                    platform_name: "Paramount Plus",
                    old_account_email: "old@example.test",
                    new_account_email: "new@example.test",
                    previous_expires_at: "2026-11-24 04:59:59",
                }], []];
            },
        }),
    ];
    const routePath = require.resolve("../src/routes/admin.replacements");
    const previousRoute = require.cache[routePath];
    delete require.cache[routePath];
    const router = require("../src/routes/admin.replacements");
    const app = express();
    app.use(router);
    const server = http.createServer(app);

    try {
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        const url = `http://127.0.0.1:${server.address().port}/admin/replacements?fromDate=2026-10-25&toDate=2026-10-25&platformId=12&q=ORD-TEST`;
        const response = await fetch(url);
        const body = await response.json();
        assert.equal(response.status, 200);
        assert.equal(body.items[0].platform_name, "Paramount Plus");
        assert.deepEqual(body.platforms, [{ id: 12, name: "Paramount Plus" }]);

        const countQuery = calls.find(({ sql }) => sql.includes("COUNT(*) AS total"));
        assert.match(countQuery.sql, /arl\.created_at >= \?/);
        assert.match(countQuery.sql, /arl\.created_at < \?/);
        assert.match(countQuery.sql, /arl\.platform_id = \?/);
        assert.deepEqual(countQuery.params.slice(-3), ["2026-10-25 05:00:00", "2026-10-26 05:00:00", 12]);

        const secondPage = await fetch(`${url}&page=2`);
        const secondPageBody = await secondPage.json();
        assert.equal(secondPage.status, 200);
        assert.equal(secondPageBody.platforms, undefined);
        assert.equal(calls.filter(({ sql }) => sql.includes("SELECT DISTINCT p.id, p.name")).length, 1);

        const callsBeforeInvalid = calls.length;
        const invalidDate = await fetch(`${url}&fromDate=2026-02-30`);
        assert.equal(invalidDate.status, 400);
        const invalidRange = await fetch(url.replace("fromDate=2026-10-25", "fromDate=2026-10-26"));
        assert.equal(invalidRange.status, 400);
        assert.equal(calls.length, callsBeforeInvalid);

        const forbidden = await fetch(url, { headers: { "x-test-role": "user" } });
        assert.equal(forbidden.status, 403);
        assert.equal(calls.length, callsBeforeInvalid);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        delete require.cache[routePath];
        if (previousRoute) require.cache[routePath] = previousRoute;
        for (const { resolved, previous } of mockedModules.reverse()) {
            if (previous) require.cache[resolved] = previous;
            else delete require.cache[resolved];
        }
    }
});
