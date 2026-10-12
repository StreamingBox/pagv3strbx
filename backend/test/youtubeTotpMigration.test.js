const assert = require("node:assert/strict");
const test = require("node:test");
const migration = require("../src/migrations/050_youtube_totp_shared_google_email");

test("shared YouTube OTP migration backfills encrypted secrets by normalized Google email", async () => {
    const calls = [];
    await migration.up({ query: async (sql) => calls.push(sql) });

    assert.match(calls[0], /CREATE TABLE IF NOT EXISTS youtube_google_totp_secrets/);
    assert.match(calls[0], /email_normalized VARCHAR\(320\) NOT NULL PRIMARY KEY/);
    assert.match(calls[1], /INSERT IGNORE INTO youtube_google_totp_secrets/);
    assert.match(calls[1], /LOWER\(TRIM\(a\.email\)\)/);
    assert.match(calls[1], /FROM platform_account_totp_secrets/);
    assert.match(calls[1], /ORDER BY secret\.updated_at DESC/);
});
