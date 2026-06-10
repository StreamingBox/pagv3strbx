const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { normalizeCurrency, currencyAliases } = require("../utils/currency");
const { getSalesChannel, isLiteChannel } = require("../utils/salesChannel");

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
    const salesChannel = getSalesChannel(req);
    const liteCatalog = isLiteChannel(salesChannel);
    const liteFlag = liteCatalog ? 1 : 0;

    // 1) Leer moneda del usuario
    const [urows] = await pool.query(
      "SELECT currency FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    const userCurrency = liteCatalog ? "COP" : normalizeCurrency(urows?.[0]?.currency || "COP", "COP");
    const aliases = liteCatalog ? ["COP"] : currencyAliases(userCurrency, "COP");
    const currencyPlaceholders = aliases.map(() => "?").join(",");
    const allowedCurrencySql = aliases.map(() => "FIND_IN_SET(?, UPPER(REPLACE(p.allowed_currencies, ' ', ''))) > 0").join(" OR ");

    // 2) Traer catálogo filtrado por moneda + categoría + allowed_currencies
    const [rows] = await pool.query(
      `
      SELECT
        pp.id AS platformPriceId,
        p.id AS platformId,
        p.name AS platformName,
        p.slug AS platformSlug,
        p.type AS platformType,
        p.is_promo AS platformPromo,
        p.promo_color AS platformPromoColor,

        c.id AS categoryId,
        c.name AS categoryName,
        c.slug AS categorySlug,
        c.sort_order AS categorySortOrder,

        d.id AS durationId,
        d.name AS durationName,
        d.days,

        CASE WHEN ? = 1 THEN pp.lite_price_cop ELSE pp.price END AS price,
        CASE WHEN ? = 1 THEN 'COP' ELSE pp.currency END AS currency,
        pp.is_renewable,

        CASE
          WHEN COALESCE(s.stock, 0) > 0 THEN COALESCE(s.stock, 0)
          ELSE COALESCE(fs.fallback_stock, 0)
        END AS stock,
        COALESCE(s.stock, 0) AS directStock,
        COALESCE(fs.fallback_stock, 0) AS fallbackStock
      FROM platform_prices pp
      JOIN platforms p ON p.id = pp.platform_id
      JOIN durations d ON d.id = pp.duration_id

      LEFT JOIN (
        SELECT
          platform_id,
          COUNT(*) AS stock
        FROM platform_accounts
        WHERE status = 'available'
          AND (expires_at IS NULL OR DATE(DATE_SUB(expires_at, INTERVAL 5 HOUR)) >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR)))
        GROUP BY platform_id
      ) s ON s.platform_id = p.id

      LEFT JOIN (
        SELECT
          pf.source_platform_id AS platform_id,
          SUM(COALESCE(stock.stock, 0)) AS fallback_stock
        FROM platform_fallbacks pf
        JOIN platforms fp ON fp.id = pf.fallback_platform_id AND fp.is_active = 1
        LEFT JOIN (
          SELECT platform_id, COUNT(*) AS stock
          FROM platform_accounts
          WHERE status = 'available'
            AND (expires_at IS NULL OR DATE(DATE_SUB(expires_at, INTERVAL 5 HOUR)) >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR)))
          GROUP BY platform_id
        ) stock ON stock.platform_id = pf.fallback_platform_id
        WHERE pf.is_active = 1
        GROUP BY pf.source_platform_id
      ) fs ON fs.platform_id = p.id

      LEFT JOIN categories c ON c.id = p.category_id

      WHERE p.is_active = 1
        AND (
          (
            ? = 1
            AND UPPER(pp.currency) = 'COP'
            AND COALESCE(pp.show_in_lite, 0) = 1
            AND pp.lite_price_cop IS NOT NULL
          )
          OR
          (
            ? = 0
            AND pp.is_active = 1
            AND UPPER(pp.currency) IN (${currencyPlaceholders})
            AND (
              p.allowed_currencies IS NULL
              OR p.allowed_currencies = ''
              OR ${allowedCurrencySql}
            )
          )
        )

      ORDER BY
        COALESCE(c.sort_order, 9999) ASC,
        COALESCE(c.name, 'zzz') ASC,
        p.name ASC,
        d.days ASC
      `,
      [liteFlag, liteFlag, liteFlag, liteFlag, ...aliases, ...aliases]
    );

    res.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    return res.json(rows);
  } catch (err) {
    console.error("GET /catalog error:", err);
    return res.status(500).json({ message: "Error interno." });
  }
});

router.get("/debug-catalog", requireAuth, requireRole("admin"), async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ message: "Ruta no encontrada." });
  }
  try {
    const [rows] = await pool.query(
      `SELECT
        pp.id AS platformPriceId,
        p.id AS platformId,
        p.name AS platformName,
        p.slug AS platformSlug,
        p.type AS platformType,
        p.is_promo AS platformPromo,
        p.promo_color AS platformPromoColor,
        c.id AS categoryId,
        c.name AS categoryName,
        d.id AS durationId,
        d.name AS durationName,
        pp.price,
        pp.currency,
        pp.is_renewable,
        CASE WHEN COALESCE(s.stock, 0) > 0 THEN COALESCE(s.stock, 0) ELSE COALESCE(fs.fallback_stock, 0) END AS stock,
        COALESCE(s.stock, 0) AS directStock,
        COALESCE(fs.fallback_stock, 0) AS fallbackStock
      FROM platform_prices pp
      JOIN platforms p ON p.id = pp.platform_id
      JOIN durations d ON d.id = pp.duration_id
      LEFT JOIN (
        SELECT platform_id, COUNT(*) AS stock FROM platform_accounts
        WHERE status = 'available' AND (expires_at IS NULL OR DATE(DATE_SUB(expires_at, INTERVAL 5 HOUR)) >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR)))
        GROUP BY platform_id
      ) s ON s.platform_id = p.id
      LEFT JOIN (
        SELECT pf.source_platform_id AS platform_id, SUM(COALESCE(stock.stock, 0)) AS fallback_stock
        FROM platform_fallbacks pf
        LEFT JOIN (
          SELECT platform_id, COUNT(*) AS stock FROM platform_accounts
          WHERE status = 'available' AND (expires_at IS NULL OR DATE(DATE_SUB(expires_at, INTERVAL 5 HOUR)) >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR)))
          GROUP BY platform_id
        ) stock ON stock.platform_id = pf.fallback_platform_id
        WHERE pf.is_active = 1
        GROUP BY pf.source_platform_id
      ) fs ON fs.platform_id = p.id
      LEFT JOIN categories c ON c.id = p.category_id LIMIT 5`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /catalog/:platformPriceId/notify
 * Registra a un usuario para recibir notificación cuando haya stock.
 */
router.post("/catalog/:platformPriceId/notify", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.sub;
    const { platformPriceId } = req.params;

    if (!platformPriceId) {
      return res.status(400).json({ message: "Invalid ID." });
    }

    await pool.query(
      `INSERT INTO stock_subscriptions (user_id, platform_price_id, is_notified)
       VALUES (?, ?, FALSE)
       ON DUPLICATE KEY UPDATE
         created_at = CASE WHEN is_notified = TRUE THEN CURRENT_TIMESTAMP ELSE created_at END,
         is_notified = FALSE`,
      [userId, platformPriceId]
    );

    return res.json({ ok: true, message: "¡Suscrito! Te avisaremos cuando haya stock." });
  } catch (err) {
    console.error("POST /catalog/notify error:", err);
    return res.status(500).json({ message: "Error interno al suscribirte." });
  }
});

module.exports = router;
