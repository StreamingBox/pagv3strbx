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

test("la ruta de venta múltiple exige admin e ignora el adminUserId enviado por el navegador", async () => {
    let capturedPayload = null;
    let legacyPayload = null;
    const mockedModules = [
        installMockModule("../src/middleware/requireAuth", (req, _res, next) => {
            req.user = {
                id: Number(req.headers["x-test-user-id"] || 77),
                role: String(req.headers["x-test-role"] || "admin"),
            };
            next();
        }),
        installMockModule("../src/services/inventory.service", {
            getInventory: async () => ({}),
            getSellableInventory: async () => ({}),
            getInventoryAccountDetail: async () => ({}),
            exportInventoryCsv: async () => ({ filename: "inventory.csv", csv: "" }),
            patchInventory: async () => ({}),
        }),
        installMockModule("../src/services/sellAccount.service", {
            sellAccountFromInventory: async (payload) => {
                legacyPayload = payload;
                return { ok: true, orderCode: "ORD-LEGACY" };
            },
            sellAccountsFromInventory: async (payload) => {
                capturedPayload = payload;
                return { ok: true, orderId: 9, items: [] };
            },
        }),
    ];
    const routePath = require.resolve("../src/routes/admin.inventory.routes");
    const previousRoute = require.cache[routePath];
    delete require.cache[routePath];
    const router = require("../src/routes/admin.inventory.routes");
    const app = express();
    app.use(express.json());
    app.use(router);
    const server = http.createServer(app);

    try {
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        const url = `http://127.0.0.1:${address.port}/admin/inventory/sell`;
        const body = { userId: 57, adminUserId: 999, items: [{ accountId: 9, platformPriceId: 21 }] };
        const adminResponse = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json", "x-test-role": "admin", "x-test-user-id": "77" },
            body: JSON.stringify(body),
        });
        assert.equal(adminResponse.status, 201);
        assert.deepEqual(capturedPayload, { ...body, adminUserId: 77 });

        const userResponse = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json", "x-test-role": "user" },
            body: JSON.stringify(body),
        });
        assert.equal(userResponse.status, 403);

        const legacyResponse = await fetch(`${url.replace("/sell", "/9/sell")}`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-test-role": "admin", "x-test-user-id": "77" },
            body: JSON.stringify({ userId: 57, platformPriceId: 21, adminUserId: 999 }),
        });
        assert.equal(legacyResponse.status, 201);
        assert.deepEqual(legacyPayload, { userId: 57, platformPriceId: 21, adminUserId: 77, accountId: 9 });
        assert.deepEqual(await legacyResponse.json(), { ok: true, orderCode: "ORD-LEGACY" });
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
