const assert = require("node:assert/strict");
const test = require("node:test");
const {
    normalizeNotifacePlatformAlias,
    platformAliasTerms,
} = require("../src/services/notifaceSales.service").__testing;

test("normalizes NotiFace platform aliases from Telegram text", () => {
    assert.equal(normalizeNotifacePlatformAlias("  NéTfliX!!! "), "netflix");
    assert.equal(normalizeNotifacePlatformAlias("Disney Estándar"), "disney estandar");
});

test("expands common marketplace aliases into searchable terms", () => {
    assert.ok(platformAliasTerms("netfli").includes("netflix"));
    assert.ok(platformAliasTerms("DGO").includes("disney"));
    assert.ok(platformAliasTerms("Max HBO").includes("hbo"));
    assert.ok(platformAliasTerms("Amazon Prime").includes("prime"));
    assert.ok(platformAliasTerms("Amazon Prime").includes("amazon"));
});
