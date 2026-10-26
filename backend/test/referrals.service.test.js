const test = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/services/referrals.service");

const now = new Date("2026-11-01T14:00:00Z");
function fixture(options = {}) {
    const referral = { id: 10, referrer_user_id: 1, referred_user_id: 2, status: "pending", reward_amount: 10000, minimum_topup: 50000, progress_amount: 0, created_at: new Date("2026-10-31T14:00:00Z"), expires_at: new Date("2026-12-01T14:00:00Z"), ...options.referral };
    const settings = { ...service.DEFAULT_SETTINGS, rewardAmount: 10000, ...options.settings };
    const wallet = { id: 1, balance: 10000, currency: "COP", ...options.wallet };
    const credits = []; const notifications = []; const events = [];
    const contributions = new Map();
    let usage = options.usage || 0;
    const db = { async query(sql, params = []) {
        if (sql.startsWith("SELECT * FROM referrals")) return [[{ ...referral }]];
        if (sql.startsWith("SELECT UTC_TIMESTAMP")) return [[{ now_utc: now }]];
        if (sql.startsWith("INSERT IGNORE INTO referral_topups")) {
            if (contributions.has(params[0])) return [{ affectedRows: 0 }];
            contributions.set(params[0], { id: params[0], user_id: 2, amount: params[2], contribution_amount: params[2], contribution_approved_at: params[3], currency: "COP", status: "approved" });
            return [{ affectedRows: 1 }];
        }
        if (sql.startsWith("UPDATE referrals SET progress_amount")) { referral.progress_amount = params[0]; return [{}]; }
        if (sql.startsWith("UPDATE referrals SET qualifying_topup_id")) { Object.assign(referral, { qualifying_topup_id: params[0], qualified_at: params[1] }); return [{}]; }
        if (sql.startsWith("SELECT p.amount")) return [[...contributions.values()]];
        if (sql.startsWith("UPDATE referrals SET status = ?")) { referral.status = params[0]; referral.reason = params[1]; return [{}]; }
        if (sql.startsWith("SELECT id, status, role, currency FROM users")) return [[{ id: 1, status: options.inactive ? "inactive" : "active", role: "user", currency: "COP" }, { id: 2, status: "active", role: "user", currency: "COP" }]];
        if (sql.startsWith("SELECT id, balance, currency FROM wallets")) return [[{ ...wallet }]];
        if (sql.startsWith("SELECT setting_value")) return [[{ setting_value: JSON.stringify(settings) }]];
        if (sql.startsWith("SELECT id FROM referrals")) return [Array.from({ length: options.creditedCount || 0 }, (_, id) => ({ id }))];
        if (sql.startsWith("SELECT total_awarded")) return [[{ total_awarded: usage }]];
        if (sql.startsWith("UPDATE wallets")) { wallet.balance = params[0]; return [{}]; }
        if (sql.startsWith("INSERT INTO wallet_transactions")) { if (options.failCredit) throw new Error("fake_storage_failure"); credits.push(params); return [{ insertId: 100 }]; }
        if (sql.startsWith("UPDATE referrals SET status = 'credited'")) { referral.status = "credited"; referral.wallet_transaction_id = params[0]; return [{}]; }
        if (sql.startsWith("UPDATE referral_budget_usage")) { usage += params[0]; return [{}]; }
        if (sql.startsWith("INSERT INTO user_notifications")) { notifications.push(params); return [{}]; }
        if (sql.startsWith("INSERT INTO referral_audit_log")) { events.push(params); return [{}]; }
        if (sql.startsWith("INSERT IGNORE INTO referral_budget_usage")) return [{}];
        throw new Error("Unexpected test SQL: " + sql);
    } };
    return { db, referral, settings, wallet, credits, notifications, events };
}
const topup = { id: 20, user_id: 2, amount: 50000, currency: "COP", status: "approved" };

test("referral campaign is opt-in, validates money and date settings", () => {
    assert.equal(service.campaignStatus(service.DEFAULT_SETTINGS, now).active, false);
    assert.throws(() => service.validateSettings({ enabled: true, rewardAmount: 0 }), /mayor a cero/);
    for (const invalid of [NaN, Infinity, -1, "5000", 1.5]) assert.throws(() => service.validateSettings({ rewardAmount: invalid }));
    assert.throws(() => service.validateSettings({ rewardAmount: 60000 }), /superar/);
    assert.throws(() => service.validateSettings({ startsAt: "invalid" }));
    assert.throws(() => service.validateSettings({ startsAt: "2026-12-01", endsAt: "2026-11-01" }));
    assert.equal(service.campaignStatus({ enabled: true, rewardAmount: 5000, startsAt: "2026-11-02T00:00:00Z" }, now).active, false);
    assert.equal(service.campaignStatus({ enabled: true, rewardAmount: 5000, endsAt: now.toISOString() }, now).active, false);
    assert.equal(service.campaignStatus({ enabled: true, rewardAmount: 5000, startsAt: now.toISOString() }, now).active, true);
});

test("eligibility excludes inactive users, other currencies and administrators", () => {
    assert.equal(service.isEligibleUser({ status: "active", role: "user", currency: "COP" }), true);
    for (const user of [{ status: "pending", role: "user", currency: "COP" }, { status: "active", role: "admin", currency: "COP" }, { status: "active", role: "user", currency: "USD" }, null]) assert.equal(service.isEligibleUser(user), false);
});

test("awards the snapshotted amount once even after the campaign is paused or changed", async () => {
    const f = fixture({ settings: { enabled: false, rewardAmount: 15000 } });
    assert.deepEqual(await service.processTopupReferral(f.db, topup), { status: "credited", amount: 10000 });
    assert.equal(f.wallet.balance, 20000);
    assert.equal(f.credits.length, 1);
    assert.equal(f.credits[0][1], 10000);
    assert.equal(f.notifications.length, 1);
    assert.equal((await service.processTopupReferral(f.db, topup)).status, "unchanged");
    assert.equal(f.credits.length, 1);
});

test("accumulates multiple approved principals, excludes promo bonus and never counts a source twice", async () => {
    const f = fixture();
    assert.deepEqual(await service.processTopupReferral(f.db, { ...topup, amount: 20000, promo_bonus_amount: 5000 }), { status: "pending", progressAmount: 20000, remainingAmount: 30000 });
    assert.equal((await service.processTopupReferral(f.db, { ...topup, amount: 20000 })).status, "unchanged");
    assert.equal((await service.processTopupReferral(f.db, { ...topup, id: 21, amount: 15000 })).remainingAmount, 15000);
    assert.equal(f.credits.length, 0);
    assert.equal((await service.processTopupReferral(f.db, { ...topup, id: 22, amount: 15000 })).amount, 10000);
    assert.equal(f.referral.progress_amount, 50000);
    assert.equal(f.credits.length, 1);
});

test("expires at the boundary and never rewards other currencies", async () => {
    const f = fixture({ referral: { expires_at: now } });
    assert.equal((await service.processTopupReferral(f.db, topup)).status, "expired");
    const other = fixture();
    assert.equal((await service.processTopupReferral(other.db, { ...topup, currency: "USD" })).status, "unchanged");
    assert.equal(other.credits.length, 0);
    const partial = fixture({ referral: { progress_amount: 20000, expires_at: now } });
    assert.equal((await service.processTopupReferral(partial.db, { ...topup, amount: 30000 })).status, "expired");
    assert.equal(partial.referral.progress_amount, 20000);
    assert.equal(partial.credits.length, 0);
});

test("budget and monthly caps hold the reward rather than losing it", async () => {
    const f = fixture({ usage: 9000, settings: { monthlyBudget: 10000 } });
    assert.equal((await service.processTopupReferral(f.db, topup)).reason, "monthly_budget");
    assert.equal(f.credits.length, 0);
    f.settings.monthlyBudget = 20000;
    assert.equal((await service.processTopupReferral(f.db, topup, { retry: true, actorUserId: 8 })).status, "credited");
    assert.equal(f.credits.length, 1);
    const capped = fixture({ creditedCount: 1, settings: { monthlyRewardLimit: 1 } });
    assert.equal((await service.processTopupReferral(capped.db, topup)).reason, "monthly_limit");
});

test("holds inactive or mismatched wallets and validates the approved source on retry", async () => {
    const inactive = fixture({ inactive: true });
    assert.equal((await service.processTopupReferral(inactive.db, topup)).reason, "user_not_eligible");
    const currency = fixture({ wallet: { currency: "USD" } });
    assert.equal((await service.processTopupReferral(currency.db, topup)).reason, "wallet_currency");
    await assert.rejects(service.processTopupReferral(currency.db, { ...topup, status: "rejected" }, { retry: true }), /no está aprobada/);
    assert.equal(inactive.credits.length + currency.credits.length, 0);
});

test("unexpected credit failures propagate to the caller's transaction", async () => {
    const f = fixture({ failCredit: true });
    await assert.rejects(service.processTopupReferral(f.db, topup), /fake_storage_failure/);
});

test("date filters use inclusive Bogota dates and bind hostile search strings", () => {
    const f = service.buildFilters({ from: "2026-10-26", to: "2026-10-26", search: "' OR 1=1 --", status: "review" });
    assert.equal(f.params[1].toISOString(), "2026-10-26T05:00:00.000Z");
    assert.equal(f.params[2].toISOString(), "2026-10-27T05:00:00.000Z");
    assert.equal(f.where.includes("OR 1=1 --"), false);
    for (const day of ["2026-02-30", "invalid", "2026-99-01"]) assert.throws(() => service.buildFilters({ from: day }), /Fecha/);
    assert.throws(() => service.buildFilters({ from: "2026-10-27", to: "2026-10-26" }), /rango/);
    assert.throws(() => service.buildFilters({ status: "anything" }), /Estado/);
    const own = service.buildFilters({ search: "someone@example.test" }, 7);
    assert.deepEqual(own.params, [7]);
    assert.equal(own.where.includes("invitee"), false);
});

test("progress and contact are shared only with consent; payments and wallet IDs remain admin-only", () => {
    const row = { id: 1, status: "pending", reward_amount: 10000, minimum_topup: 50000, progress_amount: 20000, referred_email: "private@example.test", referred_name: "Private Test", referrer_user_id: 8, referred_user_id: 9, qualifying_topup_id: 22, wallet_transaction_id: 100 };
    const own = service.mapReferral(row);
    for (const key of ["referredEmail", "referredName", "progressAmount", "remainingAmount"]) assert.equal(own[key], null);
    for (const key of ["referrerId", "referredId", "qualifyingTopupId", "transactionId"]) assert.equal(Object.hasOwn(own, key), false);
    const authorized = service.mapReferral({ ...row, contact_consent_at: now });
    assert.equal(authorized.referredEmail, row.referred_email); assert.equal(authorized.progressAmount, 20000); assert.equal(authorized.remainingAmount, 30000);
    assert.equal(service.mapReferral(row, true).referredEmail, row.referred_email);
});

test("month caps follow Bogota midnight, including year rollover", () => {
    assert.equal(service.monthBounds(new Date("2027-01-01T04:59:59Z")).key, "2026-12");
    const month = service.monthBounds(new Date("2027-01-01T05:00:00Z"));
    assert.equal(month.start.toISOString(), "2027-01-01T05:00:00.000Z");
    assert.equal(month.end.toISOString(), "2027-02-01T05:00:00.000Z");
});

test("email invitation tokens are hashed, bound to one email, and consumed with registration", async () => {
    const token = "a".repeat(64);
    const invite = {
        id: 71, referrer_user_id: 1, recipient_email: "new@example.test", recipient_email_key: "new@example.test",
        token_hash: service.hashEmailInviteToken(token), referral_code: "SB0123456789", settings_version: 4,
        reward_amount: 10000, minimum_topup: 50000, attribution_days: 30,
        expires_at: new Date("2026-11-08T14:00:00Z"), used_at: null, revoked_at: null,
    };
    const inserted = [];
    const db = { async query(sql, params = []) {
        if (sql.startsWith("SELECT * FROM referral_email_invites")) {
            return [[params[0] === invite.token_hash && !invite.used_at && invite.expires_at > now ? { ...invite } : undefined].filter(Boolean)];
        }
        if (sql.startsWith("SELECT UTC_TIMESTAMP")) return [[{ now_utc: now }]];
        if (sql.startsWith("SELECT id, status, role, currency FROM users")) return [[{ id: 1, status: "active", role: "user", currency: "COP" }]];
        if (sql.startsWith("INSERT INTO referrals")) { inserted.push(params); return [{ insertId: 82 }]; }
        if (sql.startsWith("UPDATE referral_email_invites")) {
            invite.used_at = params[0]; invite.registered_user_id = params[1];
            return [{ affectedRows: 1 }];
        }
        if (sql.startsWith("INSERT INTO referral_audit_log")) return [{ insertId: 1 }];
        throw new Error("Unexpected invitation SQL: " + sql);
    } };

    await assert.rejects(service.attachReferral(db, { userId: 2, inviteToken: token, email: "other@example.test", contactConsent: true }), /correo al que se envió/);
    assert.equal(invite.used_at, null);
    assert.equal(inserted.length, 0);

    assert.equal(await service.attachReferral(db, { userId: 2, inviteToken: token, email: " NEW@example.test ", contactConsent: true }), true);
    assert.equal(inserted.length, 1);
    assert.deepEqual(inserted[0].slice(0, 6), [1, 2, "SB0123456789", 4, 10000, 50000]);
    assert.equal(invite.registered_user_id, 2);
    await assert.rejects(service.attachReferral(db, { userId: 3, inviteToken: token, email: "new@example.test", contactConsent: true }), /ya se usó/);
    assert.equal(inserted.length, 1);
});

test("invite preview returns only a live, unregistered recipient and never consumes the token", async () => {
    const token = "b".repeat(64);
    const hash = service.hashEmailInviteToken(token);
    let recipientExists = false;
    const db = { async query(sql, params = []) {
        if (sql.startsWith("SELECT i.recipient_email")) {
            assert.equal(params[0], hash);
            return [[{ recipient_email: "new@example.test", recipient_email_key: "new@example.test", reward_amount: 10000, minimum_topup: 50000, attribution_days: 30, expires_at: now, referrer_name: "Synthetic Inviter" }]];
        }
        if (sql.startsWith("SELECT id FROM users WHERE email")) return [recipientExists ? [{ id: 2 }] : []];
        throw new Error("Unexpected preview SQL: " + sql);
    } };
    const invite = await service.getEmailInvite(token, db);
    assert.equal(invite.email, "new@example.test");
    assert.equal(invite.inviterName, "Synthetic Inviter");
    assert.equal(invite.campaign.minimumTopup, 50000);
    recipientExists = true;
    assert.equal(await service.getEmailInvite(token, db), null);
    assert.throws(() => service.hashEmailInviteToken("not-a-token"), /no está disponible/);
});
