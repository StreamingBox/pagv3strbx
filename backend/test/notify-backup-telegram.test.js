const test = require("node:test");
const assert = require("node:assert/strict");
const { createBackupMessage, getRecipients, notifyBackup, notifyBackupFailure } = require("../scripts/notify-backup-telegram");

test("backup notification lists the verified Drive destination", () => {
    const message = createBackupMessage("20261011T144219Z", "gdrive:StreamingBoxBackups/production/scheduled/20261011T144219Z");
    assert.match(message, /confirmado en Google Drive/);
    assert.match(message, /20261011T144219Z/);
    assert.match(message, /gdrive:StreamingBoxBackups\/production\/scheduled/);
    assert.match(message, /verificación de integridad/);
});

test("recipient IDs are trimmed and deduplicated", () => {
    assert.deepEqual(getRecipients(" 123,456,123,, "), ["123", "456"]);
});

test("notification sends only to configured Telegram recipients", async () => {
    const calls = [];
    const result = await notifyBackup({
        timestamp: "20261011T144219Z",
        driveTarget: "gdrive:backup/20261011T144219Z",
        env: { TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_CHAT_IDS: "123,456" },
        post: async (...args) => calls.push(args),
    });

    assert.equal(result.sent, 2);
    assert.deepEqual(calls.map((call) => call[1].chat_id), ["123", "456"]);
    assert.ok(calls.every((call) => call[1].text.includes("verificación de integridad")));
});

test("missing Telegram configuration fails without attempting a request", async () => {
    let requested = false;
    await assert.rejects(
        notifyBackup({
            timestamp: "20261011T144219Z",
            driveTarget: "gdrive:backup/20261011T144219Z",
            env: {},
            post: async () => { requested = true; },
        }),
        /not configured/,
    );
    assert.equal(requested, false);
});

test("Telegram API rejection is reported as a failed notification", async () => {
    await assert.rejects(
        notifyBackup({
            timestamp: "20261011T144219Z",
            driveTarget: "gdrive:backup/20261011T144219Z",
            env: { TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_CHAT_IDS: "123" },
            post: async () => ({ data: { ok: false } }),
        }),
        /failed for 1 of 1 recipient/,
    );
});

test("failed Drive copies are reported as pending, never confirmed", async () => {
    const calls = [];
    await notifyBackupFailure({ count: 2, env: { TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_CHAT_IDS: "123" }, post: async (...args) => calls.push(args) });
    assert.match(calls[0][1].text, /2 copia\(s\) pendientes/);
    assert.doesNotMatch(calls[0][1].text, /confirmado en Google Drive/);
    assert.doesNotMatch(createBackupMessage("fictional", "gdrive:fictional"), /diario/);
});
