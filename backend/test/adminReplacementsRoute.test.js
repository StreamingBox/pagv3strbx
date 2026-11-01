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
                if (sql.includes("COUNT(*) AS total")) return [[{ total: 1, pending_total: 1, reviewed_total: 0 }], []];
                if (sql.includes("SELECT DISTINCT p.id, p.name")) return [[{ id: 12, name: "Paramount Plus" }], []];
                if (sql.includes("old_pa.password AS old_account_password")) return [[{
                    id: 862,
                    old_account_id: 9476,
                    old_account_email: "old@example.test",
                    old_account_password: "fake-old-password",
                    old_account_pin: "0012",
                    old_account_profile_number: 3,
                    new_account_id: 9483,
                    new_account_email: "new@example.test",
                    new_account_password: "fake-new-password",
                    new_account_pin: "9087",
                    new_account_profile_number: 2,
                }], []];
                if (sql.includes("UPDATE account_replacement_logs")) return [{ affectedRows: 1 }, []];
                if (sql.startsWith("SELECT arl.id, arl.reviewed_at, arl.reviewed_by_user_id")) return [[{
                    id: 862,
                    reviewed_at: "2026-10-30 19:00:00",
                    reviewed_by_user_id: 42,
                    reviewer_email: "admin@example.test",
                    reviewer_name: "Admin",
                }], []];
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
        assert.equal(Object.hasOwn(body.items[0], "old_account_password"), false);
        assert.deepEqual(body.platforms, [{ id: 12, name: "Paramount Plus" }]);
        assert.deepEqual(body.counts, { pending: 1, reviewed: 0, all: 1 });
        assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");

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

        const exportResponse = await fetch(`http://127.0.0.1:${server.address().port}/admin/replacements?includeCredentials=1`);
        const exportBody = await exportResponse.json();
        assert.equal(exportResponse.status, 200);
        assert.equal(exportBody.items[0].old_account_password, "fake-old-password");

        const callsBeforeInvalid = calls.length;
        const invalidDate = await fetch(`${url}&fromDate=2026-02-30`);
        assert.equal(invalidDate.status, 400);
        const invalidRange = await fetch(url.replace("fromDate=2026-10-25", "fromDate=2026-10-26"));
        assert.equal(invalidRange.status, 400);
        assert.equal(calls.length, callsBeforeInvalid);

        const forbidden = await fetch(url, { headers: { "x-test-role": "user" } });
        assert.equal(forbidden.status, 403);
        assert.equal(calls.length, callsBeforeInvalid);

        const credentialsResponse = await fetch(`http://127.0.0.1:${server.address().port}/admin/replacements/862/credentials`);
        const credentialsBody = await credentialsResponse.json();
        assert.equal(credentialsResponse.status, 200);
        assert.equal(credentialsResponse.headers.get("cache-control"), "private, no-store, max-age=0");
        assert.equal(credentialsBody.item.old_account_password, "fake-old-password");
        assert.equal(credentialsBody.item.new_account_pin, "9087");

        const reviewResponse = await fetch(`http://127.0.0.1:${server.address().port}/admin/replacements/862/review`, { method: "POST" });
        const reviewBody = await reviewResponse.json();
        assert.equal(reviewResponse.status, 200);
        assert.equal(reviewBody.item.reviewed_by_user_id, 42);
        assert.equal(reviewBody.item.reviewer_email, "admin@example.test");
        const update = calls.find(({ sql }) => sql.includes("UPDATE account_replacement_logs"));
        assert.deepEqual(update.params, [42, 862]);

        const forbiddenCredentials = await fetch(`http://127.0.0.1:${server.address().port}/admin/replacements/862/credentials`, { headers: { "x-test-role": "user" } });
        assert.equal(forbiddenCredentials.status, 403);
        const callsBeforeForbiddenReview = calls.length;
        const forbiddenReview = await fetch(`http://127.0.0.1:${server.address().port}/admin/replacements/862/review`, { method: "POST", headers: { "x-test-role": "user" } });
        assert.equal(forbiddenReview.status, 403);
        assert.equal(calls.length, callsBeforeForbiddenReview);
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
