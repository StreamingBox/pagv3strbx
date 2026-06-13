const test = require("node:test");
const assert = require("node:assert/strict");
const {
    getMinimumPurchaseCop,
    getPolicyStartDate,
    getPreviousCompletedMonth,
    isPolicyPeriodEnabled,
} = require("../src/utils/monthlyPurchasePolicy");

test("monthly minimum only starts with the June 2026 period", () => {
    assert.equal(getPolicyStartDate({}), "2026-06-01");
    assert.equal(isPolicyPeriodEnabled("2026-05-01", {}), false);
    assert.equal(isPolicyPeriodEnabled("2026-06-01", {}), true);
});

test("June 13 evaluates May and July 1 evaluates June in Bogota", () => {
    assert.deepEqual(
        getPreviousCompletedMonth(new Date("2026-06-13T17:00:00Z")),
        { periodStart: "2026-05-01", periodEnd: "2026-06-01" }
    );
    assert.deepEqual(
        getPreviousCompletedMonth(new Date("2026-07-01T05:05:00Z")),
        { periodStart: "2026-06-01", periodEnd: "2026-07-01" }
    );
});

test("monthly minimum is exactly 30000 COP by default", () => {
    assert.equal(getMinimumPurchaseCop({}), 30000);
    assert.equal(getMinimumPurchaseCop({ MONTHLY_MINIMUM_PURCHASE_COP: "45000" }), 45000);
    assert.equal(getMinimumPurchaseCop({ MONTHLY_MINIMUM_PURCHASE_COP: "invalid" }), 30000);
});
