const test = require("node:test");
const assert = require("node:assert/strict");

const { __testing } = require("../src/services/checkoutService");

test("Notion correo records the full sale as automatic profit", () => {
    const profit = __testing.automaticProfitForEntry({
        plan: {
            platform_name: "Notion a correo",
            platform_slug: "notion-a-correo",
            type: "correo",
        },
        salePrice: 10000,
        unitCost: 0,
    });

    assert.equal(profit, 10000);
});

test("regular inventory products do not add automatic full profit", () => {
    const profit = __testing.automaticProfitForEntry({
        plan: {
            platform_name: "Netflix",
            platform_slug: "netflix",
            type: "normal",
        },
        salePrice: 10000,
        unitCost: 6000,
    });

    assert.equal(profit, 0);
});
