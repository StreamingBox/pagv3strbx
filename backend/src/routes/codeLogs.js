const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();
const geoCache = new Map();

function normalizeIp(ip) {
    const raw = String(ip || "").trim();
    if (!raw) return "";
    const first = raw.split(",")[0].trim();
    if (first.startsWith("::ffff:")) return first.slice(7);
    return first;
}

async function resolveGeo(ip) {
    const normalizedIp = normalizeIp(ip);
    if (!normalizedIp) return { ip: "", country: "Desconocido", city: "", flag: "🌐" };

    if (
        normalizedIp === "::1" ||
        normalizedIp === "127.0.0.1" ||
        normalizedIp.startsWith("192.168.") ||
        normalizedIp.startsWith("10.") ||
        normalizedIp.startsWith("172.16.") ||
        normalizedIp.startsWith("172.17.") ||
        normalizedIp.startsWith("172.18.") ||
        normalizedIp.startsWith("172.19.") ||
        normalizedIp.startsWith("172.2") ||
        normalizedIp.startsWith("172.30.") ||
        normalizedIp.startsWith("172.31.")
    ) {
        return { ip: normalizedIp, country: "Local", city: "", flag: "🖥️" };
    }

    if (geoCache.has(normalizedIp)) return geoCache.get(normalizedIp);

    try {
        const res = await fetch(`https://ipwho.is/${encodeURIComponent(normalizedIp)}`);
        const data = await res.json().catch(() => ({}));
        const geo = {
            ip: normalizedIp,
            country: data?.success ? (data.country || "Desconocido") : "Desconocido",
            city: data?.success ? (data.city || "") : "",
            flag: data?.success ? (data.flag?.emoji || "🌐") : "🌐",
        };
        geoCache.set(normalizedIp, geo);
        return geo;
    } catch {
        const geo = { ip: normalizedIp, country: "Desconocido", city: "", flag: "🌐" };
        geoCache.set(normalizedIp, geo);
        return geo;
    }
}

/**
 * GET /admin/code-logs
 * Solo ADMIN
 */
router.get("/admin/code-logs", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const [rows] = await pool.query(`
      SELECT
        cd.id,
        cd.order_id,
        cd.platform_slug,
        cd.order_email,
        cd.delivered_code,
        cd.status,
        cd.message,
        cd.requester_ip,
        cd.user_agent,
        cd.created_at,
        u.email AS requested_by
      FROM code_deliveries cd
      LEFT JOIN users u ON u.id = cd.requested_by_user_id
      ORDER BY cd.created_at DESC
      LIMIT 500
    `);

        const uniqueIps = Array.from(new Set(rows.map((r) => normalizeIp(r.requester_ip)).filter(Boolean)));
        const geoEntries = await Promise.all(uniqueIps.map(async (ip) => [ip, await resolveGeo(ip)]));
        const geoMap = new Map(geoEntries);

        const logs = rows.map((row) => {
            const normalizedIp = normalizeIp(row.requester_ip);
            const geo = geoMap.get(normalizedIp) || { country: "Desconocido", city: "", flag: "🌐" };
            return {
                ...row,
                requester_ip: normalizedIp || row.requester_ip,
                requester_country: geo.country,
                requester_city: geo.city,
                requester_flag: geo.flag,
            };
        });

        res.json({ ok: true, logs });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, message: "Error cargando logs" });
    }
});

module.exports = router;
