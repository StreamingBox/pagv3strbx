const assert = require("node:assert/strict");
const test = require("node:test");
const {
    bulkInsertAccounts,
    duplicateSummaryLine,
    findActiveAssignedScreenDuplicate,
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
        profileNumber: "1",
        assignedTo: "comprador@example.com",
        orderCode: "ORD-123",
        expiresAt: "2026-07-28 00:00:00",
    });

    assert.match(line, /Fila 2/);
    assert.match(line, /Prime Video/);
    assert.match(line, /fatndku47@strbx\.com\.co/);
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
    assert.match(calls[0].sql, /pa\.assigned_to_user_id IS NOT NULL/);
    assert.match(calls[0].sql, /active_sub\.id IS NOT NULL/);
    assert.match(calls[0].sql, /pa\.expires_at IS NULL/);
    assert.match(calls[0].sql, /active_sub\.expires_at/);
    assert.match(calls[0].sql, /CAST\(pa\.profile_number AS CHAR\) = \?/);
});

test("bulk upload can force assigned screen duplicates when admin confirms", async () => {
    const queries = [];
    const conn = {
        async query(sql, params) {
            queries.push({ sql, params });
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
