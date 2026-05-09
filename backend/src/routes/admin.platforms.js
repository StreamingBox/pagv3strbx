const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { normalizeCurrency } = require("../utils/currency");

const router = express.Router();

function normalizePromoColor(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const match = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!match) return null;
    const hex = match[1];
    return `#${hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex}`.toUpperCase();
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

// POST /admin/platforms
router.post("/admin/platforms", requireAuth, requireRole("admin"), async (req, res) => {
    const {
        name, slug, category_id, type,
        is_promo, promo_color
    } = req.body || {};

    if (!name || !slug) {
        return res.status(400).json({ message: "name y slug son obligatorios." });
    }

    const promoEnabled = is_promo ? 1 : 0;
    const promoColor = promoEnabled ? (normalizePromoColor(promo_color) || "#22D3EE") : null;

    const [r] = await pool.query(
        `INSERT INTO platforms (
            name, slug, category_id, type, is_active, allowed_currencies, 
            is_promo, promo_color
         )
         VALUES (?, ?, ?, ?, 1, 'COP,MXN,USD', ?, ?)`,
        [name, slug, category_id ?? null, type ?? 'normal', promoEnabled, promoColor]
    );

    res.status(201).json({
        id: r.insertId,
        name,
        slug,
        category_id: category_id ?? null,
        type: type ?? 'normal',
        is_active: 1,
        allowed_currencies: "COP,MXN,USD",
        is_promo: promoEnabled,
        promo_color: promoColor
    });
});

// PATCH /admin/platforms/:id
router.patch("/admin/platforms/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const { id } = req.params;

    const {
        name, slug, is_active, category_id, type, allowed_currencies,
        is_promo, promo_color
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

    await pool.query(
        `UPDATE platforms
     SET name = COALESCE(?, name),
         slug = COALESCE(?, slug),
         is_active = COALESCE(?, is_active),
         category_id = COALESCE(?, category_id),
         type = COALESCE(?, type),
         allowed_currencies = COALESCE(?, allowed_currencies),
         is_promo = COALESCE(?, is_promo),
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
            promoFlag,
            promoFlag,
            normalizedPromoColor,
            id,
        ]
    );

    res.json({ ok: true });
});

module.exports = router;
