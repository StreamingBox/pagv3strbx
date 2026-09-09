const test = require("node:test");
const assert = require("node:assert/strict");

const {
    eventLinkSnapshot,
    formatBogotaDateTime,
    isEventLinkPlan,
    normalizeEventLinkUrl,
    parseBogotaDateTimeInput,
} = require("../src/utils/eventLinks");

test("acepta solamente enlaces HTTPS de YouTube", () => {
    assert.equal(normalizeEventLinkUrl("https://youtu.be/abc123"), "https://youtu.be/abc123");
    assert.equal(normalizeEventLinkUrl("https://www.youtube.com/watch?v=abc123"), "https://www.youtube.com/watch?v=abc123");
    assert.equal(normalizeEventLinkUrl("http://youtube.com/watch?v=abc123"), null);
    assert.equal(normalizeEventLinkUrl("https://example.com/watch?v=abc123"), null);
});

test("interpreta la hora escrita por el administrador como hora de Colombia", () => {
    const endsAt = parseBogotaDateTimeInput("2026-08-08T22:30");
    assert.equal(endsAt.toISOString(), "2026-08-09T03:30:00.000Z");
    assert.equal(formatBogotaDateTime(endsAt), "2026-08-08 22:30 (Colombia)");
    assert.equal(parseBogotaDateTimeInput("2026-02-30T22:30"), null);
});

test("la venta identifica planes por evento y conserva su foto del enlace", () => {
    assert.equal(isEventLinkPlan({ is_event_link: 1 }), true);
    assert.equal(isEventLinkPlan({ is_event_link: 0 }), false);

    const snapshot = eventLinkSnapshot({
        id: 9,
        title: "Equipo A vs Equipo B",
        url: "https://youtu.be/abc123",
        ends_at: new Date("2026-08-09T03:30:00.000Z"),
        unit_cost: "3000.00",
        currency: "COP",
    });

    assert.deepEqual(snapshot, {
        id: 9,
        title: "Equipo A vs Equipo B",
        url: "https://youtu.be/abc123",
        endsAt: new Date("2026-08-09T03:30:00.000Z"),
        expiresAt: "2026-08-08",
        unitCost: 3000,
        currency: "COP",
        endsAtSql: "2026-08-09 03:30:00",
    });
});
