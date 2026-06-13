const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateStockAlertTransitions } = require("../src/utils/stockAlertTransitions");

test("stock alerts only report new transitions to zero", () => {
    const result = calculateStockAlertTransitions([
        { platform_id: 1, platform_name: "Netflix", effective_stock: 0 },
        { platform_id: 2, platform_name: "Prime Video", effective_stock: 0 },
        { platform_id: 3, platform_name: "Spotify", effective_stock: 2 },
    ], [
        { platform_id: 1, is_out_of_stock: 1 },
        { platform_id: 3, is_out_of_stock: 1 },
    ]);

    assert.deepEqual(result.outOfStock.map(row => row.platformId), [2]);
    assert.deepEqual(result.recovered.map(row => row.platformId), [3]);
});
