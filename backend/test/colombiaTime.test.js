const test = require("node:test");
const assert = require("node:assert/strict");

const {
    addDaysBogotaDateOnly,
    bogotaDateOnlyToUtcEndOfDay,
    formatDateOnlyBogota,
    bogotaDateSql,
    BOGOTA_TODAY_SQL,
} = require("../src/utils/date");

test("mantiene el día colombiano antes y después de medianoche", () => {
    const beforeMidnight = new Date("2026-06-17T04:59:59.000Z");
    const atMidnight = new Date("2026-06-17T05:00:00.000Z");

    assert.equal(formatDateOnlyBogota(beforeMidnight), "2026-06-16");
    assert.equal(formatDateOnlyBogota(atMidnight), "2026-06-17");
    assert.equal(addDaysBogotaDateOnly(1, beforeMidnight), "2026-06-17");
    assert.equal(addDaysBogotaDateOnly(1, atMidnight), "2026-06-18");
});

test("convierte el fin contractual de Colombia a UTC sin cambiar el día mostrado", () => {
    const technicalExpiry = bogotaDateOnlyToUtcEndOfDay("2026-06-17");
    assert.equal(technicalExpiry.toISOString(), "2026-06-18T04:59:59.000Z");
    assert.equal(formatDateOnlyBogota(technicalExpiry), "2026-06-17");
});

test("centraliza las expresiones SQL de calendario colombiano", () => {
    assert.match(BOGOTA_TODAY_SQL, /CONVERT_TZ\(UTC_TIMESTAMP\(\), '\+00:00', '-05:00'\)/);
    assert.equal(
        bogotaDateSql("pa.expires_at"),
        "DATE(CONVERT_TZ(pa.expires_at, '+00:00', '-05:00'))"
    );
});

