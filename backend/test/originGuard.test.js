const assert = require("node:assert/strict");
const test = require("node:test");
const { createOriginGuard } = require("../src/middleware/originGuard");

function runGuard({ method = "POST", headers = {} } = {}) {
    let nextCalled = false;
    let response = null;
    const req = {
        method,
        get(name) {
            return headers[name.toLowerCase()] || "";
        },
    };
    const res = {
        status(code) {
            response = { status: code };
            return this;
        },
        json(body) {
            response = { ...response, body };
            return this;
        },
    };

    createOriginGuard({
        allowedOrigins: new Set(["https://strbx.com.co"]),
        allowLocalDev: false,
    })(req, res, () => { nextCalled = true; });

    return { nextCalled, response };
}

test("origin guard accepts the production frontend", () => {
    assert.deepEqual(runGuard({ headers: { origin: "https://strbx.com.co" } }), {
        nextCalled: true,
        response: null,
    });
});

test("origin guard rejects a cross-site state-changing request", () => {
    const result = runGuard({
        headers: { origin: "https://attacker.example" },
    });
    assert.equal(result.nextCalled, false);
    assert.equal(result.response.status, 403);
});

test("origin guard rejects cross-site fetch metadata without an Origin header", () => {
    const result = runGuard({
        headers: { "sec-fetch-site": "cross-site" },
    });
    assert.equal(result.nextCalled, false);
    assert.equal(result.response.status, 403);
});

test("origin guard leaves non-browser requests without origin usable", () => {
    assert.deepEqual(runGuard(), { nextCalled: true, response: null });
});
