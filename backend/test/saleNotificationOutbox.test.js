const assert = require("node:assert/strict");
const test = require("node:test");
const { enqueueSaleNotification } = require("../src/services/notificationOutbox.service");

test("sale outbox notification uses a per-order Telegram dedupe key", async () => {
    const calls = [];
    const conn = {
        async query(sql, params) {
            calls.push({ sql, params });
            return [{ affectedRows: 1 }];
        },
    };
    const payload = {
        orderId: 456,
        seller: "Cliente de prueba",
        platforms: ["Netflix"],
        total: 8000,
        currency: "COP",
        discount: 0,
        profit: 0,
        newBalance: 12000,
        orderCode: "ORD-TEST-SALE",
    };

    await enqueueSaleNotification(conn, payload);

    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /INSERT INTO notification_outbox/);
    assert.deepEqual(calls[0].params.slice(0, 3), ["telegram", "sale", "telegram-sale:456"]);
    assert.deepEqual(JSON.parse(calls[0].params[3]), payload);
});

test("sale outbox notification rejects a missing order ID", async () => {
    await assert.rejects(
        enqueueSaleNotification({ query: async () => { throw new Error("must not query"); } }, { orderId: 0 }),
        /ID de orden válido/,
    );
});
