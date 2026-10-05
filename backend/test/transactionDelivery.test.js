const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveDeliveredAccountId } = require("../src/services/transactionDelivery.service");

const orderTime = new Date("2026-10-05T15:00:00.000Z");

test("uses the original account when a same-order replacement happened afterwards", () => {
    const accountId = resolveDeliveredAccountId(30, orderTime, [{
        source: "replacement",
        order_id: 400,
        old_account_id: 20,
        new_account_id: 30,
        created_at: orderTime,
        id: 7,
    }], 400);

    assert.equal(accountId, 20);
});

test("uses the renewed account for the renewal order itself", () => {
    const accountId = resolveDeliveredAccountId(30, orderTime, [{
        source: "renewal",
        renewal_order_id: 401,
        old_account_id: 20,
        new_account_id: 30,
        created_at: orderTime,
        id: 8,
    }], 401);

    assert.equal(accountId, 30);
});

test("uses the latest account change before the transaction", () => {
    const accountId = resolveDeliveredAccountId(30, orderTime, [
        { source: "replacement", old_account_id: 10, new_account_id: 20, created_at: "2026-10-01T15:00:00.000Z", id: 1 },
        { source: "renewal", old_account_id: 20, new_account_id: 30, created_at: "2026-10-03T15:00:00.000Z", id: 2 },
    ], 402);

    assert.equal(accountId, 30);
});

test("uses the previous account from the first later account change", () => {
    const accountId = resolveDeliveredAccountId(30, orderTime, [{
        source: "replacement",
        order_id: 400,
        old_account_id: 20,
        new_account_id: 30,
        created_at: "2026-10-06T15:00:00.000Z",
        id: 7,
    }], 400);

    assert.equal(accountId, 20);
});
