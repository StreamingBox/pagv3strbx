const test = require("node:test");
const assert = require("node:assert/strict");

const pool = require("../src/db");
const mailService = require("../src/services/mailService");

test("aprueba el principal y el bono en una transacción y no duplica la acreditación", async () => {
    const originalGetConnection = pool.getConnection;
    const originalPoolQuery = pool.query;
    const originalSendApprovedEmail = mailService.sendTopupApprovedEmail;
    const servicePath = require.resolve("../src/services/manualTopups.service");
    const previousServiceModule = require.cache[servicePath];
    const requestRow = {
        id: 42,
        request_code: "REC-TEST-42",
        user_id: 7,
        user_email: "fake-customer@example.test",
        user_name: "Cliente de prueba",
        user_currency: "COP",
        amount: "50000.00",
        currency: "COP",
        method_label: "Bre-B",
        status: "submitted",
        promo_bonus_amount: "5000.00",
        promo_bonus_percent: "10.00",
        promo_campaign: "saturday",
    };
    const walletUpdates = [];
    const transactions = [];
    const notifications = [];
    let commitCount = 0;

    const connection = {
        async beginTransaction() {},
        async commit() { commitCount += 1; },
        async rollback() {},
        release() {},
        async query(sql, params = []) {
            const statement = String(sql).replace(/\s+/g, " ").trim();
            if (statement.includes("FROM manual_topup_requests") && statement.includes("FOR UPDATE")) {
                return [[{ ...requestRow }]];
            }
            if (statement.startsWith("SELECT id, balance, currency FROM wallets")) {
                return [[{ id: 9, balance: "10000.00", currency: "COP" }]];
            }
            if (statement.startsWith("UPDATE wallets SET balance")) walletUpdates.push(params);
            if (statement.startsWith("INSERT INTO wallet_transactions")) transactions.push({ statement, params });
            if (statement.startsWith("INSERT INTO user_notifications")) notifications.push(params);
            if (statement.startsWith("UPDATE manual_topup_requests")) requestRow.status = params[0];
            return [{ affectedRows: 1 }];
        },
    };

    try {
        mailService.sendTopupApprovedEmail = async () => ({ ok: false });
        delete require.cache[servicePath];
        const { updateManualTopupStatus } = require(servicePath);
        pool.getConnection = async () => connection;
        pool.query = async (sql) => {
            const statement = String(sql).replace(/\s+/g, " ").trim();
            if (statement.startsWith("SELECT m.*, u.email AS user_email")) return [[{ ...requestRow }]];
            return [{ affectedRows: 1 }];
        };

        const approved = await updateManualTopupStatus({ id: 42, status: "approved", adminUserId: 2 });
        assert.equal(approved.promoBonusAmount, 5000);
        assert.equal(walletUpdates.length, 1);
        assert.equal(walletUpdates[0][0], 65000);
        assert.equal(transactions.length, 2);
        assert.match(transactions[0].statement, /'topup'/);
        assert.equal(transactions[0].params[1], 50000);
        assert.equal(transactions[0].params[2], 60000);
        assert.match(transactions[1].statement, /'topup_bonus'/);
        assert.equal(transactions[1].params[1], 5000);
        assert.equal(transactions[1].params[2], 65000);
        assert.equal(notifications.length, 1);
        assert.equal(commitCount, 1);

        await assert.rejects(
            updateManualTopupStatus({ id: 42, status: "approved", adminUserId: 2 }),
            /solicitud ya fue cerrada/i
        );
        assert.equal(transactions.length, 2);
        assert.equal(commitCount, 1);
    } finally {
        pool.getConnection = originalGetConnection;
        pool.query = originalPoolQuery;
        mailService.sendTopupApprovedEmail = originalSendApprovedEmail;
        if (previousServiceModule) require.cache[servicePath] = previousServiceModule;
        else delete require.cache[servicePath];
    }
});
