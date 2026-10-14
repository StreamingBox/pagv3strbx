const assert = require("node:assert/strict");
const test = require("node:test");
const { isTransientDatabaseError } = require("../src/utils/databaseErrors");

test("database network failures are classified as transient", () => {
    for (const code of ["ECONNRESET", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH"]) {
        assert.equal(isTransientDatabaseError(Object.assign(new Error(code), { code })), true);
    }
});

test("transient errors nested in AggregateError are recognized", () => {
    const cause = Object.assign(new Error("network unreachable"), { code: "ENETUNREACH" });
    assert.equal(isTransientDatabaseError(new AggregateError([cause])), true);
});

test("database query errors are not classified as transient network failures", () => {
    assert.equal(isTransientDatabaseError(Object.assign(new Error("bad query"), { code: "ER_PARSE_ERROR" })), false);
    assert.equal(isTransientDatabaseError(null), false);
});
