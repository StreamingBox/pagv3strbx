const assert = require("node:assert/strict");
const test = require("node:test");

const {
    addDaysBogotaDateOnly,
    bogotaDateOnlyToUtcEndOfDay,
    toSqlDateTime,
} = require("../src/utils/date");
const {
    normalizeIdempotencyKey,
    requestHash,
} = require("../src/services/checkoutIdempotency.service");

test("subscription expiry is a Bogota calendar date, independent of UTC hour", () => {
    const lateBogota = new Date("2026-06-17T02:30:00Z"); // Jun 16, 9:30 p. m. in Bogota
    assert.equal(addDaysBogotaDateOnly(6, lateBogota), "2026-06-22");
    assert.equal(
        toSqlDateTime(bogotaDateOnlyToUtcEndOfDay("2026-06-22")),
        "2026-06-23 04:59:59"
    );
});

test("checkout idempotency keys are validated and hash the same cart consistently", () => {
    assert.equal(normalizeIdempotencyKey("checkout:2026-07-10:abc123"), "checkout:2026-07-10:abc123");
    assert.equal(
        requestHash({ items: [1, 2], combos: [] }),
        requestHash({ items: [1, 2], combos: [] })
    );
    assert.notEqual(
        requestHash({ items: [1], combos: [] }),
        requestHash({ items: [2], combos: [] })
    );
    assert.throws(() => normalizeIdempotencyKey("short"), /clave de compra/i);
});
