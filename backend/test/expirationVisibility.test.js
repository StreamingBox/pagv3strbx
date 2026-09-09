const assert = require("node:assert/strict");
const test = require("node:test");
const {
    excludeInactiveMasterAccountSql,
    excludeManuallyHiddenExpirationSql,
} = require("../src/services/expirationVisibility.service");

test("expiration visibility excludes the exact inactive master account", () => {
    const sql = excludeInactiveMasterAccountSql();
    assert.match(sql, /ma\.status = 'inactive'/);
    assert.match(sql, /LOWER\(TRIM\(ma\.account_email\)\) = LOWER\(TRIM\(acc\.email\)\)/);
    assert.match(sql, /ma\.platform_id IN \(/);
});

test("expiration visibility can be reused with qualified aliases", () => {
    const sql = excludeInactiveMasterAccountSql({ subscriptionAlias: "sub", accountAlias: "account" });
    assert.match(sql, /COALESCE\(account\.email, ''\)/);
    assert.match(sql, /sub\.delivered_platform_id/);
});

test("manual expiration dismissals stay hidden by subscription", () => {
    const sql = excludeManuallyHiddenExpirationSql({ subscriptionAlias: "sub" });
    assert.equal(sql, "sub.expiration_hidden_at IS NULL");
});
