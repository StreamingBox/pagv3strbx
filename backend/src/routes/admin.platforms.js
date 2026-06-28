const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { normalizeCurrency } = require("../utils/currency");
const { getPlatformFallbacks } = require("../services/platformFallbacks.service");

const router = express.Router();

function normalizePromoColor(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const match = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!match) return null;
    const hex = match[1];
    return `#${hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex}`.toUpperCase();
}

function normalizeProductDetails(value) {
    const text = String(value || "").replace(/\r\n/g, "\n").trim();
    return text ? text.slice(0, 5000) : null;
}

function isDuplicateEntry(error) {
    return String(error?.code || "") === "ER_DUP_ENTRY";
}

function duplicatePlatformMessage(error) {
    const message = String(error?.message || "");
    if (message.includes("slug")) return "Ya existe una plataforma con ese slug.";
    if (message.includes("name")) return "Ya existe una plataforma con ese nombre.";
    return "Ya existe una plataforma con esos datos.";
}

// GET /admin/platforms
// Devuelve plataformas + info de categoría (si existe)
router.get("/admin/platforms", requireAuth, requireRole("admin"), async (req, res) => {
    const [rows] = await pool.query(`
    SELECT 
      p.*,
      c.id AS category_id,
      c.name AS category_name,
      c.slug AS category_slug
    FROM platforms p
    LEFT JOIN categories c ON c.id = p.category_id
    ORDER BY p.id DESC
  `);

    res.json(rows);
});

router.get("/admin/platform-fallbacks", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const sourcePlatformId = req.query?.sourcePlatformId ? Number(req.query.sourcePlatformId) : null;
        const rows = await getPlatformFallbacks(pool, sourcePlatformId);
        return res.json(rows);
    } catch (e) {
        return res.status(500).json({ message: "Error cargando equivalencias." });
    }
});

router.post("/admin/platform-fallbacks", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const sourcePlatformId = Number(req.body?.source_platform_id ?? req.body?.sourcePlatformId);
        const fallbackPlatformId = Number(req.body?.fallback_platform_id ?? req.body?.fallbackPlatformId);
        const priority = Math.max(1, Number(req.body?.priority || 1));

        if (!Number.isInteger(sourcePlatformId) || sourcePlatformId <= 0 || !Number.isInteger(fallbackPlatformId) || fallbackPlatformId <= 0) {
            return res.status(400).json({ message: "source_platform_id y fallback_platform_id son obligatorios." });
        }
        if (sourcePlatformId === fallbackPlatformId) {
            return res.status(400).json({ message: "La plataforma fallback debe ser diferente a la plataforma origen." });
        }

        const [platformRows] = await pool.query(
            `SELECT id FROM platforms WHERE id IN (?, ?)`,
            [sourcePlatformId, fallbackPlatformId]
        );
        if (platformRows.length !== 2) {
            return res.status(404).json({ message: "Una de las plataformas no existe." });
        }

        await pool.query(
            `INSERT INTO platform_fallbacks (source_platform_id, fallback_platform_id, priority, is_active)
             VALUES (?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE priority = VALUES(priority), is_active = 1`,
            [sourcePlatformId, fallbackPlatformId, priority]
        );

        return res.status(201).json({ ok: true });
    } catch (e) {
        return res.status(500).json({ message: "Error guardando equivalencia." });
    }
});

router.patch("/admin/platform-fallbacks/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const priority = req.body?.priority !== undefined ? Math.max(1, Number(req.body.priority || 1)) : null;
        const isActive = req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : null;

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ message: "id invalido." });
        }

        await pool.query(
            `UPDATE platform_fallbacks
             SET priority = COALESCE(?, priority),
                 is_active = COALESCE(?, is_active)
             WHERE id = ?`,
            [priority, isActive, id]
        );

        return res.json({ ok: true });
    } catch (e) {
        return res.status(500).json({ message: "Error actualizando equivalencia." });
    }
});

router.delete("/admin/platform-fallbacks/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ message: "id invalido." });
        }
        await pool.query("DELETE FROM platform_fallbacks WHERE id = ?", [id]);
        return res.json({ ok: true });
    } catch (e) {
        return res.status(500).json({ message: "Error eliminando equivalencia." });
    }
});

// POST /admin/platforms
router.post("/admin/platforms", requireAuth, requireRole("admin"), async (req, res) => {
    const {
        name, slug, category_id, type,
        is_promo, promo_color, show_device_rule, product_details
    } = req.body || {};

    if (!name || !slug) {
        return res.status(400).json({ message: "name y slug son obligatorios." });
    }

    const promoEnabled = is_promo ? 1 : 0;
    const promoColor = promoEnabled ? (normalizePromoColor(promo_color) || "#22D3EE") : null;
    const showDeviceRule = show_device_rule === undefined ? 1 : (show_device_rule ? 1 : 0);

    let r;
    try {
        [r] = await pool.query(
            `INSERT INTO platforms (
                name, slug, category_id, type, is_active, allowed_currencies,
                is_promo, promo_color, show_device_rule, product_details
             )
             VALUES (?, ?, ?, ?, 1, 'COP,MXN,USD', ?, ?, ?, ?)`,
            [name, slug, category_id ?? null, type ?? 'normal', promoEnabled, promoColor, showDeviceRule, normalizeProductDetails(product_details)]
        );
    } catch (error) {
        if (isDuplicateEntry(error)) {
            return res.status(409).json({ message: duplicatePlatformMessage(error) });
        }
        throw error;
    }

    res.status(201).json({
        id: r.insertId,
        name,
        slug,
        category_id: category_id ?? null,
        type: type ?? 'normal',
        is_active: 1,
        allowed_currencies: "COP,MXN,USD",
        is_promo: promoEnabled,
        promo_color: promoColor,
        show_device_rule: showDeviceRule,
        product_details: normalizeProductDetails(product_details)
    });
});

// PATCH /admin/platforms/:id
router.patch("/admin/platforms/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const { id } = req.params;

    const {
        name, slug, is_active, category_id, type, allowed_currencies,
        is_promo, promo_color, show_device_rule, product_details
    } = req.body || {};

    let allowedCurrenciesCSV = undefined;

    // Si llega allowed_currencies, lo validamos
    if (allowed_currencies !== undefined) {
        const valid = ["COP", "MXN", "USD", "USDT"];

        const list = Array.isArray(allowed_currencies)
            ? allowed_currencies
            : String(allowed_currencies)
                .split(",")
                .map((x) => x.trim().toUpperCase())
                .filter(Boolean);

        const clean = [...new Set(list)]
            .filter((x) => valid.includes(x))
            .map((x) => normalizeCurrency(x, x))
            .filter((x) => ["COP", "MXN", "USD"].includes(x));

        if (!clean.length) {
            return res.status(400).json({
                message: "allowed_currencies inválido. Usa COP, MXN, USD.",
            });
        }

        allowedCurrenciesCSV = clean.join(",");
    }

    const promoFlag = is_promo !== undefined ? (is_promo ? 1 : 0) : null;
    const normalizedPromoColor = promo_color !== undefined ? normalizePromoColor(promo_color) : null;
    const showDeviceRule = show_device_rule !== undefined ? (show_device_rule ? 1 : 0) : null;
    const hasProductDetails = Object.prototype.hasOwnProperty.call(req.body || {}, "product_details");
    const productDetails = hasProductDetails ? normalizeProductDetails(product_details) : null;

    try {
        await pool.query(
            `UPDATE platforms
         SET name = COALESCE(?, name),
             slug = COALESCE(?, slug),
             is_active = COALESCE(?, is_active),
             category_id = COALESCE(?, category_id),
             type = COALESCE(?, type),
             allowed_currencies = COALESCE(?, allowed_currencies),
             is_promo = COALESCE(?, is_promo),
             show_device_rule = COALESCE(?, show_device_rule),
             product_details = CASE WHEN ? = 1 THEN ? ELSE product_details END,
             promo_color = CASE
                WHEN ? = 0 THEN NULL
                WHEN ? = 1 THEN COALESCE(?, promo_color, '#22D3EE')
                ELSE promo_color
             END
         WHERE id = ?`,
            [
                name ?? null,
                slug ?? null,
                is_active ?? null,
                category_id ?? null,
                type ?? null,
                allowedCurrenciesCSV ?? null,
                promoFlag,
                showDeviceRule,
                hasProductDetails ? 1 : 0,
                productDetails,
                promoFlag,
                promoFlag,
                normalizedPromoColor,
                id,
            ]
        );
    } catch (error) {
        if (isDuplicateEntry(error)) {
            return res.status(409).json({ message: duplicatePlatformMessage(error) });
        }
        throw error;
    }

    res.json({ ok: true });
});

module.exports = router;
