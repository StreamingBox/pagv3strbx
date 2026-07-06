const test = require("node:test");
const assert = require("node:assert/strict");
const { isCountableLoginAttemptResponse } = require("../src/utils/loginRateLimit");

test("login limiter counts completed and rejected authentication attempts", () => {
    for (const statusCode of [200, 400, 401, 403, 429]) {
        assert.equal(isCountableLoginAttemptResponse(null, { statusCode }), true);
    }
});

test("login limiter ignores internal service failures", () => {
    for (const statusCode of [500, 502, 503, 504]) {
        assert.equal(isCountableLoginAttemptResponse(null, { statusCode }), false);
    }
});
