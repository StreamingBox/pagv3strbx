const assert = require("node:assert/strict");
const test = require("node:test");
const {
    currencyAliases,
    displayCurrency,
    normalizeCurrency,
    sameCurrency,
} = require("../src/utils/currency");
const {
    addDaysExact,
    formatDateOnlyBogota,
    isStoredDateOnlyExpired,
    parseDateOnly,
    toSqlDateTime,
} = require("../src/utils/date");
const { getRenewalEligibility } = require("../src/utils/renewals");
const { toCodeSlug } = require("../src/utils/platformSlugMap");
const { extractFallbackCode } = require("../src/utils/codeExtraction");

test("currency utilities normalize USD and USDT consistently", () => {
    assert.equal(normalizeCurrency(" usdt "), "USD");
    assert.equal(normalizeCurrency("usd"), "USD");
    assert.equal(displayCurrency("USD"), "USDT");
    assert.equal(sameCurrency("USDT", "usd"), true);
    assert.deepEqual(currencyAliases("USD"), ["USD", "USDT"]);
});

test("currency utilities preserve local currencies", () => {
    assert.equal(normalizeCurrency("cop"), "COP");
    assert.equal(displayCurrency("mxn"), "MXN");
    assert.equal(sameCurrency("COP", "MXN"), false);
    assert.deepEqual(currencyAliases("COP"), ["COP"]);
});

test("date utilities keep date-only values stable", () => {
    assert.equal(parseDateOnly("2026-06-30"), "2026-06-30");
    assert.equal(parseDateOnly("30/06/2026"), null);
    assert.equal(formatDateOnlyBogota("2026-06-30"), "2026-06-30");
});

test("date utilities convert datetimes and calculate expiry safely", () => {
    const base = new Date("2026-06-01T00:00:00Z");
    assert.equal(toSqlDateTime(addDaysExact(base, 30)), "2026-07-01 00:00:00");
    assert.equal(isStoredDateOnlyExpired("2026-05-31", new Date("2026-06-01T12:00:00Z")), true);
    assert.equal(isStoredDateOnlyExpired("2026-06-02", new Date("2026-06-01T12:00:00Z")), false);
});

test("renewal eligibility keeps stored date-only expirations available through the displayed day", () => {
    const eligibility = getRenewalEligibility({
        expiresAt: new Date("2026-06-10T00:00:00Z"),
        expiresAtIsDateOnly: true,
        isRenewable: true,
        status: "active",
        isAttended: 0,
        now: new Date("2026-06-10T17:00:00Z"),
    });

    assert.equal(eligibility.canRenew, true);
    assert.equal(eligibility.expiresOnDate, "2026-06-10");
});

test("renewal eligibility uses Bogota day for real account datetimes", () => {
    const eligibility = getRenewalEligibility({
        expiresAt: new Date("2026-06-10T22:02:34Z"),
        isRenewable: true,
        status: "active",
        isAttended: 0,
        now: new Date("2026-06-10T23:30:00Z"),
    });

    assert.equal(eligibility.canRenew, true);
    assert.equal(eligibility.expiresOnDate, "2026-06-10");
});

test("code lookup maps the ChatGPT personal product to ChatGPT codes", () => {
    assert.equal(toCodeSlug("Chat Gpt, cuenta personal solo un dispositivo"), "chatgpt");
    assert.equal(toCodeSlug("chat-gpt-cuenta-personal-solo-un-dispositivo"), "chatgpt");
});

test("code lookup extracts the current Spanish ChatGPT temporary code email", () => {
    const haystack = [
        "Tu codigo de inicio de sesion temporal de ChatGPT",
        "Introduce este codigo de verificacion temporal para continuar:",
        "741563",
    ].join("\n");

    assert.equal(extractFallbackCode(haystack), "741563");
});
