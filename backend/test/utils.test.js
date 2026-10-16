const assert = require("node:assert/strict");
const test = require("node:test");
const {
    currencyAliases,
    displayCurrency,
    normalizeCurrency,
    sameCurrency,
} = require("../src/utils/currency");
const {
    addDaysBogotaDateOnly,
    addDaysExact,
    bogotaMonthUtcRange,
    formatDateOnlyBogota,
    isStoredDateOnlyExpired,
    parseDateOnly,
    toSqlDateTime,
} = require("../src/utils/date");
const { canRenewAfterExpiry, getRenewalEligibility } = require("../src/utils/renewals");
const { toCodeSlug } = require("../src/utils/platformSlugMap");
const { extractFallbackCode } = require("../src/utils/codeExtraction");
const { allowInsecureTls, getImapConfig } = require("../src/utils/imapConfig");

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

test("Bogota month ranges use inclusive UTC start and exclusive next-month boundary", () => {
    assert.deepEqual(bogotaMonthUtcRange(2026, 10), {
        startUtc: "2026-10-01 05:00:00",
        endUtc: "2026-11-01 05:00:00",
        startDate: "2026-10-01",
        endDate: "2026-11-01",
    });
    assert.deepEqual(bogotaMonthUtcRange(2026, 12), {
        startUtc: "2026-12-01 05:00:00",
        endUtc: "2027-01-01 05:00:00",
        startDate: "2026-12-01",
        endDate: "2027-01-01",
    });
    assert.throws(() => bogotaMonthUtcRange(2026, 13), RangeError);
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

test("renewal eligibility can allow an expired subscription only when explicitly requested", () => {
    const params = {
        expiresAt: "2026-06-10",
        expiresAtIsDateOnly: true,
        isRenewable: true,
        status: "active",
        isAttended: 0,
        now: new Date("2026-06-12T17:00:00Z"),
    };

    assert.equal(getRenewalEligibility(params).canRenew, false);
    assert.equal(getRenewalEligibility({ ...params, allowExpired: true }).canRenew, true);
    assert.equal(getRenewalEligibility({ ...params, allowExpired: true, isAttended: 1 }).canRenew, false);
    assert.equal(getRenewalEligibility({ ...params, allowExpired: true, status: "cancelled" }).canRenew, false);
    assert.equal(getRenewalEligibility({ ...params, allowExpired: true, isRenewable: false }).canRenew, false);
    assert.equal(getRenewalEligibility({
        ...params,
        allowExpired: true,
        renewalCount: 2,
        platformSlug: "youtube-music",
    }).canRenew, false);
});

test("customers can extend only active unattended expired subscriptions; admins still need explicit approval", () => {
    const expiredActive = {
        status: "active",
        isAttended: 0,
        isPastExpiry: true,
    };

    assert.equal(canRenewAfterExpiry({ ...expiredActive, actorRole: "user" }), true);
    assert.equal(canRenewAfterExpiry({ ...expiredActive, actorRole: "admin" }), false);
    assert.equal(canRenewAfterExpiry({ ...expiredActive, actorRole: "admin", extendedRenewal: true }), true);
    assert.equal(canRenewAfterExpiry({ ...expiredActive, actorRole: "user", isAttended: 1 }), false);
    assert.equal(canRenewAfterExpiry({ ...expiredActive, actorRole: "user", status: "cancelled" }), false);
    assert.equal(canRenewAfterExpiry({ ...expiredActive, actorRole: "user", status: "pending" }), false);
    assert.equal(canRenewAfterExpiry({ ...expiredActive, actorRole: "user", isPastExpiry: false }), false);
});

test("admin self-service follows the customer overdue-renewal policy, while admin tools require approval", () => {
    const expiredActive = {
        status: "active",
        isAttended: 0,
        isPastExpiry: true,
    };

    assert.equal(canRenewAfterExpiry({ ...expiredActive, actorRole: "admin" }), false);
    assert.equal(canRenewAfterExpiry({ ...expiredActive, actorRole: "admin", customerInitiated: true }), true);
    assert.equal(canRenewAfterExpiry({
        ...expiredActive,
        actorRole: "admin",
        customerInitiated: true,
        isAttended: 1,
    }), false);
});

test("a 90-day extended renewal stays anchored to the previous expiry", () => {
    const newExpiry = addDaysBogotaDateOnly(90, new Date("2026-10-10T12:00:00Z"));
    const daysFromToday = (Date.parse(`${newExpiry}T00:00:00Z`) - Date.parse("2026-10-12T00:00:00Z")) / 86_400_000;

    assert.equal(newExpiry, "2027-01-08");
    assert.equal(daysFromToday, 88);
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

test("Gmail IMAP config keeps strict TLS with explicit SNI", () => {
    const oldEnv = {
        GMAIL_EMAIL: process.env.GMAIL_EMAIL,
        GMAIL_IMAP_PASS: process.env.GMAIL_IMAP_PASS,
        IMAP_TLS_INSECURE: process.env.IMAP_TLS_INSECURE,
        NODE_ENV: process.env.NODE_ENV,
    };

    try {
        process.env.GMAIL_EMAIL = "codes@example.com";
        process.env.GMAIL_IMAP_PASS = "app-password";
        process.env.IMAP_TLS_INSECURE = "true";
        process.env.NODE_ENV = "production";

        const config = getImapConfig();
        assert.equal(config.imap.host, "imap.gmail.com");
        assert.equal(config.imap.tlsOptions.servername, "imap.gmail.com");
        assert.equal(config.imap.tlsOptions.rejectUnauthorized, true);
        assert.equal(allowInsecureTls("IMAP_TLS_INSECURE"), false);
    } finally {
        for (const [key, value] of Object.entries(oldEnv)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
});
