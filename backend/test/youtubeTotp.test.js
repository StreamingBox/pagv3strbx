const assert = require("node:assert/strict");
const test = require("node:test");
const {
    decryptTotpSecret,
    encryptTotpSecret,
    generateTotp,
    getSubscriptionTotp,
    isYoutubeTotpProduct,
    normalizeGoogleEmail,
    normalizeTotpSecret,
    verifyTotpCode,
    waitForFreshTotpPeriod,
} = require("../src/services/youtubeTotp.service");

const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const KEY = "a".repeat(64);

function createTotpDb(row) {
    const requestLimit = { count: 0, windowExpired: false };
    return {
        requestLimit,
        query: async () => [[row]],
        getConnection: async () => ({
            beginTransaction: async () => {},
            query: async (sql) => {
                if (sql.includes("INSERT IGNORE INTO youtube_totp_request_limits")) return [{ affectedRows: 1 }];
                if (sql.includes("SELECT request_count")) {
                    return [[{
                        request_count: requestLimit.count,
                        window_expired: Number(requestLimit.windowExpired),
                    }]];
                }
                if (sql.includes("UPDATE youtube_totp_request_limits")) {
                    requestLimit.count += 1;
                    return [{ affectedRows: 1 }];
                }
                assert.fail(`Unexpected SQL in TOTP request limit test: ${sql}`);
            },
            commit: async () => {},
            rollback: async () => {},
            release: () => {},
        }),
    };
}

test("generates the RFC 6238 six-digit SHA-1 test code", () => {
    assert.equal(generateTotp(RFC_SECRET, 59_000), "287082");
});

test("verifies an enrollment code across adjacent 30-second boundaries", () => {
    assert.equal(verifyTotpCode(RFC_SECRET, "287082", 60_001), true);
    assert.equal(verifyTotpCode(RFC_SECRET, "287082", 59_000), true);
    assert.equal(verifyTotpCode(RFC_SECRET, "000000", 59_000), false);
    assert.equal(verifyTotpCode(RFC_SECRET, "12345", 59_000), false);
});

test("waits for a fresh TOTP period instead of returning a code near expiry", async () => {
    let now = 59_000;
    const waits = [];
    const generationTime = await waitForFreshTotpPeriod({
        clock: () => now,
        wait: async (ms) => {
            waits.push(ms);
            now += ms;
        },
    });

    assert.deepEqual(waits, [1_250]);
    assert.equal(generationTime, 60_250);
    assert.equal(Math.ceil((90_000 - generationTime) / 1_000), 30);

    let waitCalled = false;
    const nearBoundary = await waitForFreshTotpPeriod({
        clock: () => 60_100,
        wait: async () => { waitCalled = true; },
    });
    assert.equal(nearBoundary, 60_100);
    assert.equal(waitCalled, false);
});

test("normalizes a Base32 key or extracts the secret from an otpauth URI", () => {
    assert.equal(normalizeTotpSecret(` ${RFC_SECRET.slice(0, 16)} ${RFC_SECRET.slice(16)} `), RFC_SECRET);
    assert.equal(normalizeTotpSecret(`otpauth://totp/Google:user@example.com?secret=${RFC_SECRET}&issuer=Google`), RFC_SECRET);
});

test("encrypts the authenticator seed and rejects tampering", () => {
    const encrypted = encryptTotpSecret(RFC_SECRET, KEY);
    assert.notEqual(encrypted.ciphertext.toString("utf8"), RFC_SECRET);
    assert.equal(decryptTotpSecret(encrypted, KEY), RFC_SECRET);
    encrypted.ciphertext[0] ^= 1;
    assert.throws(() => decryptTotpSecret(encrypted, KEY));
});

test("rejects missing or malformed encryption keys and secrets", () => {
    assert.throws(() => encryptTotpSecret(RFC_SECRET, "missing"), /clave de cifrado TOTP/);
    assert.throws(() => normalizeTotpSecret("123456"), /Base32/);
});

test("matches YouTube Premium, Music and the three-month plan, but excludes unrelated platforms", () => {
    assert.equal(isYoutubeTotpProduct("YouTube Premium"), true);
    assert.equal(isYoutubeTotpProduct("youtube-premium"), true);
    assert.equal(isYoutubeTotpProduct("YouTube Music"), true);
    assert.equal(isYoutubeTotpProduct("youtube-music"), true);
    assert.equal(isYoutubeTotpProduct("Youtube 3 meses"), true);
    assert.equal(isYoutubeTotpProduct("youtube-3-meses"), true);
    assert.equal(isYoutubeTotpProduct("Enlaces LigaBetPlay Youtube"), false);
    assert.equal(isYoutubeTotpProduct("Spotify Premium"), false);
});

test("returns a current code for the authenticated user's active YouTube Premium, Music or three-month subscription", async () => {
    const encrypted = encryptTotpSecret(RFC_SECRET, KEY);
    const calls = [];
    const db = createTotpDb({
        subscription_id: 81,
        subscription_status: "active",
        subscription_expired: 0,
        platform_account_id: 55,
        platform_name: "YouTube Premium",
        encrypted_secret: encrypted.ciphertext,
        secret_iv: encrypted.iv,
        secret_auth_tag: encrypted.authTag,
    });
    db.query = async (sql, params) => {
        calls.push({ sql, params });
        return [[{
            subscription_id: 81,
            subscription_status: "active",
            subscription_expired: 0,
            platform_account_id: 55,
            platform_name: "YouTube Premium",
            encrypted_secret: encrypted.ciphertext,
            secret_iv: encrypted.iv,
            secret_auth_tag: encrypted.authTag,
        }]];
    };

    for (const platform_name of ["YouTube Premium", "YouTube Music", "Youtube 3 meses"]) {
        db.query = async (sql, params) => {
            calls.push({ sql, params });
            return [[{
                subscription_id: 81,
                subscription_status: "active",
                subscription_expired: 0,
                platform_account_id: 55,
                platform_name,
                encrypted_secret: encrypted.ciphertext,
                secret_iv: encrypted.iv,
                secret_auth_tag: encrypted.authTag,
            }]];
        };
        const result = await getSubscriptionTotp({ subscriptionId: 81, userId: 17, now: 59_000, db, keyValue: KEY });
        assert.equal(result.code, "287082");
        assert.equal(result.expiresAt, 60_000);
        assert.equal(result.validForSeconds, 1);
    }
    assert.deepEqual(calls.map(({ params }) => params), [[81, 17], [81, 17], [81, 17]]);
    assert.ok(calls.every(({ sql }) => /s\.id = \? AND s\.user_id = \?/.test(sql)));
    assert.ok(calls.every(({ sql }) => /youtube_google_totp_secrets secret ON secret\.email_normalized = LOWER\(TRIM\(a\.email\)\)/.test(sql)));
});

test("normalizes Google account email for shared YouTube authenticator secrets", () => {
    assert.equal(normalizeGoogleEmail("  Ddsm29592@Gmail.com "), "ddsm29592@gmail.com");
    assert.throws(() => normalizeGoogleEmail("not-an-email"), { status: 400 });
});

test("allows five successful requests in the first ten minutes, then blocks the subscription", async () => {
    const encrypted = encryptTotpSecret(RFC_SECRET, KEY);
    const db = createTotpDb({
        subscription_id: 82,
        subscription_status: "active",
        subscription_expired: 0,
        platform_account_id: 56,
        platform_name: "YouTube Premium",
        encrypted_secret: encrypted.ciphertext,
        secret_iv: encrypted.iv,
        secret_auth_tag: encrypted.authTag,
    });

    for (let request = 0; request < 5; request += 1) {
        await getSubscriptionTotp({ subscriptionId: 82, userId: 17, now: 59_000, db, keyValue: KEY });
    }
    await assert.rejects(
        getSubscriptionTotp({ subscriptionId: 82, userId: 17, now: 59_000, db, keyValue: KEY }),
        { status: 429, message: /ya solicitó el código/ },
    );

    db.requestLimit.windowExpired = true;
    await assert.rejects(
        getSubscriptionTotp({ subscriptionId: 82, userId: 17, now: 59_000, db, keyValue: KEY }),
        { status: 429, message: /ya solicitó el código/ },
    );
    assert.equal(db.requestLimit.count, 5);
});

test("lets administrators inspect another user's active YouTube subscription without consuming its request limit", async () => {
    const encrypted = encryptTotpSecret(RFC_SECRET, KEY);
    const lookupCalls = [];
    const db = createTotpDb({
        subscription_id: 83,
        subscription_status: "active",
        subscription_expired: 0,
        platform_account_id: 57,
        platform_name: "YouTube Music",
        encrypted_secret: encrypted.ciphertext,
        secret_iv: encrypted.iv,
        secret_auth_tag: encrypted.authTag,
    });

    db.requestLimit.count = 5;
    db.getConnection = async () => {
        assert.fail("Administrator requests should not use the customer request counter");
    };
    db.query = async (sql, params) => {
        lookupCalls.push({ sql, params });
        return [[{
            subscription_id: 83,
            subscription_status: "active",
            subscription_expired: 0,
            platform_account_id: 57,
            platform_name: "YouTube Music",
            encrypted_secret: encrypted.ciphertext,
            secret_iv: encrypted.iv,
            secret_auth_tag: encrypted.authTag,
        }]];
    };

    const result = await getSubscriptionTotp({
        subscriptionId: 83,
        userId: 999,
        isAdmin: true,
        now: 59_000,
        db,
        keyValue: KEY,
    });

    assert.equal(result.code, "287082");
    assert.equal(db.requestLimit.count, 5);
    assert.deepEqual(lookupCalls[0].params, [83]);
    assert.match(lookupCalls[0].sql, /WHERE s\.id = \?\s+LIMIT 1/);
    assert.doesNotMatch(lookupCalls[0].sql, /s\.user_id/);
});

test("does not generate codes for expired subscriptions or other platforms", async () => {
    const base = {
        subscription_id: 81,
        subscription_status: "active",
        platform_name: "YouTube Music",
        encrypted_secret: Buffer.from("cipher"),
        secret_iv: Buffer.alloc(12),
        secret_auth_tag: Buffer.alloc(16),
    };
    const db = (row) => ({ query: async () => [[row]] });

    await assert.rejects(
        getSubscriptionTotp({ subscriptionId: 81, userId: 17, db: db({ ...base, subscription_expired: 1 }) }),
        { status: 403 },
    );
    await assert.rejects(
        getSubscriptionTotp({ subscriptionId: 81, userId: 17, db: db({ ...base, subscription_expired: 0, platform_name: "Spotify Premium" }) }),
        { status: 404 },
    );
});
