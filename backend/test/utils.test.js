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
