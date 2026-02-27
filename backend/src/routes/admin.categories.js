const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

function slugify(str = "") {
    return String(str)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // quita acentos
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

// GET /admin/categories
router.get("/admin/categories", requireAuth, requireRole("admin"), async (req, res) => {
    const [rows] = await pool.query(
        `SELECT id, name, slug, sort_order, is_active
     FROM categories
     ORDER BY sort_order ASC, name ASC`
    );
    res.json(rows);
});

// POST /admin/categories
router.post("/admin/categories", requireAuth, requireRole("admin"), async (req, res) => {
    const { name, slug, sort_order } = req.body || {};
    if (!name) return res.status(400).json({ message: "name es obligatorio." });

    const finalSlug = slug ? slugify(slug) : slugify(name);
    if (!finalSlug) return res.status(400).json({ message: "slug inválido." });

    const [r] = await pool.query(
        `INSERT INTO categories (name, slug, sort_order, is_active)
     VALUES (?, ?, ?, 1)`,
        [name, finalSlug, Number(sort_order || 0)]
    );

    res.status(201).json({
        id: r.insertId,
        name,
        slug: finalSlug,
        sort_order: Number(sort_order || 0),
        is_active: 1,
    });
});

// PATCH /admin/categories/:id
router.patch("/admin/categories/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const { id } = req.params;
    const { name, slug, sort_order, is_active } = req.body || {};

    const finalSlug = slug ? slugify(slug) : null;

    await pool.query(
        `UPDATE categories
     SET name = COALESCE(?, name),
         slug = COALESCE(?, slug),
         sort_order = COALESCE(?, sort_order),
         is_active = COALESCE(?, is_active)
     WHERE id = ?`,
        [name ?? null, finalSlug ?? null, sort_order ?? null, is_active ?? null, id]
    );

    res.json({ ok: true });
});

module.exports = router;
