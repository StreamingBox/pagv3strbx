const pool = require("../db");

async function ensureSettingsTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
            setting_key   VARCHAR(128) PRIMARY KEY,
            setting_value TEXT         NOT NULL,
            updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
}

async function getSetting(key) {
    await ensureSettingsTable();
    const [[row]] = await pool.query(
        "SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1",
        [key]
    );
    return String(row?.setting_value || "").trim();
}

async function setSetting(key, value) {
    await ensureSettingsTable();
    await pool.query(
        `INSERT INTO app_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, String(value || "").trim()]
    );
}

async function readWaToken() {
    return getSetting("wasender_token");
}

async function readWebhookSecret() {
    const storedSecret = await getSetting("wasender_webhook_secret");
    return storedSecret || String(process.env.WASENDER_WEBHOOK_SECRET || "").trim();
}

module.exports = {
    ensureSettingsTable,
    getSetting,
    setSetting,
    readWaToken,
    readWebhookSecret,
};
