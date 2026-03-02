const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

/**
 * GET /catalog
 * Devuelve planes activos + stock disponible por plataforma.
 * stock = cantidad de cuentas disponibles (status='available') no vencidas.
 * Además filtra por la moneda del usuario (users.currency).
 *
 * También devuelve categoryId/categoryName/categorySlug para segmentar (Video/IA/Música/etc).
 *
 * NUEVO: Filtra por monedas permitidas en platforms.allowed_currencies
 * - Si allowed_currencies = "COP" entonces NO sale para MXN/USD
 */
router.get("/catalog", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.sub;

    // 1) Leer moneda del usuario
    const [urows] = await pool.query(
      "SELECT currency FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    const userCurrency = (urows?.[0]?.currency || "COP").toString().toUpperCase();

    // 2) Traer catálogo filtrado por moneda + categoría + allowed_currencies
    const [rows] = await pool.query(
      `
      SELECT
        pp.id AS platformPriceId,
        p.id AS platformId,
        p.name AS platformName,
        p.slug AS platformSlug,

        c.id AS categoryId,
        c.name AS categoryName,
        c.slug AS categorySlug,

        d.id AS durationId,
        d.name AS durationName,
        d.days,

        pp.price,
        pp.currency,
        pp.is_renewable,

        COALESCE(s.stock, 0) AS stock
      FROM platform_prices pp
      JOIN platforms p ON p.id = pp.platform_id
      JOIN durations d ON d.id = pp.duration_id

      LEFT JOIN (
        SELECT
          platform_id,
          COUNT(*) AS stock
        FROM platform_accounts
        WHERE status = 'available'
          AND (expires_at IS NULL OR expires_at > NOW())
        GROUP BY platform_id
      ) s ON s.platform_id = p.id

      LEFT JOIN categories c ON c.id = p.category_id

      WHERE pp.is_active = 1
        AND p.is_active = 1
        AND pp.currency = ?
        AND (p.allowed_currencies IS NULL OR p.allowed_currencies = '' OR FIND_IN_SET(?, p.allowed_currencies) > 0)

      ORDER BY
        COALESCE(c.sort_order, 9999) ASC,
        COALESCE(c.name, 'zzz') ASC,
        p.name ASC,
        d.days ASC
      `,
      [userCurrency, userCurrency]
    );

    return res.json(rows);
  } catch (err) {
    console.error("GET /catalog error:", err);
    return res.status(500).json({ message: "Error interno." });
  }
});

router.get("/debug-catalog", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        pp.id AS platformPriceId,
        p.id AS platformId,
        p.name AS platformName,
        p.slug AS platformSlug,
        c.id AS categoryId,
        c.name AS categoryName,
        d.id AS durationId,
        d.name AS durationName,
        pp.price,
        pp.currency,
        pp.is_renewable,
        COALESCE(s.stock, 0) AS stock
      FROM platform_prices pp
      JOIN platforms p ON p.id = pp.platform_id
      JOIN durations d ON d.id = pp.duration_id
      LEFT JOIN (
        SELECT platform_id, COUNT(*) AS stock FROM platform_accounts
        WHERE status = 'available' AND (expires_at IS NULL OR expires_at > NOW())
        GROUP BY platform_id
      ) s ON s.platform_id = p.id
      LEFT JOIN categories c ON c.id = p.category_id LIMIT 5`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
