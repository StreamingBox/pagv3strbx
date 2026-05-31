const crypto = require("crypto");

function truncate(value, max) {
    const text = String(value || "").trim();
    return text ? text.slice(0, max) : null;
}

function getClientIp(req) {
    const forwarded = String(req.headers["x-forwarded-for"] || "").trim();
    if (forwarded) return truncate(forwarded.split(",")[0], 64);

    const realIp = String(req.headers["x-real-ip"] || "").trim();
    if (realIp) return truncate(realIp, 64);

    return truncate(req.ip || req.socket?.remoteAddress || "", 64);
}

function detectBrowser(userAgent) {
    const ua = String(userAgent || "");
    if (/Edg\//i.test(ua)) return "Edge";
    if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return "Opera";
    if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
    if (/Firefox\//i.test(ua)) return "Firefox";
    if (/CriOS\//i.test(ua)) return "Chrome iOS";
    if (/Chrome\//i.test(ua)) return "Chrome";
    if (/Safari\//i.test(ua) && /Version\//i.test(ua)) return "Safari";
    if (/bot|crawler|spider/i.test(ua)) return "Bot";
    return "Desconocido";
}

function detectOs(userAgent) {
    const ua = String(userAgent || "");
    if (/Android/i.test(ua)) return "Android";
    if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
    if (/Windows NT/i.test(ua)) return "Windows";
    if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
    if (/Linux/i.test(ua)) return "Linux";
    return "Desconocido";
}

function detectDeviceType(userAgent) {
    const ua = String(userAgent || "");
    if (/bot|crawler|spider/i.test(ua)) return "bot";
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return "tablet";
    if (/Mobi|Android|iPhone|iPod/i.test(ua)) return "mobile";
    if (ua) return "desktop";
    return "unknown";
}

function parseUserAgent(userAgent) {
    const browserName = detectBrowser(userAgent);
    const osName = detectOs(userAgent);
    const deviceType = detectDeviceType(userAgent);
    const deviceLabel = `${browserName} / ${osName}`;

    return { browserName, osName, deviceType, deviceLabel };
}

function buildFingerprint({ userAgent, ipAddress }) {
    const source = userAgent || ipAddress || "unknown";
    return crypto.createHash("sha256").update(source).digest("hex");
}

async function recordUserActivity(db, req, userId, options = {}) {
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) return;

    const eventType = truncate(options.eventType || "login", 32) || "login";
    const shouldRecordEvent = options.recordEvent !== false;
    const userAgent = truncate(req.headers["user-agent"] || "", 512);
    const ipAddress = getClientIp(req);
    const parsed = parseUserAgent(userAgent);
    const deviceFingerprint = buildFingerprint({ userAgent, ipAddress });
    const loginIncrement = eventType === "login" ? 1 : 0;

    await db.query(
        `INSERT INTO user_devices
            (user_id, device_fingerprint, device_label, device_type, browser_name, os_name, ip_address, user_agent,
             first_seen_at, last_seen_at, login_count, last_event)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), ?, ?)
         ON DUPLICATE KEY UPDATE
            device_label = VALUES(device_label),
            device_type = VALUES(device_type),
            browser_name = VALUES(browser_name),
            os_name = VALUES(os_name),
            ip_address = VALUES(ip_address),
            user_agent = VALUES(user_agent),
            last_seen_at = UTC_TIMESTAMP(),
            login_count = login_count + ?,
            last_event = VALUES(last_event)`,
        [
            id,
            deviceFingerprint,
            parsed.deviceLabel,
            parsed.deviceType,
            parsed.browserName,
            parsed.osName,
            ipAddress,
            userAgent,
            loginIncrement,
            eventType,
            loginIncrement,
        ]
    );

    if (shouldRecordEvent) {
        await db.query(
            `INSERT INTO user_login_events
                (user_id, event_type, device_fingerprint, device_label, device_type, browser_name, os_name, ip_address, user_agent, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
            [
                id,
                eventType,
                deviceFingerprint,
                parsed.deviceLabel,
                parsed.deviceType,
                parsed.browserName,
                parsed.osName,
                ipAddress,
                userAgent,
            ]
        );
    }
}

async function safelyRecordUserActivity(db, req, userId, options = {}) {
    try {
        await recordUserActivity(db, req, userId, options);
    } catch (err) {
        console.error("[user-activity] No se pudo registrar actividad:", err?.message || err);
    }
}

module.exports = {
    parseUserAgent,
    recordUserActivity,
    safelyRecordUserActivity,
};
