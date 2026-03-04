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
    const {
        name, slug, category_id, whatsapp_instructions,
        wa_show_id, wa_show_email, wa_show_pass, wa_show_profile, wa_show_pin, wa_show_expire, wa_show_url
    } = req.body || {};

    if (!name || !slug) {
        return res.status(400).json({ message: "name y slug son obligatorios." });
    }

    const showId = wa_show_id !== undefined ? (wa_show_id ? 1 : 0) : 1;
    const showEmail = wa_show_email !== undefined ? (wa_show_email ? 1 : 0) : 1;
    const showPass = wa_show_pass !== undefined ? (wa_show_pass ? 1 : 0) : 1;
    const showProfile = wa_show_profile !== undefined ? (wa_show_profile ? 1 : 0) : 1;
    const showPin = wa_show_pin !== undefined ? (wa_show_pin ? 1 : 0) : 1;
    const showExpire = wa_show_expire !== undefined ? (wa_show_expire ? 1 : 0) : 1;
    const showUrl = wa_show_url !== undefined ? (wa_show_url ? 1 : 0) : 1;

    const [r] = await pool.query(
        `INSERT INTO platforms (
            name, slug, category_id, is_active, allowed_currencies, 
            whatsapp_instructions, wa_show_id, wa_show_email, wa_show_pass, wa_show_profile, wa_show_pin, wa_show_expire, wa_show_url
         )
         VALUES (?, ?, ?, 1, 'COP,MXN,USD', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, slug, category_id ?? null, whatsapp_instructions ?? null, showId, showEmail, showPass, showProfile, showPin, showExpire, showUrl]
    );

    res.status(201).json({
        id: r.insertId,
        name,
        slug,
        category_id: category_id ?? null,
        is_active: 1,
        allowed_currencies: "COP,MXN,USD",
        whatsapp_instructions: whatsapp_instructions ?? null,
        wa_show_id: showId,
        wa_show_email: showEmail,
        wa_show_pass: showPass,
        wa_show_profile: showProfile,
        wa_show_pin: showPin,
        wa_show_expire: showExpire,
        wa_show_url: showUrl
    });
});

// PATCH /admin/platforms/:id
router.patch("/admin/platforms/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const { id } = req.params;

    const {
        name, slug, is_active, category_id, allowed_currencies, whatsapp_instructions,
        wa_show_id, wa_show_email, wa_show_pass, wa_show_profile, wa_show_pin, wa_show_expire, wa_show_url
    } = req.body || {};

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
         whatsapp_instructions = COALESCE(?, whatsapp_instructions),
         wa_show_id = COALESCE(?, wa_show_id),
         wa_show_email = COALESCE(?, wa_show_email),
         wa_show_pass = COALESCE(?, wa_show_pass),
         wa_show_profile = COALESCE(?, wa_show_profile),
         wa_show_pin = COALESCE(?, wa_show_pin),
         wa_show_expire = COALESCE(?, wa_show_expire),
         wa_show_url = COALESCE(?, wa_show_url)
     WHERE id = ?`,
        [
            name ?? null,
            slug ?? null,
            is_active ?? null,
            category_id ?? null,
            allowedCurrenciesCSV ?? null,
            whatsapp_instructions !== undefined ? whatsapp_instructions : null,
            wa_show_id !== undefined ? (wa_show_id ? 1 : 0) : null,
            wa_show_email !== undefined ? (wa_show_email ? 1 : 0) : null,
            wa_show_pass !== undefined ? (wa_show_pass ? 1 : 0) : null,
            wa_show_profile !== undefined ? (wa_show_profile ? 1 : 0) : null,
            wa_show_pin !== undefined ? (wa_show_pin ? 1 : 0) : null,
            wa_show_expire !== undefined ? (wa_show_expire ? 1 : 0) : null,
            wa_show_url !== undefined ? (wa_show_url ? 1 : 0) : null,
            id,
        ]
    );

    res.json({ ok: true });
});

module.exports = router;
