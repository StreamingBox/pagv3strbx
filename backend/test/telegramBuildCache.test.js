const assert = require("node:assert/strict");
const test = require("node:test");
const { PREVIEW_TTL_MS, buildBuildCachePreviewMessage, createTelegramBuildCacheController } = require("../src/services/telegramBuildCache.service");

const admin = { chat: { id: 123456, type: "private" }, from: { id: 123456 } };
const admins = new Set([123456, 987654]);
const token = "a".repeat(32);

function createController(overrides = {}) {
    const messages = [];
    const calls = [];
    let now = 1_000;
    const controller = createTelegramBuildCacheController({
        authorizedIds: admins,
        preview: async () => ({ token, reclaimableBytes: 2 * 1024 ** 3, reclaimableEntries: 8 }),
        prune: async receivedToken => {
            calls.push(receivedToken);
            return { reclaimedBytes: 2 * 1024 ** 3, before: { reclaimableBytes: 2 * 1024 ** 3 }, after: { reclaimableBytes: 0 } };
        },
        sendMessage: async (...args) => messages.push(args),
        now: () => now,
        makeToken: () => token,
        ...overrides,
    });
    return { controller, messages, calls, setNow: value => { now = value; } };
}

test("preview explains the scope and presents a confirmation with cancellation", async () => {
    const { controller, messages, calls } = createController();

    await controller.showPreview(admin);

    assert.equal(calls.length, 0);
    assert.match(messages[0][1], /BuildKit no utilizada/);
    assert.match(messages[0][1], /No se tocarán imágenes, contenedores, volúmenes ni respaldos/);
    assert.equal(messages[0][2].reply_markup.inline_keyboard[0][0].callback_data, `cache_prune:${token}`);
    assert.equal(messages[0][2].reply_markup.inline_keyboard[0][1].callback_data, `cache_cancel:${token}`);
    assert.ok(Buffer.byteLength(messages[0][2].reply_markup.inline_keyboard[0][0].callback_data) <= 64);
});

test("zero cache has no action button and unauthorized requests never preview", async () => {
    const empty = createController({ preview: async () => ({ reclaimableBytes: 0 }) });
    await empty.controller.showPreview(admin);
    assert.match(empty.messages[0][1], /no utilizada/);
    assert.equal(empty.messages[0][2], undefined);

    const unauthorized = createController();
    await unauthorized.controller.showPreview({ chat: { id: -1, type: "group" }, from: { id: admin.from.id } });
    assert.equal(unauthorized.calls.length, 0);
    assert.match(unauthorized.messages[0][1], /No autorizado/);
});

test("confirmation is bound to the requesting admin and token is single-use", async () => {
    const { controller, messages, calls } = createController();
    await controller.showPreview(admin);
    const query = { data: `cache_prune:${token}`, from: admin.from, message: { chat: admin.chat } };

    assert.equal(await controller.handleCallback(query), true);
    assert.deepEqual(calls, [token]);
    assert.match(messages.at(-1)[1], /Limpieza de caché BuildKit confirmada/);
    await controller.handleCallback(query);
    assert.equal(calls.length, 1);
    assert.match(messages.at(-1)[1], /venció o ya fue utilizada/);
});

test("another authorized admin cannot use someone else's preview", async () => {
    const { controller, messages, calls } = createController();
    await controller.showPreview(admin);
    await controller.handleCallback({
        data: `cache_prune:${token}`,
        from: { id: 987654 },
        message: { chat: { id: 987654, type: "private" } },
    });
    assert.equal(calls.length, 0);
    assert.match(messages.at(-1)[1], /pertenece a otro administrador/);
});

test("cancel and expiry never prune", async () => {
    const cancelled = createController();
    await cancelled.controller.showPreview(admin);
    await cancelled.controller.handleCallback({
        data: `cache_cancel:${token}`,
        from: admin.from,
        message: { chat: admin.chat },
    });
    assert.equal(cancelled.calls.length, 0);
    assert.match(cancelled.messages.at(-1)[1], /cancelada/);

    const expired = createController();
    await expired.controller.showPreview(admin);
    expired.setNow(1_000 + PREVIEW_TTL_MS);
    await expired.controller.handleCallback({
        data: `cache_prune:${token}`,
        from: admin.from,
        message: { chat: admin.chat },
    });
    assert.equal(expired.calls.length, 0);
    assert.match(expired.messages.at(-1)[1], /venció/);
});

test("host cache changes require a fresh preview and byte formatter stays readable", async () => {
    const stale = createController({
        prune: async () => { const error = new Error("stale"); error.code = "preview_stale"; throw error; },
    });
    await stale.controller.showPreview(admin);
    await stale.controller.handleCallback({ data: `cache_prune:${token}`, from: admin.from, message: { chat: admin.chat } });
    assert.match(stale.messages.at(-1)[1], /cambió/);
    assert.match(buildBuildCachePreviewMessage({ reclaimableBytes: 1024, reclaimableEntries: 1 }), /1 KiB/);
});
