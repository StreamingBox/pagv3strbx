const assert = require("node:assert/strict");
const test = require("node:test");
const axios = require("axios");
const { runNetflixTvSetup } = require("../src/services/netflixTvSetupService");

function configureWorker(t) {
    const previousUrl = process.env.NETFLIX_TV_SETUP_WORKER_URL;
    const previousToken = process.env.NETFLIX_TV_SETUP_WORKER_TOKEN;
    process.env.NETFLIX_TV_SETUP_WORKER_URL = "https://worker.example.test";
    process.env.NETFLIX_TV_SETUP_WORKER_TOKEN = "fixture-token";
    t.after(() => {
        if (previousUrl === undefined) delete process.env.NETFLIX_TV_SETUP_WORKER_URL;
        else process.env.NETFLIX_TV_SETUP_WORKER_URL = previousUrl;
        if (previousToken === undefined) delete process.env.NETFLIX_TV_SETUP_WORKER_TOKEN;
        else process.env.NETFLIX_TV_SETUP_WORKER_TOKEN = previousToken;
    });
}

test("password completion uses the assigned credential only in the authenticated worker request", async (t) => {
    configureWorker(t);
    const calls = [];
    t.mock.method(axios, "post", async (...args) => {
        calls.push(args);
        return { data: { ok: true, status: "completed" } };
    });
    const flow = await runNetflixTvSetup({
        tvCode: "1234-5678",
        accountEmail: "assigned@example.test",
        accountPassword: "fixture password ",
        requestLoginCode: () => { throw new Error("No email code is needed after completion"); },
    });
    assert.equal(flow.status, "completed");
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1].accountPassword, "fixture password ");
    assert.equal(calls[0][2].headers["x-tv-setup-token"], "fixture-token");
    assert.equal(calls[0][2].timeout, 60000);
    assert.equal(JSON.stringify(flow).includes("fixture password"), false);
});

test("a password flow that still requests a PIN completes in the same worker session", async (t) => {
    configureWorker(t);
    const calls = [];
    t.mock.method(axios, "post", async (url, body, options) => {
        calls.push({ url, body, options });
        return { data: url.endsWith("/start")
            ? { ok: true, status: "awaiting_login_code", sessionId: "fixture-session" }
            : { ok: true, status: "completed" } };
    });
    const flow = await runNetflixTvSetup({
        tvCode: "12345678",
        accountEmail: "assigned@example.test",
        accountPassword: "fixture-password",
        requestLoginCode: async () => ({ ok: true, code: "0482" }),
    });
    assert.equal(flow.ok, true);
    assert.deepEqual(calls[1].body, { sessionId: "fixture-session", loginCode: "0482" });
    assert.equal(calls[1].options.timeout, 35000);
});

test("resending does not repeat the entire mailbox polling budget", async (t) => {
    configureWorker(t);
    t.mock.method(axios, "post", async (url) => ({ data: url.endsWith("/start")
        ? { ok: true, status: "awaiting_login_code", sessionId: "fixture-session" }
        : { ok: true, status: url.endsWith("/resend") ? "login_code_resent" : "completed" } }));
    const attempts = [];
    const flow = await runNetflixTvSetup({
        tvCode: "12345678",
        accountEmail: "assigned@example.test",
        requestLoginCode: async (options) => {
            attempts.push(options);
            return attempts.length === 1 ? { ok: false, status: "mailbox_empty" } : { ok: true, code: "0482" };
        },
    });
    assert.equal(flow.ok, true);
    assert.deepEqual(attempts, [undefined, { maxAttempts: 1 }]);
});
