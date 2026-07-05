const assert = require("node:assert/strict");
const test = require("node:test");
const {
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
            }]];
        },
    };

    const row = await findActiveAssignedScreenDuplicate(conn, {
        pid: 4,
        emailValue: "fatndku47@strbx.com.co",
        accountProf: "1",
    });

    assert.equal(row.id, 5389);
    assert.deepEqual(calls[0].params, [4, "fatndku47@strbx.com.co", "1"]);
    assert.match(calls[0].sql, /LOWER\(TRIM\(COALESCE\(pa\.status, ''\)\)\) = 'assigned'/);
    assert.match(calls[0].sql, /pa\.assigned_to_user_id IS NOT NULL/);
    assert.match(calls[0].sql, /active_sub\.id IS NOT NULL/);
    assert.match(calls[0].sql, /pa\.expires_at IS NULL/);
    assert.match(calls[0].sql, /active_sub\.expires_at/);
    assert.match(calls[0].sql, /CAST\(pa\.profile_number AS CHAR\) = \?/);
});
