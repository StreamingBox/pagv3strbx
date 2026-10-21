const assert = require("node:assert/strict");
const test = require("node:test");
const { __test } = require("../src/services/codesService");

test("Netflix login delivery requires exactly four digits", () => {
    assert.equal(__test.isValidAccessCode("8042", { expectedLength: 4 }), true);
    assert.equal(__test.isValidAccessCode("123456", { expectedLength: 4 }), false);
    assert.equal(__test.isValidAccessCode("1 2 3 4 5 6", { expectedLength: 4 }), false);
    assert.equal(__test.isValidAccessCode("0000", { expectedLength: 4 }), false);
});
