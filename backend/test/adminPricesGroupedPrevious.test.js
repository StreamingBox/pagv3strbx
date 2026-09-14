const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const routeSource = fs.readFileSync(
    path.join(__dirname, "../src/routes/admin.prices.js"),
    "utf8"
);

test("grouped admin prices expose previous prices for every currency", () => {
    assert.match(routeSource, /MAX\(CASE WHEN pp\.currency='COP' THEN pp\.previous_price END\) AS previous_price_cop/);
    assert.match(routeSource, /MAX\(CASE WHEN pp\.currency='MXN' THEN pp\.previous_price END\) AS previous_price_mxn/);
    assert.match(routeSource, /MAX\(CASE WHEN pp\.currency IN \('USD','USDT'\) THEN pp\.previous_price END\) AS previous_price_usd/);
    assert.match(routeSource, /MAX\(CASE WHEN pp\.currency='COP' THEN pp\.previous_lite_price_cop END\) AS previous_lite_price_cop/);
});
