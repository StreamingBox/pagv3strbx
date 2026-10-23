const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createManualActivation,
    getBogotaDayBounds,
    getPromotionStatus,
    getRechargeBonusSnapshot,
} = require("../src/services/rechargeBonus.service");

test("sábado se evalúa con el calendario de Bogotá durante sus 24 horas", () => {
    const beforeSaturday = getPromotionStatus("2026-10-24T04:59:59Z");
    const saturdayStart = getPromotionStatus("2026-10-24T05:00:00Z");
    const saturdayEnd = getPromotionStatus("2026-10-25T04:59:59Z");
    const sundayStart = getPromotionStatus("2026-10-25T05:00:00Z");

    assert.equal(beforeSaturday.active, false);
    assert.equal(saturdayStart.active, true);
    assert.equal(saturdayStart.activeBy, "saturday");
    assert.equal(saturdayStart.activeUntil, "2026-10-25T05:00:00.000Z");
    assert.equal(saturdayEnd.active, true);
    assert.equal(sundayStart.active, false);
});

test("la activación manual vence a medianoche de Bogotá", () => {
    const activation = createManualActivation("2026-10-26T16:00:00Z");
    assert.equal(activation.manualStartsAt, "2026-10-26T16:00:00.000Z");
    assert.equal(activation.manualEndsAt, "2026-10-27T05:00:00.000Z");

    const settings = { saturdayEnabled: false, ...activation };
    assert.equal(getPromotionStatus("2026-10-27T04:59:59Z", settings).activeBy, "manual");
    assert.equal(getPromotionStatus("2026-10-27T05:00:00Z", settings).active, false);
});

test("el bono aplica solo en campaña activa a recargas COP desde 50.000", () => {
    const eligibleAt = "2026-10-24T15:00:00Z";
    const cases = [
        [49999, "COP", 0],
        [50000, "COP", 5000],
        [100000, "COP", 10000],
        [200000, "COP", 20000],
        [500000, "COP", 50000],
        [100000, "USD", 0],
    ];

    for (const [amount, currency, expected] of cases) {
        assert.equal(
            getRechargeBonusSnapshot({ amount, currency, createdAt: eligibleAt }).bonusAmount,
            expected,
            `${amount} ${currency}`
        );
    }

    assert.equal(
        getRechargeBonusSnapshot({ amount: 50000, currency: "COP", createdAt: "2026-10-25T06:00:00Z" }).bonusAmount,
        0
    );
});

test("los límites horarios locales convierten medianoche a UTC", () => {
    const bounds = getBogotaDayBounds("2026-10-24T15:00:00Z");
    assert.equal(bounds.start.toISOString(), "2026-10-24T05:00:00.000Z");
    assert.equal(bounds.end.toISOString(), "2026-10-25T05:00:00.000Z");
});
