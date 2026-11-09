const assert = require("node:assert/strict");
const test = require("node:test");
const { __test } = require("../src/services/codesService");

test("Netflix uses the active provider-list assignment over inventory metadata", () => {
    assert.equal(__test.resolveNetflixAccountCodeProvider({
        listedProviderName: "Jeff Premium",
        inventoryProvider: "StoreTools.co",
    }), "jeff_premium");
});

test("Netflix honors Streaming Box when that is the provider-list assignment", () => {
    assert.equal(__test.resolveNetflixAccountCodeProvider({
        listedProviderName: "Streaming Box",
        inventoryProvider: "jeff_premium",
    }), "strbx");
});

test("Netflix falls back to inventory metadata when no provider-list assignment exists", () => {
    assert.equal(__test.resolveNetflixAccountCodeProvider({
        listedProviderName: null,
        inventoryProvider: "StoreTools.co",
    }), "storetools");
});

test("Netflix login delivery requires exactly four digits", () => {
    assert.equal(__test.isValidAccessCode("8042", { expectedLength: 4 }), true);
    assert.equal(__test.isValidAccessCode("123456", { expectedLength: 4 }), false);
    assert.equal(__test.isValidAccessCode("1 2 3 4 5 6", { expectedLength: 4 }), false);
    assert.equal(__test.isValidAccessCode("0000", { expectedLength: 4 }), false);
});
