const test = require("node:test");
const assert = require("node:assert/strict");
const {
    buildExpirationCtes,
    buildExpirationDatePredicates,
    buildLaterSubscriptionExclusionSql,
} = require("../src/services/expirationQuery.service");

test("expiration date filters use exclusive datetime bounds without wrapping expires_at", () => {
    const upcoming = buildExpirationDatePredicates({ includeUpcomingWindow: true });
    assert.match(upcoming[0], /s\.expires_at < DATE_ADD\(DATE\(CONVERT_TZ/);
    assert.match(upcoming[0], /INTERVAL 8 DAY/);
    assert.doesNotMatch(upcoming[0], /DATE\(s\.expires_at\)/);

    const expired = buildExpirationDatePredicates({ expiryFilter: "vencidos", includeUpcomingWindow: false });
    assert.equal(expired.length, 1);
    assert.match(expired[0], /s\.expires_at < DATE\(CONVERT_TZ/);

    const dueToday = buildExpirationDatePredicates({ expiryFilter: "hoy", includeUpcomingWindow: false });
    assert.equal(dueToday.length, 2);
    assert.match(dueToday[0], /s\.expires_at >= DATE\(CONVERT_TZ/);
    assert.match(dueToday[1], /s\.expires_at < DATE_ADD\(DATE\(CONVERT_TZ.*INTERVAL 1 DAY/);
});

test("latest order CTE keeps the same deterministic order used by expiration details", () => {
    const sql = buildExpirationCtes({ includeAccountFirstExpiration: true });
    assert.match(sql, /ROW_NUMBER\(\) OVER/);
    assert.match(sql, /ORDER BY o\.created_at DESC, oi\.id DESC/);
    assert.match(sql, /account_first_expiration AS/);
    assert.match(sql, /MIN\(DATE\(expires_at\)\)/);
});

test("resold-account exclusion compares precomputed latest order dates", () => {
    const sql = buildLaterSubscriptionExclusionSql();
    assert.equal((sql.match(/NOT EXISTS/g) || []).length, 2);
    assert.match(sql, /latest_subscription_orders later_order/);
    assert.match(sql, /later_order\.created_at > COALESCE\(current_order\.created_at/);
    assert.match(sql, /acc_later\.identity_id = acc\.identity_id/);
    assert.match(sql, /acc_later\.email = acc\.email/);
    assert.match(sql, /platform_fallbacks pf/);
    assert.doesNotMatch(sql, /JOIN orders o_later/);
    assert.doesNotMatch(sql, /SELECT MAX\(o_current\.created_at\)/);
});
