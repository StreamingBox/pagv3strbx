const assert = require("node:assert/strict");
const test = require("node:test");
const {
    resolveCostModel,
    validateCostModelInput,
} = require("../src/utils/accountCosts");

test("screen cost is stored directly as the unit cost", () => {
    assert.deepEqual(
        resolveCostModel({ costMode: "pantalla", costAmount: "10800" }),
        {
            parentCostTotal: null,
            parentProfilesTotal: null,
            unitCost: 10800,
        }
    );
});

test("full account cost is divided by its sellable screens", () => {
    assert.deepEqual(
        resolveCostModel({
            costMode: "cuenta",
            costAmount: "54.000",
            motherProfilesTotal: "5",
        }),
        {
            parentCostTotal: 54000,
            parentProfilesTotal: 5,
            unitCost: 10800,
        }
    );
});

test("legacy account cost fields remain compatible", () => {
    assert.deepEqual(
        resolveCostModel({
            motherCostTotal: "45.50",
            motherProfilesTotal: "2",
        }),
        {
            parentCostTotal: 45.5,
            parentProfilesTotal: 2,
            unitCost: 22.75,
        }
    );
});

test("account cost without a screen count is rejected", () => {
    assert.throws(
        () => validateCostModelInput({
            costMode: "account",
            costAmount: "54000",
            motherProfilesTotal: "",
        }),
        /pantallas vendibles/
    );
});

test("blank cost remains optional", () => {
    assert.deepEqual(
        validateCostModelInput({ costMode: "screen", costAmount: "" }),
        {
            parentCostTotal: null,
            parentProfilesTotal: null,
            unitCost: null,
        }
    );
});
