const test = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");

// Opt-in: a disposable, isolated MariaDB with synthetic data; never the application DB.
test("referral migration, atomic approvals and concurrent credits on MariaDB", { skip: !process.env.REFERRALS_INTEGRATION_HOST }, async t => {
    assert.equal(process.env.REFERRALS_INTEGRATION_DB, "referrals_test");
    const db = mysql.createPool({ host: process.env.REFERRALS_INTEGRATION_HOST, database: "referrals_test", user: "root", password: "", timezone: "+00:00", connectionLimit: 8 });
    const appPool = require("../src/db");
    const originalQuery = appPool.query;
    const originalConnection = appPool.getConnection;
    const mail = require("../src/services/mailService");
    const originalMail = mail.sendTopupApprovedEmail;
    mail.sendTopupApprovedEmail = async () => ({ ok: false });
    appPool.query = (...args) => db.query(...args);
    appPool.getConnection = () => db.getConnection();
    const service = require("../src/services/referrals.service");
    const { updateManualTopupStatus } = require("../src/services/manualTopups.service");
    const migration = require("../src/migrations/057_referral_program");
    async function transaction(callback) {
        const conn = await db.getConnection();
        try { await conn.beginTransaction(); const result = await callback(conn); await conn.commit(); return result; }
        catch (error) { await conn.rollback(); throw error; }
        finally { conn.release(); }
    }
    async function createClient(id) {
        await db.query("INSERT INTO users (id, name, email, status, role, currency) VALUES (?, ?, ?, 'active', 'user', 'COP')", [id, "Synthetic Client " + id, "synthetic-" + id + "@example.test"]);
        await db.query("INSERT INTO wallets (user_id, balance, currency) VALUES (?, 0, 'COP')", [id]);
        if (id !== 1) await transaction(conn => service.attachReferral(conn, { userId: id, code, contactConsent: true }));
    }
    async function createTopup(id, userId, amount, bonus = 0) {
        await db.query("INSERT INTO manual_topup_requests (id, request_code, user_id, amount, currency, method_label, status, promo_bonus_amount, promo_bonus_percent) VALUES (?, ?, ?, ?, 'COP', 'Synthetic payment', 'submitted', ?, 10)", [id, "SYNTHETIC-" + id, userId, amount, bonus]);
    }
    let code;
    try {
        for (const sql of [
            "CREATE TABLE users (id BIGINT UNSIGNED PRIMARY KEY, name VARCHAR(100), email VARCHAR(200) UNIQUE, status VARCHAR(20), role VARCHAR(20), currency CHAR(3)) ENGINE=InnoDB",
            "CREATE TABLE wallets (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED UNIQUE, balance DECIMAL(12,2), currency CHAR(3)) ENGINE=InnoDB",
            "CREATE TABLE wallet_transactions (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, wallet_id BIGINT UNSIGNED, type VARCHAR(50), amount DECIMAL(12,2), balance_after DECIMAL(12,2), reference_type VARCHAR(50), reference_id BIGINT UNSIGNED, note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB",
            "CREATE TABLE manual_topup_requests (id BIGINT UNSIGNED PRIMARY KEY, request_code VARCHAR(50), user_id BIGINT UNSIGNED, amount DECIMAL(12,2), currency CHAR(3), method_label VARCHAR(100), status VARCHAR(20), promo_bonus_amount DECIMAL(12,2) DEFAULT 0, promo_bonus_percent DECIMAL(5,2) DEFAULT 0, admin_user_id BIGINT UNSIGNED, admin_note TEXT, wallet_id BIGINT UNSIGNED, balance_before DECIMAL(12,2), balance_after DECIMAL(12,2), approved_at DATETIME, reviewing_at DATETIME, rejected_at DATETIME) ENGINE=InnoDB",
            "CREATE TABLE user_notifications (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED, message TEXT) ENGINE=InnoDB",
            "CREATE TABLE app_settings (setting_key VARCHAR(128) PRIMARY KEY, setting_value TEXT NOT NULL) ENGINE=InnoDB",
        ]) await db.query(sql);
        await migration.up({ query: (...args) => db.query(...args) });
        await migration.up({ query: (...args) => db.query(...args) });
        assert.equal((await service.getSettings(db)).enabled, false);
        await transaction(conn => service.saveSettings(conn, { enabled: true, rewardAmount: 10000, expectedVersion: 1 }, 99));
        await createClient(1);
        const codes = await Promise.all(Array.from({ length: 5 }, () => service.ensureReferralCode(1, db)));
        assert.equal(new Set(codes).size, 1);
        code = codes[0];

        await t.test("two concurrent approvals reward only once and retain their own balances", async () => {
            await createClient(2);
            await createTopup(101, 2, 20000);
            await createTopup(102, 2, 30000);
            const approved = await Promise.allSettled([101, 102].map(id => updateManualTopupStatus({ id, status: "approved", adminUserId: 99 })));
            assert.equal(approved.filter(result => result.status === "fulfilled").length, 2);
            const [[credits]] = await db.query("SELECT COUNT(*) AS total, SUM(amount) AS amount FROM wallet_transactions WHERE type = 'referral_bonus'");
            assert.equal(Number(credits.total), 1); assert.equal(Number(credits.amount), 10000);
            const [[wallet]] = await db.query("SELECT balance FROM wallets WHERE user_id = 2");
            assert.equal(Number(wallet.balance), 50000);
            await assert.rejects(updateManualTopupStatus({ id: 101, status: "approved", adminUserId: 99 }), /cerrada/);
        });

        await t.test("smaller top-ups accumulate; promotional bonus does not count toward the target", async () => {
            await createClient(3); await createTopup(103, 3, 45000, 5000); await createTopup(104, 3, 5000);
            await updateManualTopupStatus({ id: 103, status: "approved" });
            const [[pending]] = await db.query("SELECT status, progress_amount FROM referrals WHERE referred_user_id = 3");
            assert.equal(pending.status, "pending"); assert.equal(Number(pending.progress_amount), 45000);
            await updateManualTopupStatus({ id: 104, status: "approved" });
            const [[row]] = await db.query("SELECT status, progress_amount FROM referrals WHERE referred_user_id = 3");
            assert.equal(row.status, "credited"); assert.equal(Number(row.progress_amount), 50000);
        });

        await t.test("a failure while crediting rolls back the principal, bonus, status and referral", async () => {
            await createClient(4); await createTopup(105, 4, 50000, 5000);
            await db.query("CREATE TRIGGER synthetic_referral_failure BEFORE INSERT ON wallet_transactions FOR EACH ROW BEGIN IF NEW.type = 'referral_bonus' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'synthetic credit failure'; END IF; END");
            await assert.rejects(updateManualTopupStatus({ id: 105, status: "approved" }), /synthetic credit failure/);
            await db.query("DROP TRIGGER synthetic_referral_failure");
            const [[wallet]] = await db.query("SELECT balance FROM wallets WHERE user_id = 4");
            const [[request]] = await db.query("SELECT status FROM manual_topup_requests WHERE id = 105");
            const [[referral]] = await db.query("SELECT status, qualifying_topup_id, progress_amount FROM referrals WHERE referred_user_id = 4");
            assert.equal(Number(wallet.balance), 0); assert.equal(request.status, "submitted");
            assert.equal(referral.status, "pending"); assert.equal(referral.qualifying_topup_id, null); assert.equal(Number(referral.progress_amount), 0);
            const [[contributions]] = await db.query("SELECT COUNT(*) AS count FROM referral_topups WHERE topup_id = 105");
            assert.equal(Number(contributions.count), 0);
        });

        await t.test("monthly budget holds a snapshotted reward and retry honors it after pausing", async () => {
            await createClient(5); await createTopup(106, 5, 50000);
            const settings = await service.getSettings(db);
            await transaction(conn => service.saveSettings(conn, { enabled: true, rewardAmount: 15000, monthlyBudget: 20000, expectedVersion: settings.version }, 99));
            await updateManualTopupStatus({ id: 106, status: "approved" });
            const [[held]] = await db.query("SELECT status, reason FROM referrals WHERE referred_user_id = 5");
            assert.equal(held.status, "review"); assert.equal(held.reason, "monthly_budget");
            const latest = await service.getSettings(db);
            await transaction(conn => service.saveSettings(conn, { enabled: false, monthlyBudget: 30000, expectedVersion: latest.version }, 99));
            const [[request]] = await db.query("SELECT * FROM manual_topup_requests WHERE id = 106");
            const result = await transaction(conn => service.processTopupReferral(conn, request, { retry: true, actorUserId: 99 }));
            assert.equal(result.amount, 10000); assert.equal(result.status, "credited");
            assert.equal((await transaction(conn => service.processTopupReferral(conn, request, { retry: true }))).status, "unchanged");
        });

        await t.test("privacy and database constraints remain enforced", async () => {
            const own = await service.listReferrals({}, { userId: 1, db });
            assert.equal(own.total, 4);
            assert.equal(own.items.every(item => item.referredEmail.endsWith("@example.test")), true);
            await db.query("UPDATE referrals SET contact_consent_at = NULL WHERE referred_user_id = 2");
            const redacted = await service.listReferrals({}, { userId: 1, db });
            assert.equal(redacted.items.find(item => Number(item.id) === Number(own.items.find(item => item.referredEmail === 'synthetic-2@example.test').id)).referredEmail, null);
            const admin = await service.listReferrals({ status: "credited" }, { db });
            assert.equal(admin.total, 3); assert.equal(admin.summary.awarded, 30000);
            await assert.rejects(db.query("INSERT INTO referrals (referrer_user_id, referred_user_id, referral_code, settings_version, reward_amount, minimum_topup, expires_at) SELECT referrer_user_id, referred_user_id, referral_code, settings_version, reward_amount, minimum_topup, expires_at FROM referrals LIMIT 1"), error => error.code === "ER_DUP_ENTRY");
        });
        await t.test("compensating reversal is idempotent, never overdraws and preserves the gross budget", async () => {
            const [[referral]] = await db.query("SELECT id FROM referrals WHERE referred_user_id = 2");
            const reversed = await transaction(conn => service.reverseReferral(conn, referral.id, 99, "Synthetic refund test"));
            assert.equal(reversed.status, "reversed");
            await assert.rejects(transaction(conn => service.reverseReferral(conn, referral.id, 99, "Synthetic repeated request")), /una sola vez/);
            const [[gross]] = await db.query("SELECT SUM(total_awarded) AS amount FROM referral_budget_usage");
            assert.equal(Number(gross.amount), 30000);
            const [[debits]] = await db.query("SELECT COUNT(*) AS count, SUM(amount) AS amount FROM wallet_transactions WHERE type = 'referral_reversal'");
            assert.equal(Number(debits.count), 1); assert.equal(Number(debits.amount), -10000);
            await db.query("UPDATE wallets SET balance = 0 WHERE user_id = 1");
            const [[other]] = await db.query("SELECT id FROM referrals WHERE referred_user_id = 5");
            await assert.rejects(transaction(conn => service.reverseReferral(conn, other.id, 99, "Synthetic insufficient balance")), /saldo COP suficiente/);
            const [[wallet]] = await db.query("SELECT balance FROM wallets WHERE user_id = 1");
            assert.equal(Number(wallet.balance), 0);
        });
    } finally {
        appPool.query = originalQuery; appPool.getConnection = originalConnection;
        mail.sendTopupApprovedEmail = originalMail;
        await db.end(); await appPool.end();
    }
});
