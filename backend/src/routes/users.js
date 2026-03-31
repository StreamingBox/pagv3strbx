const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../db");

const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

// Admin crea usuario (sin auto-registro)
router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { name, email, password, role } = req.body || {};

        if (!name || !email || !password) {
            return res.status(400).json({ message: "name, email y password son obligatorios." });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const finalRole = role === "admin" ? "admin" : "user";

        // validar si existe
        const [exists] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [normalizedEmail]);
        if (exists.length) return res.status(409).json({ message: "Ese email ya existe." });

        const password_hash = await bcrypt.hash(password, 12);

        const [result] = await pool.query(
            `INSERT INTO users (name, email, password_hash, role, status)
       VALUES (?, ?, ?, ?, 'active')`,
            [name, normalizedEmail, password_hash, finalRole]
        );

        return res.status(201).json({
            user: { id: result.insertId, name, email: normalizedEmail, role: finalRole, status: "active" },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

module.exports = router;
