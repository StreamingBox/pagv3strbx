const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const {
    formatBogotaDateTime,
    normalizeEventLinkUrl,
    parseBogotaDateTimeInput,
} = require("../utils/eventLinks");
const { toSqlDateTime } = require("../utils/date");

const router = express.Router();

function toPositiveMoney(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(2)) : null;
}

function serializeEvent(row) {
    return {
        id: Number(row.id),
        platformId: Number(row.platform_id),
        platformName: row.platform_name,
        platformSlug: row.platform_slug,
        title: row.title,
        url: row.url,
        endsAt: row.ends_at,
        endsAtBogota: formatBogotaDateTime(row.ends_at),
        unitCost: Number(row.unit_cost || 0),
        currency: row.currency || "COP",
        isActive: Boolean(row.is_active),
        publishedAt: row.published_at,
        closedAt: row.closed_at,
        deliveredCount: Number(row.delivered_count || 0),
    };
}

async function getEventPlatform(conn, platformId, { lock = false } = {}) {
    const [rows] = await conn.query(
        `SELECT id, name, slug, is_active, is_event_link, event_link_unit_cost, event_link_monthly_cost
           FROM platforms
          WHERE id = ?
          LIMIT 1${lock ? " FOR UPDATE" : ""}`,
        [platformId]
    );
    return rows[0] || null;
}

router.get("/admin/event-links/platforms", requireAuth, requireRole("admin"), async (_req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT p.id, p.name, p.slug, p.event_link_unit_cost, p.event_link_monthly_cost,
                    COUNT(CASE WHEN e.is_active = 1 AND e.ends_at > UTC_TIMESTAMP() THEN 1 END) AS live_count
               FROM platforms p
               LEFT JOIN event_links e ON e.platform_id = p.id
              WHERE COALESCE(p.is_event_link, 0) = 1
              GROUP BY p.id
              ORDER BY p.name ASC`
        );
        return res.json(rows.map((row) => ({
            id: Number(row.id),
            name: row.name,
            slug: row.slug,
            unitCost: Number(row.event_link_unit_cost || 0),
            monthlyCost: Number(row.event_link_monthly_cost || 0),
            liveCount: Number(row.live_count || 0),
        })));
    } catch (error) {
        console.error("GET /admin/event-links/platforms", error);
        return res.status(500).json({ message: "No se pudieron cargar los productos por evento." });
    }
});

router.get("/admin/event-links", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const platformId = Number(req.query?.platformId || 0);
        const params = [];
        const platformFilter = platformId > 0 ? "WHERE e.platform_id = ?" : "";
        if (platformId > 0) params.push(platformId);

        const [rows] = await pool.query(
            `SELECT e.*, p.name AS platform_name, p.slug AS platform_slug,
                    COUNT(DISTINCT s.id) AS delivered_count
               FROM event_links e
               JOIN platforms p ON p.id = e.platform_id
               LEFT JOIN subscriptions s ON s.event_link_id = e.id
               ${platformFilter}
              GROUP BY e.id
              ORDER BY e.is_active DESC, e.ends_at DESC, e.id DESC
              LIMIT 100`,
            params
        );
        return res.json(rows.map(serializeEvent));
    } catch (error) {
        console.error("GET /admin/event-links", error);
        return res.status(500).json({ message: "No se pudo cargar el historial de enlaces." });
    }
});

router.patch("/admin/event-links/platforms/:platformId/costs", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const platformId = Number(req.params.platformId);
        const unitCost = toPositiveMoney(req.body?.unitCost, null);
        const monthlyCost = toPositiveMoney(req.body?.monthlyCost, null);
        if (!Number.isInteger(platformId) || platformId <= 0 || unitCost === null || monthlyCost === null) {
            return res.status(400).json({ message: "Indica costos COP validos (cero o mayores)." });
        }

        const [result] = await pool.query(
            `UPDATE platforms
                SET event_link_unit_cost = ?, event_link_monthly_cost = ?
              WHERE id = ? AND COALESCE(is_event_link, 0) = 1`,
            [unitCost, monthlyCost, platformId]
        );
        if (!result.affectedRows) {
            return res.status(404).json({ message: "No existe un producto configurado para enlaces por evento con ese ID." });
        }
        return res.json({ ok: true, unitCost, monthlyCost });
    } catch (error) {
        console.error("PATCH /admin/event-links/platforms/:platformId/costs", error);
        return res.status(500).json({ message: "No se pudieron guardar los costos." });
    }
});

router.post("/admin/event-links", requireAuth, requireRole("admin"), async (req, res) => {
    const platformId = Number(req.body?.platformId);
    const title = String(req.body?.title || "").trim().slice(0, 180);
    const url = normalizeEventLinkUrl(req.body?.url);
    const endsAt = parseBogotaDateTimeInput(req.body?.endsAt);
    const unitCost = toPositiveMoney(req.body?.unitCost, null);

    if (!Number.isInteger(platformId) || platformId <= 0 || !title || !url || !endsAt || unitCost === null) {
        return res.status(400).json({ message: "Completa producto, nombre del partido, enlace de YouTube, hora de cierre Colombia y costo por enlace." });
    }
    if (endsAt.getTime() <= Date.now() + 60 * 1000) {
        return res.status(400).json({ message: "La hora de finalizacion debe ser posterior a la hora actual de Colombia." });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const platform = await getEventPlatform(conn, platformId, { lock: true });
        if (!platform || !Number(platform.is_event_link)) {
            const error = new Error("Selecciona un producto configurado para enlaces por evento.");
            error.status = 404;
            throw error;
        }

        // Event products may start hidden until the first match is published.
        // Publishing is the explicit action that makes this product visible in
        // the catalog; it does not change any unrelated platform.
        await conn.query(
            `UPDATE platforms
                SET is_active = 1
              WHERE id = ? AND COALESCE(is_event_link, 0) = 1`,
            [platformId]
        );

        // Only one current match can be sold for the same product. Previous links
        // remain auditable with their subscriptions, but stop appearing in catalog.
        await conn.query(
            `UPDATE event_links
                SET is_active = 0, closed_at = UTC_TIMESTAMP()
              WHERE platform_id = ? AND is_active = 1`,
            [platformId]
        );
        const [insert] = await conn.query(
            `INSERT INTO event_links
                (platform_id, title, url, ends_at, unit_cost, currency, is_active, published_by_user_id, published_at)
             VALUES (?, ?, ?, ?, ?, 'COP', 1, ?, UTC_TIMESTAMP())`,
            [platformId, title, url, toSqlDateTime(endsAt), unitCost, req.user?.id || req.user?.sub || null]
        );
        const [rows] = await conn.query(
            `SELECT e.*, p.name AS platform_name, p.slug AS platform_slug, 0 AS delivered_count
               FROM event_links e JOIN platforms p ON p.id = e.platform_id
              WHERE e.id = ? LIMIT 1`,
            [insert.insertId]
        );
        await conn.commit();
        return res.status(201).json({ ok: true, event: serializeEvent(rows[0]) });
    } catch (error) {
        await conn.rollback();
        console.error("POST /admin/event-links", error);
        return res.status(error.status || 500).json({ message: error.message || "No se pudo publicar el enlace." });
    } finally {
        conn.release();
    }
});

router.patch("/admin/event-links/:id/close", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Enlace invalido." });
        await pool.query(
            "UPDATE event_links SET is_active = 0, closed_at = UTC_TIMESTAMP() WHERE id = ?",
            [id]
        );
        return res.json({ ok: true });
    } catch (error) {
        console.error("PATCH /admin/event-links/:id/close", error);
        return res.status(500).json({ message: "No se pudo cerrar el enlace." });
    }
});

module.exports = router;
