const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require("../src/db");
const telegram = require("../src/services/telegramBot");

test("referral HTTP permissions, privacy and transactional signup", async t => {
    const original = { query: pool.query, connection: pool.getConnection, hash: bcrypt.hash, notify: telegram.notifyUserRegistered, secret: process.env.JWT_ACCESS_SECRET };
    process.env.JWT_ACCESS_SECRET = "synthetic-referral-test-secret-not-used-in-production";
    const settings = { enabled: true, rewardAmount: 5000, minimumTopup: 50000, attributionDays: 30, version: 1 };
    const seen = [];
    let existing = false; let commits = 0; let rollbacks = 0;
    const query = async (sql, params = []) => {
        seen.push({ sql, params });
        if (sql.startsWith("SELECT status, auth_version")) return [[{ status: "active", auth_version: 0 }]];
        if (sql.startsWith("SELECT id, status, role, currency FROM users WHERE id =")) return [[{ id: params[0], status: "active", role: "user", currency: "COP" }]];
        if (sql.startsWith("SELECT setting_value")) return [[{ setting_value: JSON.stringify(settings) }]];
        if (sql.startsWith("SELECT code FROM referral_codes")) return [[{ code: "SB0123456789" }]];
        if (sql.startsWith("SELECT id, progress_amount")) return [[]];
        if (sql.startsWith("SELECT id FROM referrals WHERE referred_user_id")) return [[{ id: 99 }]];
        if (sql.startsWith("UPDATE referrals SET contact_consent_at")) return [{ affectedRows: 1 }];
        if (sql.startsWith("SELECT COUNT(*) AS total")) return [[{ total: 1, credited: 0, review: 0, pending: 1, awarded: 0 }]];
        if (sql.startsWith("SELECT r.*")) return [[{ id: 3, status: "pending", referrer_user_id: 7, referred_user_id: 42, referred_email: "private@example.test", referred_name: "Private", reward_amount: 5000, minimum_topup: 50000, first_topup_id: 500, first_topup_amount: 50000 }]];
        if (sql.startsWith("SELECT id FROM users WHERE email")) return [existing ? [{ id: 42 }] : []];
        if (sql.startsWith("INSERT INTO users")) return [{ insertId: 42 }];
        if (sql.startsWith("SELECT UTC_TIMESTAMP")) return [[{ now_utc: new Date("2026-11-01T12:00:00Z") }]];
        if (sql.startsWith("SELECT u.id, u.status")) return [[{ id: 7, status: "active", role: "user", currency: "COP" }]];
        if (sql.startsWith("INSERT INTO referrals")) return [{ insertId: 3 }];
        if (sql.startsWith("INSERT INTO referral_audit_log")) return [{ insertId: 1 }];
        throw new Error("Unexpected synthetic query");
    };
    pool.query = query;
    pool.getConnection = async () => ({ query, beginTransaction: async () => {}, commit: async () => { commits += 1; }, rollback: async () => { rollbacks += 1; }, release() {} });
    bcrypt.hash = async () => "synthetic-password-hash";
    telegram.notifyUserRegistered = async () => {};
    const app = express(); app.use(express.json());
    app.use("/api", require("../src/routes/referrals"));
    app.use("/api/auth", require("../src/routes/auth"));
    const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    const base = "http://127.0.0.1:" + server.address().port;
    const token = role => jwt.sign({ sub: 7, role, authVersion: 0 }, process.env.JWT_ACCESS_SECRET, { expiresIn: "5m" });
    const request = (path, role, method = "GET", body) => fetch(base + path, { method, headers: { ...(role ? { Authorization: "Bearer " + token(role) } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    try {
        await t.test("anonymous and non-admin clients cannot reach admin reads or writes", async () => {
            for (const [path, method] of [["/api/admin/referrals", "GET"], ["/api/admin/referrals/export", "GET"], ["/api/admin/referrals/settings", "PUT"], ["/api/admin/referrals/3/cancel", "POST"], ["/api/admin/referrals/3/retry", "POST"], ["/api/admin/referrals/3/reverse", "POST"]]) {
                assert.equal((await request(path, null, method, method === "GET" ? undefined : {})).status, 401);
                assert.equal((await request(path, "user", method, method === "GET" ? undefined : {})).status, 403);
            }
        });
        await t.test("public terms do not disclose identities or administrative settings", async () => {
            const response = await request("/api/referrals/campaign");
            assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
            const data = await response.json();
            assert.equal(data.campaign.active, true);
            for (const key of ["monthlyBudget", "monthlyRewardLimit", "email", "referrerName"]) assert.equal(Object.hasOwn(data.campaign, key), false);
        });
        await t.test("the user endpoint ignores user IDs supplied by the client and redacts invited data", async () => {
            const response = await request("/api/referrals/me?userId=999", "user");
            assert.equal(response.status, 200);
            const data = await response.json();
            assert.equal(data.items.length, 1); assert.equal(data.items[0].referredEmail, null);
            const historyQuery = seen.find(entry => entry.sql.startsWith("SELECT COUNT(*) AS total"));
            assert.equal(historyQuery.params[0], 7);
        });
        await t.test("a client can revoke only their own invitation's contact consent", async () => {
            const response = await request("/api/referrals/contact-consent", "user", "PUT", { consent: false, userId: 42 });
            assert.equal(response.status, 200);
            const lookup = seen.find(entry => entry.sql.startsWith("SELECT id FROM referrals WHERE referred_user_id"));
            assert.deepEqual(lookup.params, [7]);
            assert.equal((await request("/api/referrals/contact-consent", "user", "PUT", { consent: "yes" })).status, 400);
        });
        await t.test("invalid referral signup rolls back the newly inserted account", async () => {
            const response = await request("/api/auth/register", null, "POST", { name: "Synthetic New Client", email: "new@example.test", password: "synthetic-password-only", referralCode: "INVALID", referralConsent: true });
            assert.equal(response.status, 400);
            const noConsent = await request("/api/auth/register", null, "POST", { name: "Synthetic New Client", email: "new@example.test", password: "synthetic-password-only", referralCode: "SB0123456789" });
            assert.equal(noConsent.status, 400); assert.equal(rollbacks, 2);
        });
        await t.test("valid signup atomically stores the campaign snapshot and existing users cannot be retrofitted", async () => {
            const beforeCommits = commits;
            const response = await request("/api/auth/register", null, "POST", { name: "Synthetic New Client", email: "new@example.test", password: "synthetic-password-only", referralCode: "SB0123456789", referralConsent: true });
            assert.equal(response.status, 201); assert.equal(commits, beforeCommits + 1);
            const attribution = seen.find(entry => entry.sql.startsWith("INSERT INTO referrals"));
            assert.deepEqual(attribution.params.slice(0, 6), [7, 42, "SB0123456789", 1, 5000, 50000]);
            existing = true;
            const count = seen.filter(entry => entry.sql.startsWith("INSERT INTO referrals")).length;
            assert.equal((await request("/api/auth/register", null, "POST", { name: "Existing", email: "new@example.test", password: "synthetic-password-only", referralCode: "SB0123456789" })).status, 201);
            assert.equal(seen.filter(entry => entry.sql.startsWith("INSERT INTO referrals")).length, count);
        });
        await t.test("admin validation rejects invalid identifiers, fields and stale edits", async () => {
            assert.equal((await request("/api/admin/referrals/not-an-id", "admin")).status, 400);
            assert.equal((await request("/api/admin/referrals/settings", "admin", "PUT", { unexpected: true })).status, 400);
            assert.equal((await request("/api/admin/referrals/settings", "admin", "PUT", { expectedVersion: 0, enabled: false })).status, 409);
        });
    } finally {
        await new Promise(resolve => server.close(resolve));
        pool.query = original.query; pool.getConnection = original.connection;
        bcrypt.hash = original.hash; telegram.notifyUserRegistered = original.notify;
        if (original.secret === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = original.secret;
    }
});
