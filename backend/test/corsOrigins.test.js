const assert = require("node:assert/strict");
const test = require("node:test");
const { createAllowedOrigins, createCorsOptions } = require("../src/config/corsOrigins");

test("production origins include the CRM and exclude development hosts", () => {
    const origins = createAllowedOrigins({ nodeEnv: "production", extraOrigins: "" });

    assert.equal(origins.has("https://crm.strbx.com.co"), true);
    assert.equal(origins.has("https://strbx.com.co"), true);
    assert.equal(origins.has("http://localhost:5173"), false);
    assert.equal([...origins].some((origin) => origin === "*"), false);
});

test("extra origins remain supported for explicitly configured environments", () => {
    const origins = createAllowedOrigins({
        nodeEnv: "production",
        extraOrigins: "https://preview.example.com/; https://ops.example.com",
    });

    assert.equal(origins.has("https://preview.example.com"), true);
    assert.equal(origins.has("https://ops.example.com"), true);
});

test("CORS accepts the CRM with credentials and rejects unrelated origins", async () => {
    const options = createCorsOptions({
        allowedOrigins: createAllowedOrigins({ nodeEnv: "production", extraOrigins: "" }),
        allowLocalDev: false,
    });
    const checkOrigin = (origin) => new Promise((resolve) => {
        options.origin(origin, (error, allowed) => resolve({ error, allowed }));
    });

    assert.deepEqual(await checkOrigin("https://crm.strbx.com.co"), { error: null, allowed: true });
    assert.equal((await checkOrigin("https://untrusted.example")).error instanceof Error, true);
    assert.equal((await checkOrigin("*")).error instanceof Error, true);
    assert.equal(options.credentials, true);
});
