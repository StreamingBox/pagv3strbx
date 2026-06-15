const test = require("node:test");
const assert = require("node:assert/strict");

const {
    automaticProfitForEntry,
    automaticUnitCostForPlan,
} = require("../src/utils/profitCosts");

test("Notion correo records the full sale as automatic profit", () => {
    const profit = automaticProfitForEntry({
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
    const profit = automaticProfitForEntry({
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

test("Gemini 5 TB records net profit after fixed COP cost", () => {
    const plan = {
        platform_name: "Link Gemini con 5 TB de almacenamiento",
        platform_slug: "link-gemini-con-5-tb-de-almacenamiento",
        type: "correo",
        currency: "COP",
    };

    assert.equal(automaticUnitCostForPlan(plan), 7000);
    assert.equal(automaticProfitForEntry({
        plan,
        salePrice: 17000,
        unitCost: 0,
    }), 10000);
});
