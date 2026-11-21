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
    assert.deepEqual(res.body.rows[0], {
        platformId: 9,
        platformName: "Spotify",
        platformSlug: "spotify",
        historicalSales: 7,
        averageDailySales: 0.23,
        expiringSubscriptions: 2,
        estimatedDemand: 2,
        availableStock: 1,
        suggestedToReplenish: 1,
    });
});

test("stock planning consolidates active equivalent platforms into one replenishment pool", () => {
    const rows = __testing.buildPlanningRows([
        { platform_id: 1, platform_name: "Netflix", platform_slug: "netflix", historical_sales: 78, available_stock: 0, expiring_subscriptions: 94 },
        { platform_id: 2, platform_name: "Netflix Internacional", platform_slug: "netflix-internacional", historical_sales: 297, available_stock: 33, expiring_subscriptions: 5 },
        { platform_id: 3, platform_name: "Spotify", platform_slug: "spotify", historical_sales: 7, available_stock: 1, expiring_subscriptions: 2 },
    ], { historyDays: 30, horizonDays: 8 }, [
        { source_platform_id: 1, fallback_platform_id: 2 },
    ]);

    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
        platformId: "1+2",
        platformName: "Netflix + Netflix Internacional",
        platformSlug: "netflix+netflix-internacional",
        historicalSales: 375,
        averageDailySales: 12.5,
        expiringSubscriptions: 99,
        estimatedDemand: 101,
        availableStock: 33,
        suggestedToReplenish: 68,
    });
    assert.equal(rows[1].platformName, "Spotify");
});

test("stock planning respects the configured direction of an equivalence", () => {
    const [group] = __testing.buildPlanningRows([
        { platform_id: 1, platform_name: "Base", platform_slug: "base", historical_sales: 5, available_stock: 55 },
        { platform_id: 2, platform_name: "Compatible", platform_slug: "compatible", historical_sales: 50, available_stock: 0 },
    ], { historyDays: 30, horizonDays: 30 }, [
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
    });
});
