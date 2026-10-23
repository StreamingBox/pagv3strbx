const assert = require("node:assert/strict");
const test = require("node:test");
const { isServerReliefAdmin, createServerReliefHandler, buildServerReliefMessage } = require("../src/services/telegramServerRelief.service");

const privateAdmin = { chat: { id: 123456, type: "private" }, from: { id: 123456 } };
const admins = new Set([123456, -999]);
const MiB = 1024 ** 2;

test("maintenance requires an explicit admin sender in their own private chat", () => {
    assert.equal(isServerReliefAdmin(privateAdmin, admins), true);
    assert.equal(isServerReliefAdmin(privateAdmin, new Set()), false);
    assert.equal(isServerReliefAdmin({ ...privateAdmin, from: { id: 789 } }, admins), false);
    assert.equal(isServerReliefAdmin({ chat: { id: -999, type: "supergroup" }, from: { id: 123456 } }, admins), false);
    assert.equal(isServerReliefAdmin({ chat: { id: 123456, type: "private" } }, admins), false);
});

test("unauthorized updates never inspect resources or mutate files", async () => {
    const messages = [];
    let calls = 0;
    const handler = createServerReliefHandler({ authorizedIds: admins, sendMessage: async (...args) => messages.push(args), getResources: () => { calls++; }, relieve: () => { calls++; } });
    await handler({ chat: { id: -999, type: "supergroup" }, from: { id: 123456 } });
    assert.equal(calls, 0);
    assert.equal(messages.length, 1);
    assert.match(messages[0][1], /No autorizado/);
});

test("admin receives progress and measured before/after with audit", async () => {
    const messages = [];
    const audit = [];
    let sample = 0;
    const handler = createServerReliefHandler({
        authorizedIds: admins,
        sendMessage: async (...args) => messages.push(args),
        getResources: async () => ({ memory: { availableBytes: (++sample === 1 ? 100 : 200) * MiB }, storage: { availableBytes: 1000 * MiB }, temporaryStorage: { availableBytes: sample * 10 * MiB, memoryBacked: true }, swap: { usedBytes: 400 * MiB } }),
        relieve: async () => ({ status: "completed", archived: 2, releasedBytes: 80 * MiB, localCopiesRemoved: 2, driveVerified: 2, archiveId: "fictitious-run", skipped: 0, failed: 0 }),
        logger: { info: (...args) => audit.push(args), error: () => assert.fail("unexpected error") },
    });
    await handler(privateAdmin);
    assert.equal(messages.length, 2);
    assert.match(messages[0][1], /Revisando recursos/);
    assert.match(messages[1][1], /100 MiB -> 200 MiB/);
    assert.match(messages[1][1], /80 MiB/);
    assert.match(messages[1][1], /Copias de trabajo locales retiradas tras verificar Drive: 2/);
    assert.match(messages[1][1], /tmp usa memoria temporal/);
    assert.equal(audit[0][1].actorId, 123456);
    assert.equal(audit[0][1].archived, 2);
});

test("server relief shows BuildKit preview after reporting temporary cleanup", async () => {
    const messages = [];
    const calls = [];
    const handler = createServerReliefHandler({
        authorizedIds: admins,
        sendMessage: async (...args) => messages.push(args),
        getResources: async () => ({}),
        relieve: async () => ({ status: "completed", archived: 0, releasedBytes: 0, skipped: 0, failed: 0 }),
        showBuildCachePreview: async msg => calls.push(msg.from.id),
        logger: { info: () => { }, error: () => assert.fail("unexpected error") },
    });

    await handler(privateAdmin);

    assert.equal(calls[0], privateAdmin.from.id);
    assert.equal(messages.length, 2);
    assert.match(messages[1][1], /No se encontraron temporales/);
});

test("busy, cooldown and partial passes report the concrete reason", () => {
    assert.match(buildServerReliefMessage({ status: "busy" }), /en curso/);
    assert.match(buildServerReliefMessage({ status: "cooldown" }), /5 minutos/);
    const message = buildServerReliefMessage({ status: "completed", archived: 0, releasedBytes: 0, skipped: 0, failed: 1, diskLimited: false, failureCodes: { unrecognized_entry: 1 } }, {}, {});
    assert.match(message, /Limpieza parcial/);
    assert.match(message, /formato de archivo no permitido: 1/);
    assert.match(message, /No se borro ningun original/);
    assert.doesNotMatch(message, /fallo de verificacion/);
});
