const test = require("node:test");
const assert = require("node:assert/strict");

const {
    strbxReportedNetflixAccountSql,
    canSellStrbxReportedNetflixAccount,
    isStrbxReportedNetflixProviderAccount,
} = require("../src/utils/strbxReportedAccounts");
const { renewSubscription } = require("../src/services/renewal.service");

test("STRBX Netflix report matching is email scoped across Netflix platform variants", () => {
    const sql = strbxReportedNetflixAccountSql("account_row");
    assert.match(sql, /LOWER\(TRIM\(reported_provider_account\.account_email\)\) = LOWER\(TRIM\(account_row\.email\)\)/);
    assert.match(sql, /provider_reported_at IS NOT NULL/);
    assert.match(sql, /account_platform\.name/);
    assert.match(sql, /streaming box/);
    assert.match(sql, /netflix/);
    assert.throws(() => strbxReportedNetflixAccountSql("pa; DROP TABLE users"), /Alias SQL/);
});

test("only the administrator who recorded a provider report may sell the matched Netflix account", () => {
    assert.equal(canSellStrbxReportedNetflixAccount(null, 1), true);
    assert.equal(canSellStrbxReportedNetflixAccount({ reportedBy: 1 }, 1), true);
    assert.equal(canSellStrbxReportedNetflixAccount({ reportedBy: 1 }, 2), false);
    assert.equal(canSellStrbxReportedNetflixAccount({ reportedBy: null }, 1), false);
});

test("provider-side renewal policy identifies only reported Streaming Box Netflix accounts", () => {
    assert.equal(isStrbxReportedNetflixProviderAccount({
        providerName: "Streaming Box",
        platformName: "Netflix Internacional",
        providerReportedAt: "2026-10-12 10:00",
    }), true);
    assert.equal(isStrbxReportedNetflixProviderAccount({
        providerName: "Streaming Box",
        platformName: "Spotify",
        providerReportedAt: "2026-10-12 10:00",
    }), false);
    assert.equal(isStrbxReportedNetflixProviderAccount({
        providerName: "Jeff Premium",
        platformName: "Netflix",
        providerReportedAt: "2026-10-12 10:00",
    }), false);
    assert.equal(isStrbxReportedNetflixProviderAccount({
        providerName: "Streaming Box",
        platformName: "Promo",
        providerReportedAt: "2026-10-12 10:00",
    }), true);
});

test("reported Streaming Box Netflix subscriptions are blocked by the renewal service", async () => {
    const queries = [];
    const conn = {
        async query(sql, params) {
            queries.push({ sql, params });
            return [[{ id: 77, strbx_provider_reported: 1 }]];
        },
    };

    await assert.rejects(
        renewSubscription({ conn, subscriptionId: 77, actorUserId: 1, actorRole: "admin" }),
        (error) => error.status === 400 && /reportada al proveedor y no admite renovaciones/.test(error.message)
    );
    assert.equal(queries.length, 1);
    assert.match(queries[0].sql, /provider_reported_at IS NOT NULL/);
});

test("admin renewing their own overdue subscription through customer self-service is not blocked by the admin cutoff", async () => {
    const reachedRecentRenewalCheck = new Error("Reached recent-renewal check");
    const conn = {
        async query(sql) {
            if (sql.includes("SELECT s.id, s.user_id")) {
                return [[{
                    id: 77,
                    user_id: 1,
                    expires_at: "2020-01-01",
                    subscription_price: 3000,
                    currency: "COP",
                    status: "active",
                    is_attended: 0,
                    days: 30,
                    platform_name: "Netflix",
                    platform_slug: "netflix",
                    strbx_provider_reported: 0,
                    is_renewable: 1,
                    renewable_price: 3000,
                }]];
            }
            if (sql.includes("COUNT(*) AS renewal_count")) return [[{ renewal_count: 0 }]];
            if (sql.includes("SELECT renewal_order_code")) throw reachedRecentRenewalCheck;
            throw new Error("Unexpected query in renewal test");
        },
    };

    await assert.rejects(
        renewSubscription({
            conn,
            subscriptionId: 77,
            actorUserId: 1,
            actorRole: "admin",
            customerInitiated: true,
        }),
        (error) => error === reachedRecentRenewalCheck
    );
});

test("admin customer self-service cannot renew another user's subscription", async () => {
    let renewalStatsRead = false;
    const conn = {
        async query(sql) {
            if (sql.includes("SELECT s.id, s.user_id")) {
                return [[{ id: 77, user_id: 2, strbx_provider_reported: 0 }]];
            }
            if (sql.includes("COUNT(*) AS renewal_count")) {
                renewalStatsRead = true;
                return [[{ renewal_count: 0 }]];
            }
            throw new Error("Unexpected query in renewal authorization test");
        },
    };

    await assert.rejects(
        renewSubscription({
            conn,
            subscriptionId: 77,
            actorUserId: 1,
            actorRole: "admin",
            customerInitiated: true,
        }),
        (error) => error.status === 403 && /No autorizado/.test(error.message)
    );
    assert.equal(renewalStatsRead, true);
});
