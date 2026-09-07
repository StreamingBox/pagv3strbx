const assert = require("node:assert/strict");
const test = require("node:test");
const {
    addCalendarDays,
    isDateOnly,
    normalizeCurrency,
} = require("../src/services/providerAccounts.service");

test("calculates 30 calendar days without timezone drift", () => {
    assert.equal(addCalendarDays("2026-01-31"), "2026-03-02");
    assert.equal(addCalendarDays("2026-02-28"), "2026-03-30");
    assert.equal(addCalendarDays("2026-08-25"), "2026-09-24");
});

test("rejects impossible dates and only accepts COP or USD", () => {
    assert.equal(isDateOnly("2026-02-30"), false);
    assert.equal(isDateOnly("2026-09-06"), true);
    assert.equal(normalizeCurrency("cop"), "COP");
    assert.equal(normalizeCurrency(" usd "), "USD");
    assert.equal(normalizeCurrency("EUR"), null);
});
