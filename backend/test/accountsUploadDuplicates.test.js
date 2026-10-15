const assert = require("node:assert/strict");
const test = require("node:test");
const {
    bulkInsertAccounts,
    createAccountOne,
    duplicateSummaryLine,
    findExactAccountDuplicate,
    findActiveAssignedScreenDuplicate,
    findReusableAccountForReload,
    isScreenCostInput,
} = require("../src/services/accounts.service");

test("duplicate guard only applies to screen cost uploads", () => {
    assert.equal(isScreenCostInput({ costMode: "PANTALLA" }), true);
    assert.equal(isScreenCostInput({ costMode: "perfil" }), true);
    assert.equal(isScreenCostInput({ costMode: "screen" }), true);
    assert.equal(isScreenCostInput({ costMode: "CUENTA" }), false);
    assert.equal(isScreenCostInput({ costMode: "" }), false);
});

test("duplicate summary includes the account and sale details", () => {
    const line = duplicateSummaryLine({
        rowNumber: 2,
        accountId: 5389,
        platformName: "Prime Video",
        email: "fatndku47@strbx.com.co",
        youtubeChannelName: "@CanalPrincipal",
        profileNumber: "1",
        assignedTo: "comprador@example.com",
        orderCode: "ORD-123",
        expiresAt: "2026-07-28 00:00:00",
    });

    assert.match(line, /Fila 2/);
    assert.match(line, /Prime Video/);
    assert.match(line, /fatndku47@strbx\.com\.co/);
    assert.match(line, /canal "@CanalPrincipal"/);
    assert.match(line, /perfil 1/);
    assert.match(line, /cuenta #5389/);
    assert.match(line, /ORD-123/);
    assert.match(line, /2026-07-28/);
});

test("duplicate lookup filters by platform, email, profile and active assigned state", async () => {
    const calls = [];
    const conn = {
        async query(sql, params) {
            calls.push({ sql, params });
            return [[{
                id: 5389,
                platform_id: 4,
                platform_name: "Prime Video",
                email: "fatndku47@strbx.com.co",
                profile_number: "1",
                effective_expires_date: "2026-07-06",
                subscription_expires_at: "2026-07-06",
                expires_at: "2026-07-05 23:06:00",
            }]];
        },
    };

    const row = await findActiveAssignedScreenDuplicate(conn, {
        pid: 4,
        emailValue: "fatndku47@strbx.com.co",
        accountProf: "1",
    });

    assert.equal(row.id, 5389);
    assert.equal(row.effective_expires_date, "2026-07-06");
    assert.deepEqual(calls[0].params, [4, "fatndku47@strbx.com.co", "1"]);
    assert.match(calls[0].sql, /AS effective_expires_date/);
    assert.match(calls[0].sql, /active_sub\.expires_at AS subscription_expires_at/);
    assert.match(calls[0].sql, /LOWER\(TRIM\(COALESCE\(pa\.status, ''\)\)\) = 'assigned'/);
    assert.match(calls[0].sql, /LOWER\(TRIM\(COALESCE\(pa\.status, ''\)\)\) NOT IN \('inactive', 'disabled', 'down', 'expired', 'legacy_review'\)/);
    assert.match(calls[0].sql, /pa\.assigned_to_user_id IS NOT NULL/);
    assert.match(calls[0].sql, /active_sub\.id IS NOT NULL/);
    assert.match(calls[0].sql, /active_sub\.id IS NULL/);
    assert.match(calls[0].sql, /pa\.expires_at IS NOT NULL/);
    assert.match(calls[0].sql, /DATE\(active_sub\.expires_at\) >= DATE\(CONVERT_TZ\(UTC_TIMESTAMP\(\), '\+00:00', '-05:00'\)\)/);
    assert.match(calls[0].sql, /CAST\(pa\.profile_number AS CHAR\) = \?/);
});

test("exact duplicate lookup ignores expired or down accounts", async () => {
    const calls = [];
    const conn = {
        async query(sql, params) {
            calls.push({ sql, params });
            return [[]];
        },
    };

    const row = await findExactAccountDuplicate(conn, {
        pid: 12,
        emailValue: "cuenta@example.com",
        accountProf: "3",
        password: "same-password",
    });

    assert.equal(row, null);
    assert.deepEqual(calls[0].params, [12, "cuenta@example.com", "3", "same-password"]);
    assert.match(calls[0].sql, /DATE\(active_sub\.expires_at\) >= DATE\(CONVERT_TZ\(UTC_TIMESTAMP\(\), '\+00:00', '-05:00'\)\)/);
    assert.match(calls[0].sql, /LOWER\(TRIM\(COALESCE\(pa\.status, ''\)\)\) IN \('available', 'assigned', 'sold'\)/);
    assert.match(calls[0].sql, /LOWER\(TRIM\(COALESCE\(pa\.status, ''\)\)\) NOT IN \('inactive', 'disabled', 'down', 'expired', 'legacy_review'\)/);
    assert.match(calls[0].sql, /pa\.expires_at IS NULL/);
});

test("YouTube duplicate lookups compare the channel as well as Google credentials", async () => {
    const calls = [];
    const conn = {
        async query(sql, params) {
            calls.push({ sql, params });
            return [[]];
        },
    };

    await findReusableAccountForReload(conn, {
        pid: 31,
        emailValue: "ddsm29592@gmail.com",
        accountProf: null,
        password: "same-password",
        youtubeChannelName: " @Strbx-2 ",
    });
    await findExactAccountDuplicate(conn, {
        pid: 31,
        emailValue: "ddsm29592@gmail.com",
        accountProf: null,
        password: "same-password",
        youtubeChannelName: " @Strbx-2 ",
    });
    await findActiveAssignedScreenDuplicate(conn, {
        pid: 31,
        emailValue: "ddsm29592@gmail.com",
        accountProf: null,
        youtubeChannelName: " @Strbx-2 ",
    });

    assert.equal(calls.length, 3);
    for (const call of calls) {
        assert.match(call.sql, /LOWER\(TRIM\(COALESCE\(pa\.youtube_channel_name, ''\)\)\) = LOWER\(TRIM\(\?\)\)/);
        assert.equal(call.params.at(-1), "@Strbx-2");
    }
});

test("bulk YouTube Music upload allows one Google login on separate channels", async () => {
    const calls = [];
    let identityCreated = false;
    let insertedAccounts = 0;
    const conn = {
        async query(sql, params) {
            calls.push({ sql, params });
            if (/SELECT id, name, slug FROM platforms WHERE id IN/i.test(sql)) {
                return [[{ id: 31, name: "YouTube Music", slug: "youtube-music" }]];
            }
            if (sql.includes("has_replacement_history")) return [[]];
            if (sql.includes("INSERT INTO account_identities")) {
                if (identityCreated) return [{ insertId: 0 }];
                identityCreated = true;
                return [{ insertId: 900 }];
            }
            if (sql.includes("SELECT id FROM account_identities")) return [[{ id: 900 }]];
            if (sql.includes("INSERT INTO platform_accounts")) {
                insertedAccounts += 1;
                return [{ insertId: 1000 + insertedAccounts }];
            }
            return [[]];
        },
    };

    const result = await bulkInsertAccounts(conn, [
        { platformId: 31, email: "ddsm29592@gmail.com", password: "same-password", youtubeChannelName: "Canal Principal" },
        { platformId: 31, email: "ddsm29592@gmail.com", password: "same-password", youtubeChannelName: "@Strbx-2" },
    ]);

    assert.equal(result.inserted, 2);
    assert.equal(result.skippedDuplicateExact, 0);
    assert.equal(insertedAccounts, 2);
    const duplicateLookups = calls.filter(({ sql }) => sql.includes("has_replacement_history"));
    assert.equal(duplicateLookups.length, 4);
    assert.ok(duplicateLookups.every(({ sql }) => sql.includes("pa.youtube_channel_name")));
    const stockNotificationChecks = calls.filter(({ sql }) =>
        sql.includes("FROM stock_subscriptions ss") && sql.includes("ss.is_notified = FALSE")
    );
    assert.equal(stockNotificationChecks.length, 1);
    assert.deepEqual(duplicateLookups.map(({ params }) => params.at(-1)), [
        "Canal Principal",
        "Canal Principal",
        "@Strbx-2",
        "@Strbx-2",
    ]);
});

test("manual YouTube Music entry checks duplicates against the selected channel", async () => {
    const calls = [];
    const conn = {
        async query(sql, params) {
            calls.push({ sql, params });
            if (/SELECT id, name, slug FROM platforms WHERE LOWER\(name\)/i.test(sql)) {
                return [[{ id: 31, name: "YouTube Music", slug: "youtube-music" }]];
            }
            if (sql.includes("has_replacement_history")) return [[]];
            if (sql.includes("INSERT INTO account_identities")) return [{ insertId: 900 }];
            if (sql.includes("INSERT INTO platform_accounts")) return [{ insertId: 1001 }];
            return [[]];
        },
    };

    const result = await createAccountOne(conn, {
        platformName: "YouTube Music",
        email: "ddsm29592@gmail.com",
        password: "same-password",
        youtubeChannelName: "@Strbx-2",
    });

    assert.equal(result.id, 1001);
    const duplicateLookups = calls.filter(({ sql }) => sql.includes("has_replacement_history"));
    assert.equal(duplicateLookups.length, 2);
    assert.ok(duplicateLookups.every(({ sql }) => sql.includes("pa.youtube_channel_name")));
    assert.ok(duplicateLookups.every(({ params }) => params.at(-1) === "@Strbx-2"));
    assert.ok(calls.some(({ sql, params }) => sql.includes("INSERT INTO platform_accounts") && params.includes("@Strbx-2")));
});

test("historical credential can be reused only without an active subscription", async () => {
    const calls = [];
    const conn = {
        async query(sql, params) {
            calls.push({ sql, params });
            return [[{
                id: 6536,
                platform_id: 9,
                platform_name: "Crunchyroll",
                email: "hajaoyg.joslynn@hotmail.com",
                profile_number: "5",
                status: "sold",
                subscription_id: null,
            }]];
        },
    };

    const row = await findReusableAccountForReload(conn, {
        pid: 9,
        emailValue: "hajaoyg.joslynn@hotmail.com",
        accountProf: "5",
        password: "koko123###",
    });

    assert.equal(row.id, 6536);
    assert.deepEqual(calls[0].params, [9, "hajaoyg.joslynn@hotmail.com", "5", "koko123###"]);
    assert.match(calls[0].sql, /active_sub\.id IS NULL/);
    assert.match(calls[0].sql, /LIMIT 1 FOR UPDATE/);
    assert.match(calls[0].sql, /LOWER\(TRIM\(COALESCE\(pa\.status, ''\)\)\) IN \('available', 'assigned', 'sold'\)/);
    assert.match(calls[0].sql, /DATE\(CONVERT_TZ\(active_sub\.expires_at, '\+00:00', '-05:00'\)\) >= DATE\(CONVERT_TZ\(UTC_TIMESTAMP\(\), '\+00:00', '-05:00'\)\)/);
});

test("bulk upload can force assigned screen duplicates when admin confirms", async () => {
    const queries = [];
    const conn = {
        async query(sql, params) {
            queries.push({ sql, params });
            if (sql.includes("has_replacement_history")) {
                return [[]];
            }
            if (/SELECT\s+pa\.id/.test(sql)) {
                throw new Error("duplicate lookup should be skipped when forcing");
            }
            if (/SELECT id, name, slug FROM platforms WHERE id IN/i.test(sql)) {
                return [[{ id: 4, name: "Prime Video", slug: "prime-video" }]];
            }
            if (sql.includes("INSERT INTO account_identities")) {
                return [{ insertId: 9001 }];
            }
            if (sql.includes("INSERT INTO platform_accounts")) {
                return [{ insertId: 9002 }];
            }
            return [[]];
        },
    };

    const out = await bulkInsertAccounts(conn, [{
        platformId: 4,
        email: "fatndku47@strbx.com.co",
        password: "secret",
        profileNumber: "1",
        costMode: "PANTALLA",
        costAmount: 1000,
    }], { allowAssignedDuplicateScreens: true });

    assert.equal(out.inserted, 1);
    assert.equal(out.skippedDuplicateAssigned, 0);
    assert.equal(out.forcedAssignedDuplicates, true);
    assert.ok(queries.some((call) => call.sql.includes("INSERT INTO platform_accounts")));
});
