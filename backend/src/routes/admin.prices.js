const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { normalizeCurrency } = require("../utils/currency");

const router = express.Router();

/**
 * GET /admin/prices
 * Lista planes (platform_prices) con joins a platforms y durations
 * (devuelve una fila por moneda)
 */
router.get("/admin/prices", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT
        pp.id,
        pp.platform_id,
        p.name AS platform_name,
        pp.duration_id,
        d.name AS duration_name,
        d.days,
        pp.price,
        pp.currency,
        pp.is_active,
        pp.created_at,
        pp.updated_at
      FROM platform_prices pp
      JOIN platforms p ON p.id = pp.platform_id
      JOIN durations d ON d.id = pp.duration_id
      ORDER BY p.name ASC, d.days ASC, pp.id DESC`
        );

        return res.json(rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

/**
 * GET /admin/prices/grouped
 * 1 fila por (platform_id + duration_id), con COP/MXN/USD en columnas
 */
router.get("/admin/prices/grouped", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { page = 1, limit = 5, q = "" } = req.query;
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.max(parseInt(limit, 10) || 5, 1);
        const offset = (pageNum - 1) * limitNum;

        let whereClause = "";
        let params = [];

        if (q && q.trim().length > 0) {
            whereClause = "WHERE p.name LIKE ? OR d.name LIKE ?";
            const qStr = `%${q.trim()}%`;
            params = [qStr, qStr];
        }

        const countSql = `
            SELECT COUNT(*) as total FROM (
                SELECT pp.platform_id, pp.duration_id
                FROM platform_prices pp
                JOIN platforms p ON p.id = pp.platform_id
                JOIN durations d ON d.id = pp.duration_id
                ${whereClause}
                GROUP BY pp.platform_id, pp.duration_id
            ) as sub
        `;
        const [countRows] = await pool.query(countSql, params);
        const total = countRows[0]?.total || 0;

        const querySql = `
            SELECT
                pp.platform_id,
                p.name AS platform_name,
                pp.duration_id,
                d.name AS duration_name,
                d.days,

                MAX(CASE WHEN pp.currency='COP' THEN pp.id END)        AS id_cop,
                MAX(CASE WHEN pp.currency='MXN' THEN pp.id END)        AS id_mxn,
                MAX(CASE WHEN pp.currency IN ('USD','USDT') THEN pp.id END)        AS id_usd,

                MAX(CASE WHEN pp.currency='COP' THEN pp.price END)     AS price_cop,
                MAX(CASE WHEN pp.currency='MXN' THEN pp.price END)     AS price_mxn,
                MAX(CASE WHEN pp.currency IN ('USD','USDT') THEN pp.price END)     AS price_usd,

                MAX(CASE WHEN pp.currency='COP' THEN pp.is_active END) AS active_cop,
                MAX(CASE WHEN pp.currency='MXN' THEN pp.is_active END) AS active_mxn,
                MAX(CASE WHEN pp.currency IN ('USD','USDT') THEN pp.is_active END) AS active_usd,

                MAX(pp.is_renewable) AS is_renewable

            FROM platform_prices pp
            JOIN platforms p ON p.id = pp.platform_id
            JOIN durations d ON d.id = pp.duration_id
            ${whereClause}
            GROUP BY pp.platform_id, p.name, pp.duration_id, d.name, d.days
            ORDER BY p.name ASC, d.days ASC
            LIMIT ${limitNum} OFFSET ${offset}
        `;

        const [rows] = await pool.query(querySql, params);

        return res.json({
            items: rows,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

/**
 * POST /admin/prices
 * Crea un plan/precio (una sola moneda)
 * body: { platform_id, duration_id, price, currency }
 */
router.post("/admin/prices", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { platform_id, duration_id, price, currency } = req.body || {};

        if (!platform_id || !duration_id || price === undefined) {
            return res.status(400).json({ message: "platform_id, duration_id y price son obligatorios." });
        }

        const requestedCurrency = String(currency || "COP").toUpperCase();
        const finalCurrency = normalizeCurrency(requestedCurrency, "COP");

        if (!["COP", "MXN", "USD", "USDT"].includes(requestedCurrency) || !["COP", "MXN", "USD"].includes(finalCurrency)) {
            return res.status(400).json({ message: "currency inválida. Usa COP, MXN o USD." });
        }

        const [r] = await pool.query(
            `INSERT INTO platform_prices (platform_id, duration_id, price, currency, is_active)
       VALUES (?, ?, ?, ?, 1)`,
            [platform_id, duration_id, price, finalCurrency]
        );

        return res.status(201).json({
            id: r.insertId,
            platform_id,
            duration_id,
            price,
            currency: finalCurrency,
            is_active: 1,
        });
    } catch (err) {
        console.error(err);

        if (String(err?.code || "").includes("ER_DUP_ENTRY")) {
            return res.status(409).json({
                message: "Ya existe un precio para esa plataforma, duración y moneda.",
            });
        }

        return res.status(500).json({ message: "Error interno." });
    }
});

/**
 * POST /admin/prices/multi
 * Crea/actualiza (upsert) precios para COP/MXN/USD en una sola llamada.
 * body: { platform_id, duration_id, prices: { COP?: number, MXN?: number, USD?: number } }
 */
router.post("/admin/prices/multi", requireAuth, requireRole("admin"), async (req, res) => {
    const conn = await pool.getConnection();

    try {
        const { platform_id, duration_id, prices, is_renewable } = req.body || {};
        const pid = Number(platform_id);
        const did = Number(duration_id);
        const renewable = is_renewable ? 1 : 0;

        if (!pid || !did || !prices || typeof prices !== "object") {
            return res.status(400).json({ message: "platform_id, duration_id y prices son obligatorios." });
        }

        const entries = Object.entries(prices)
            .map(([cur, val]) => [normalizeCurrency(String(cur).toUpperCase(), String(cur).toUpperCase()), Number(val)])
            .filter(([cur, val]) => ["COP", "MXN", "USD"].includes(cur) && Number.isFinite(val) && val >= 0);

        if (!entries.length) {
            return res.status(400).json({ message: "prices debe incluir al menos una moneda válida (COP/MXN/USD)." });
        }

        await conn.beginTransaction();

        for (const [currency, price] of entries) {
            await conn.query(
                `
          INSERT INTO platform_prices (platform_id, duration_id, price, currency, is_active, is_renewable)
          VALUES (?, ?, ?, ?, 1, ?)
          ON DUPLICATE KEY UPDATE
            price = VALUES(price),
            is_active = 1,
            is_renewable = VALUES(is_renewable),
            updated_at = NOW()
        `,
                [pid, did, price, currency, renewable]
            );
        }

        await conn.commit();
        return res.json({ ok: true });
    } catch (err) {
        try {
            await conn.rollback();
        } catch { }

        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    } finally {
        conn.release();
    }
});

/**
 * PATCH /admin/prices/:id
 * SOLO permite actualizar:
 * - price
 * - is_active
 *
 * (No permite tocar platform_id/duration_id/currency porque rompe el UNIQUE)
 */
router.patch("/admin/prices/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { id } = req.params;
        const { price, is_active, is_renewable } = req.body || {};

        // si no mandan nada, no hacemos nada
        if (price === undefined && is_active === undefined && is_renewable === undefined) {
            return res.status(400).json({ message: "Debes enviar price, is_active o is_renewable." });
        }

        await pool.query(
            `UPDATE platform_prices
       SET price        = COALESCE(?, price),
           is_active    = COALESCE(?, is_active),
           is_renewable = COALESCE(?, is_renewable),
           updated_at   = NOW()
       WHERE id = ?`,
            [price ?? null, is_active ?? null, is_renewable ?? null, id]
        );

        return res.json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

/**
 * DELETE /admin/prices/:id
 * Borrado lógico: is_active = 0
 */
router.delete("/admin/prices/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`UPDATE platform_prices SET is_active = 0, updated_at = NOW() WHERE id = ?`, [id]);
        return res.json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

module.exports = router;
