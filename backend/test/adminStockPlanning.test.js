const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/db");
const router = require("../src/routes/admin.stockPlanning");
const { currentBogotaDateOnly } = require("../src/utils/date");
const { __testing } = router;

const route = router.stack.find((layer) => layer.route?.path === "/admin/stock-planning")?.route;
const handler = route?.stack.at(-1)?.handle;

function response() {
    return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
}

test("stock planning estimates new demand from completed history and separates renewals", async () => {
    assert.ok(route);
    assert.equal(route.stack[0].handle.name, "requireAuth");
    assert.equal(route.stack.length, 3);
    assert.match(__testing.STOCK_PLANNING_QUERY, /COALESCE\(oi\.delivered_platform_id, oi\.platform_id\)/);
    assert.match(__testing.STOCK_PLANNING_QUERY, /srl\.renewal_order_id = o\.id/);
    assert.match(__testing.STOCK_PLANNING_QUERY, /sa\.item_count_delta < 0/);
    assert.match(__testing.STOCK_PLANNING_QUERY, /p\.type, 'normal'\) <> 'correo'/);
    assert.match(__testing.STOCK_PLANNING_QUERY, /WHERE status = 'active'\s+AND expires_at >= \?\s+AND expires_at <= \?/);
    assert.match(__testing.PLATFORM_FALLBACKS_QUERY, /WHERE is_active = 1/);
    assert.match(__testing.SALES_TREND_QUERY, /sa\.item_count_delta < 0/);
    assert.match(__testing.SALES_TREND_QUERY, /srl\.renewal_order_id = o\.id/);

    const originalQuery = pool.query;
    let queryParams;
    pool.query = async (sql, params) => {
        if (sql === __testing.STOCK_PLANNING_QUERY) {
            queryParams = params;
            return [[{
                platform_id: 9,
                platform_name: "Spotify",
                platform_slug: "spotify",
                historical_sales: 7,
                available_stock: 1,
                expiring_subscriptions: 2,
            }], []];
        }
        if (sql === __testing.SALES_TREND_QUERY) return [[{ platform_id: 9 }], []];
        return [[], []];
    };
    const res = response();
    const today = currentBogotaDateOnly();
    const targetDate = __testing.shiftDate(today, 7);

    try {
        await handler({ query: { targetDate, historyDays: "30" } }, res);
    } finally {
        pool.query = originalQuery;
    }

    assert.equal(res.statusCode, 200);
    assert.deepEqual(queryParams, [
        `${__testing.shiftDate(today, -30)} 05:00:00`,
        `${today} 05:00:00`,
        targetDate,
        today,
        targetDate,
    ]);
    const expectedWindows = __testing.buildSalesWindows(today, __testing.shiftDate(today, -30));
    assert.equal(res.body.salesPeriods.monthToDateDays, expectedWindows.monthToDateDays);
    assert.equal(res.body.salesPeriods.previousMonthDays, expectedWindows.previousMonthDays);
    assert.deepEqual(res.body.rows[0].salesTrend, {
        recent7Sales: 0,
        previous7Sales: 0,
        weeklyChangePercent: 0,
        monthToDateSales: 0,
        previousMonthSales: 0,
        monthlyChangePercent: expectedWindows.monthToDateDays && expectedWindows.previousMonthDays ? 0 : null,
        replenishment: { recent7: 0, recent14: 0, monthToDate: 0, selectedHistory: 1 },
    });
    assert.equal(res.body.rows[0].suggestedToReplenish, 1);
});

test("sales windows compare complete weeks and the same completed month days", () => {
    assert.deepEqual(__testing.buildSalesWindows("2026-11-21", "2026-10-22"), {
        recent7StartDate: "2026-11-14",
        previous7StartDate: "2026-11-07",
        monthStartDate: "2026-11-01",
        previousMonthStartDate: "2026-10-01",
        previousMonthEndDate: "2026-10-21",
        monthToDateDays: 20,
        previousMonthDays: 20,
        trendStartDate: "2026-10-01",
    });
});

test("stock planning consolidates active equivalent platforms into one replenishment pool", () => {
    const rows = __testing.buildPlanningRows([
        { platform_id: 1, platform_name: "Netflix", platform_slug: "netflix", historical_sales: 78, available_stock: 0, expiring_subscriptions: 94 },
        { platform_id: 2, platform_name: "Netflix Internacional", platform_slug: "netflix-internacional", historical_sales: 297, available_stock: 31, expiring_subscriptions: 5 },
        { platform_id: 3, platform_name: "Spotify", platform_slug: "spotify", historical_sales: 7, available_stock: 1, expiring_subscriptions: 2 },
    ], { historyDays: 30, horizonDays: 10, salesWindows: { monthToDateDays: 20, previousMonthDays: 20 } }, [
        { source_platform_id: 1, fallback_platform_id: 2 },
    ], [
        { platform_id: 1, recent_7_sales: 9, previous_7_sales: 20, month_to_date_sales: 46, previous_month_sales: 36 },
        { platform_id: 2, recent_7_sales: 51, previous_7_sales: 79, month_to_date_sales: 199, previous_month_sales: 221 },
    ]);

    assert.equal(rows.length, 2);
    assert.equal(rows[0].platformId, "1+2");
    assert.equal(rows[0].platformName, "Netflix + Netflix Internacional");
    assert.equal(rows[0].historicalSales, 375);
    assert.equal(rows[0].expiringSubscriptions, 99);
    assert.equal(rows[0].estimatedDemand, 125);
    assert.equal(rows[0].availableStock, 31);
    assert.equal(rows[0].suggestedToReplenish, 94);
    assert.deepEqual(rows[0].salesTrend, {
        recent7Sales: 60,
        previous7Sales: 99,
        weeklyChangePercent: -39.4,
        monthToDateSales: 245,
        previousMonthSales: 257,
        monthlyChangePercent: -4.7,
        replenishment: { recent7: 55, recent14: 83, monthToDate: 92, selectedHistory: 94 },
    });
    assert.equal(rows[1].platformName, "Spotify");
});

test("stock planning respects the configured direction of an equivalence", () => {
    const [group] = __testing.buildPlanningRows([
        { platform_id: 1, platform_name: "Base", platform_slug: "base", historical_sales: 5, available_stock: 55 },
        { platform_id: 2, platform_name: "Compatible", platform_slug: "compatible", historical_sales: 50, available_stock: 0 },
    ], { historyDays: 30, horizonDays: 30, salesWindows: { monthToDateDays: 20, previousMonthDays: 20 } }, [
        { source_platform_id: 1, fallback_platform_id: 2 },
    ]);

    assert.equal(group.estimatedDemand, 55);
    assert.equal(group.availableStock, 55);
    assert.equal(group.suggestedToReplenish, 50);
});

test("stock planning rejects invalid dates and unsupported history windows", async () => {
    const now = new Date("2026-11-21T17:00:00.000Z");
    assert.equal(__testing.normalizeParams({ targetDate: "2026-02-30" }, now).error, "La fecha objetivo debe tener formato YYYY-MM-DD.");
    assert.match(__testing.normalizeParams({ targetDate: "2026-11-20" }, now).error, /entre hoy/);
    assert.match(__testing.normalizeParams({ historyDays: "45" }, now).error, /30, 60 o 90/);
    assert.ok(__testing.normalizeParams({ targetDate: ["2026-11-28"] }, now).error);
    assert.deepEqual(__testing.normalizeParams({}, now), {
        today: "2026-11-21",
        targetDate: "2026-11-28",
        daysAhead: 7,
        horizonDays: 8,
        historyDays: 30,
        historyStartDate: "2026-10-22",
        salesWindows: {
            recent7StartDate: "2026-11-14",
            previous7StartDate: "2026-11-07",
            monthStartDate: "2026-11-01",
            previousMonthStartDate: "2026-10-01",
            previousMonthEndDate: "2026-10-21",
            monthToDateDays: 20,
            previousMonthDays: 20,
            trendStartDate: "2026-10-01",
        },
    });
});
