const test = require("node:test");
const assert = require("node:assert/strict");

const pool = require("../src/db");
const tokenUtils = require("../src/utils/tokens");
const providerReports = require("../src/utils/strbxReportedAccounts");
const fallbacks = require("../src/services/platformFallbacks.service");
const notifications = require("../src/services/notificationOutbox.service");
const stockAlerts = require("../src/services/stockAlertMonitor.service");
const profitCosts = require("../src/utils/profitCosts");

providerReports.getStrbxReportedNetflixProviderAccount = async () => null;
fallbacks.getCandidatePlatformsForPlatform = async (_conn, platformId) => [
    { platformId: Number(platformId), source: "requested" },
];
tokenUtils.insertCredentialLinkWithRetry = async (conn, { subscriptionId }) => {
    await conn.query("INSERT INTO credential_links", [subscriptionId]);
    return `token-${subscriptionId}`;
};
notifications.enqueueNotification = async () => {};
notifications.enqueueSaleNotification = async () => {};
stockAlerts.schedulePlatformStockAlertCheck = () => {};
profitCosts.automaticUnitCostForPlan = () => 0;

const { sellAccountsFromInventory, __test } = require("../src/services/sellAccount.service");

function fakeConnection({ failSecondAccountUpdate = false } = {}) {
    const queries = [];
    let nextSubscriptionId = 701;
    let platformUpdates = 0;
    const connection = {
        began: false,
        committed: false,
        rolledBack: false,
        released: false,
        writes: [],
        async beginTransaction() { this.began = true; },
        async commit() { this.committed = true; },
        async rollback() { this.rolledBack = true; },
        release() { this.released = true; },
        async query(sql, params = []) {
            queries.push({ sql, params });
            if (sql.includes("FROM platform_accounts pa") && sql.includes("FOR UPDATE")) {
                return [[
                    { id: 9, platform_id: 42, status: "available", inventory_not_expired: 1, delivered_platform_is_active: 1, delivered_platform_name: "Netflix", email: "one@example.com", password: "one-pass", unit_cost: 0 },
                    { id: 10, platform_id: 43, status: "available", inventory_not_expired: 1, delivered_platform_is_active: 1, delivered_platform_name: "Disney", email: "two@example.com", password: "two-pass", unit_cost: 0 },
                ]];
            }
            if (sql.includes("FROM platform_prices pp")) {
                return [[
                    { id: 21, platform_price_id: 21, platform_id: 42, platform_name: "Netflix", platform_slug: "netflix", duration_id: 1, duration_name: "Mensual", days: 30, price: 10000, currency: "COP", is_active: 1 },
                    { id: 38, platform_price_id: 38, platform_id: 43, platform_name: "Disney", platform_slug: "disney", duration_id: 1, duration_name: "Mensual", days: 30, price: 15000, currency: "COP", is_active: 1 },
                ]];
            }
            if (sql.includes("FROM provider_accounts reported_provider_account")) return [[]];
            if (sql.includes("FROM platform_fallbacks pf")) return [[]];
            if (sql.includes("FROM users u") && sql.includes("FOR UPDATE")) {
                return [[{ id: 57, name: "CRM admin", email: null, currency: "COP", wallet_id: 5, balance: 50000, wallet_currency: "COP" }]];
            }
            if (sql.includes("INSERT INTO orders")) {
                this.writes.push({ type: "order", params });
                return [{ insertId: 501 }];
            }
            if (sql.includes("INSERT INTO subscriptions")) {
                this.writes.push({ type: "subscription", params });
                return [{ insertId: nextSubscriptionId++ }];
            }
            if (sql.includes("INSERT INTO order_items")) {
                this.writes.push({ type: "order-item", params });
                return [{ affectedRows: 1 }];
            }
            if (sql.includes("UPDATE platform_accounts")) {
                platformUpdates += 1;
                if (failSecondAccountUpdate && platformUpdates === 2) throw new Error("simulated item write failure");
                this.writes.push({ type: "account", params });
                return [{ affectedRows: 1 }];
            }
            if (sql.includes("INSERT INTO credential_links")) {
                this.writes.push({ type: "credential-link", params });
                return [{ affectedRows: 1 }];
            }
            if (sql.includes("UPDATE wallets")) {
                this.writes.push({ type: "wallet", params });
                return [{ affectedRows: 1 }];
            }
            if (sql.includes("INSERT INTO wallet_transactions")) {
                this.writes.push({ type: "wallet-transaction", params });
                return [{ affectedRows: 1 }];
            }
            if (sql.includes("INSERT INTO notification_outbox")) return [{ affectedRows: 1 }];
            throw new Error(`Unexpected query: ${sql}`);
        },
    };
    return { connection, queries };
}

test("normaliza lote, rechaza cuentas duplicadas y limita a diez artículos", () => {
    assert.deepEqual(__test.normalizeSaleItems([
        { accountId: "9", platformPriceId: "21" },
        { accountId: 10, platformPriceId: 38 },
    ]), [
        { accountId: 9, platformPriceId: 21, customExpiryDate: null },
        { accountId: 10, platformPriceId: 38, customExpiryDate: null },
    ]);
    assert.throws(() => __test.normalizeSaleItems([
        { accountId: 9, platformPriceId: 21 },
        { accountId: 9, platformPriceId: 38 },
    ]), { status: 400 });
    assert.throws(() => __test.normalizeSaleItems([]), { status: 400 });
    assert.throws(() => __test.normalizeSaleItems(Array.from({ length: 11 }, (_, index) => ({ accountId: index + 1, platformPriceId: 21 }))), { status: 400 });
});

test("vende varias plataformas en un pedido y descuenta el total una sola vez", async () => {
    const originalGetConnection = pool.getConnection;
    const { connection, queries } = fakeConnection();
    pool.getConnection = async () => connection;
    try {
        const result = await sellAccountsFromInventory({
            adminUserId: 1,
            userId: 57,
            items: [
                { accountId: 9, platformPriceId: 21 },
                { accountId: 10, platformPriceId: 38 },
            ],
        });

        assert.equal(connection.committed, true);
        assert.equal(connection.rolledBack, false);
        assert.equal(result.total, 25000);
        assert.equal(result.newBalance, 25000);
        assert.equal(result.items.length, 2);
        assert.equal(result.deliveryMessage.includes("Pedido múltiple (2 items)"), true);
        assert.equal(queries.filter(({ sql }) => sql.includes("INSERT INTO orders")).length, 1);
        assert.equal(connection.writes.filter(({ type }) => type === "subscription").length, 2);
        assert.equal(connection.writes.filter(({ type }) => type === "wallet-transaction").length, 1);
        assert.deepEqual(connection.writes.find(({ type }) => type === "wallet")?.params, [25000, 0, 5]);
    } finally {
        pool.getConnection = originalGetConnection;
    }
});

test("revierte el pedido completo si falla una escritura de un artículo del lote", async () => {
    const originalGetConnection = pool.getConnection;
    const { connection } = fakeConnection({ failSecondAccountUpdate: true });
    pool.getConnection = async () => connection;
    try {
        await assert.rejects(sellAccountsFromInventory({
            adminUserId: 1,
            userId: 57,
            items: [
                { accountId: 9, platformPriceId: 21 },
                { accountId: 10, platformPriceId: 38 },
            ],
        }), /simulated item write failure/);
        assert.equal(connection.committed, false);
        assert.equal(connection.rolledBack, true);
        assert.equal(connection.released, true);
    } finally {
        pool.getConnection = originalGetConnection;
    }
});
