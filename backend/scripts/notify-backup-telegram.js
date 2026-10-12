#!/usr/bin/env node
require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env"), override: false });

const axios = require("axios");

function getRecipients(rawIds) {
    return [...new Set(String(rawIds || "").split(",").map((id) => id.trim()).filter(Boolean))];
}

function createBackupMessage(timestamp, driveTarget) {
    return [
        "✅ Respaldo diario confirmado en Google Drive.",
        `Fecha (UTC): ${timestamp}`,
        `Carpeta: ${driveTarget}`,
        "La carga y la verificación de integridad finalizaron correctamente.",
    ].join("\n");
}

async function notifyBackup({ timestamp, driveTarget, env = process.env, post = axios.post }) {
    const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
    const recipients = getRecipients(env.TELEGRAM_CHAT_IDS);
    if (!token || recipients.length === 0) {
        throw new Error("Telegram backup notification is not configured (token or chat IDs missing)");
    }

    const text = createBackupMessage(timestamp, driveTarget);
    const results = await Promise.allSettled(recipients.map(async (chatId) => {
        const response = await post(
            `https://api.telegram.org/bot${token}/sendMessage`,
            { chat_id: chatId, text },
            { timeout: 15000 },
        );
        if (response?.data?.ok === false) throw new Error("Telegram rejected the message");
    }));
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length > 0) {
        throw new Error(`Telegram notification failed for ${failures.length} of ${recipients.length} recipient(s)`);
    }

    return { sent: recipients.length };
}

if (require.main === module) {
    const [timestamp, driveTarget] = process.argv.slice(2);
    if (!timestamp || !driveTarget) {
        console.error("Usage: notify-backup-telegram.js <timestamp> <drive-target>");
        process.exit(2);
    }

    notifyBackup({ timestamp, driveTarget })
        .then(({ sent }) => console.log(`Telegram backup notification sent to ${sent} recipient(s)`))
        .catch((error) => {
            console.error(`Telegram backup notification error: ${error.message}`);
            process.exitCode = 1;
        });
}

module.exports = { createBackupMessage, getRecipients, notifyBackup };
