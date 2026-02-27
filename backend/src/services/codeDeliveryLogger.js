const pool = require("../db");

function createCodeLogger({ req, orderNumber, platformSlug }) {
    const requestedByUserId = req.user?.id || null;
    const role = req.user?.role || "user";
    const isAdmin = String(role).toLowerCase() === "admin";

    const requesterIp = req.ip;
    const userAgent = req.headers["user-agent"] || null;

    const logBase = {
        requested_by_user_id: requestedByUserId,
        order_id: Number(orderNumber),
        platform_slug: String(platformSlug || ""),
        order_email: "",
        requester_ip: String(requesterIp || ""),
        user_agent: userAgent,
        platform_account_id: null,
        credential_fingerprint: null,
        delivered_code: null,
        status: "error",
        message: null,
    };

    async function saveLog(partial) {
        const row = { ...logBase, ...partial };
        try {
            await pool.query("INSERT INTO code_deliveries SET ?", row);
        } catch (e) {
            console.error("LOG ERROR code_deliveries:", e.message);
        }
    }

    return { saveLog, isAdmin, requestedByUserId };
}

module.exports = { createCodeLogger };
