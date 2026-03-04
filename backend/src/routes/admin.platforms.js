const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

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
    const { name, slug, category_id, whatsapp_instructions } = req.body || {};

    if (!name || !slug) {
        return res.status(400).json({ message: "name y slug son obligatorios." });
    }

    const [r] = await pool.query(
        `INSERT INTO platforms (name, slug, category_id, is_active, allowed_currencies, whatsapp_instructions)
     VALUES (?, ?, ?, 1, 'COP,MXN,USD', ?)`,
        [name, slug, category_id ?? null, whatsapp_instructions ?? null]
    );

    res.status(201).json({
        id: r.insertId,
        name,
        slug,
        category_id: category_id ?? null,
        is_active: 1,
        allowed_currencies: "COP,MXN,USD",
        whatsapp_instructions: whatsapp_instructions ?? null,
    });
});

// PATCH /admin/platforms/:id
router.patch("/admin/platforms/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const { id } = req.params;

    // Acepta category_id, allowed_currencies, y whatsapp_instructions
    const { name, slug, is_active, category_id, allowed_currencies, whatsapp_instructions } = req.body || {};

    let allowedCurrenciesCSV = undefined;

    // Si llega allowed_currencies, lo validamos
    if (allowed_currencies !== undefined) {
        const valid = ["COP", "MXN", "USD"];

        const list = Array.isArray(allowed_currencies)
            ? allowed_currencies
            : String(allowed_currencies)
                .split(",")
                .map((x) => x.trim().toUpperCase())
                .filter(Boolean);

        const clean = [...new Set(list)].filter((x) => valid.includes(x));

        if (!clean.length) {
            return res.status(400).json({
                message: "allowed_currencies inválido. Usa COP, MXN, USD.",
            });
        }

        allowedCurrenciesCSV = clean.join(",");
    }

    await pool.query(
        `UPDATE platforms
     SET name = COALESCE(?, name),
         slug = COALESCE(?, slug),
         is_active = COALESCE(?, is_active),
         category_id = COALESCE(?, category_id),
         allowed_currencies = COALESCE(?, allowed_currencies),
         whatsapp_instructions = COALESCE(?, whatsapp_instructions)
     WHERE id = ?`,
        [
            name ?? null,
            slug ?? null,
            is_active ?? null,
            category_id ?? null,
            allowedCurrenciesCSV ?? null,
            whatsapp_instructions !== undefined ? whatsapp_instructions : null,
            id,
        ]
    );

    res.json({ ok: true });
});

module.exports = router;
