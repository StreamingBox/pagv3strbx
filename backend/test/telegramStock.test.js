const assert = require("node:assert/strict");
const test = require("node:test");
const {
    readStockApiToken,
    timingSafeTokenEquals,
    requireTelegramStockToken,
} = require("../src/routes/telegramStock").__testing;

function responseDouble() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

test("accepts the stock API token as a Bearer token", () => {
    const req = {
        get(name) {
            return name.toLowerCase() === "authorization" ? "Bearer secret-token" : "";
        },
    };
    assert.equal(readStockApiToken(req), "secret-token");
    assert.equal(timingSafeTokenEquals("secret-token", "secret-token"), true);
});

test("rejects missing or invalid stock API tokens", () => {
    const previous = process.env.TELEGRAM_STOCK_API_TOKEN;
    process.env.TELEGRAM_STOCK_API_TOKEN = "secret-token";

    const invalidResponse = responseDouble();
    requireTelegramStockToken({ get: () => "Bearer wrong-token" }, invalidResponse, () => {});
    assert.equal(invalidResponse.statusCode, 401);
    assert.equal(invalidResponse.body.ok, false);

    delete process.env.TELEGRAM_STOCK_API_TOKEN;
    const missingResponse = responseDouble();
    requireTelegramStockToken({ get: () => "" }, missingResponse, () => {});
    assert.equal(missingResponse.statusCode, 503);
    assert.equal(missingResponse.body.ok, false);

    if (previous === undefined) delete process.env.TELEGRAM_STOCK_API_TOKEN;
    else process.env.TELEGRAM_STOCK_API_TOKEN = previous;
});
