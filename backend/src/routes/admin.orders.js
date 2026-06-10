const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { renewSubscription } = require("../services/renewal.service");
const { notifyRenewalSale } = require("../services/telegramBot");

const router = express.Router();

// ✅ Historial de compras (subscriptions) con PAGINACIÓN + FILTROS
router.get("/admin/orders", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const {
            userId,
            status,
            platformId,
            platformName,
            currency,
            q,
            dateFrom,
            dateTo,
        } = req.query;

        // pagination
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 200);
        const offset = (page - 1) * limit;

        const where = [];
        const params = [];

        if (userId) {
            where.push("s.user_id = ?");
            params.push(Number(userId));
        }
        if (status) {
            where.push("s.status = ?");
            params.push(String(status));
        }
        if (platformId) {
            where.push("s.platform_id = ?");
            params.push(Number(platformId));
        }
        if (platformName) {
            where.push("p.name LIKE ?");
            params.push(`%${String(platformName).trim()}%`);
        }
        if (currency) {
            where.push("o.currency = ?");
            params.push(String(currency));
        }

        // búsqueda general: usuario, plataforma, ID de pedido, correo de cuenta vendida
        if (q) {
            const qTrim = String(q).trim();
            const qq = `%${qTrim}%`;
            // Si parece un número busca también por ID exacto de pedido
            const isNumeric = /^\d+$/.test(qTrim);
            if (isNumeric) {
                where.push("(s.id = ? OR o.id = ? OR o.order_code LIKE ? OR u.email LIKE ? OR u.name LIKE ? OR p.name LIKE ? OR pa.email LIKE ?)");
                params.push(Number(qTrim), Number(qTrim), qq, qq, qq, qq, qq);
            } else {
                where.push("(o.order_code LIKE ? OR u.email LIKE ? OR u.name LIKE ? OR p.name LIKE ? OR pa.email LIKE ? OR CAST(s.id AS CHAR) LIKE ?)");
                params.push(qq, qq, qq, qq, qq, qq);
            }
        }

        // rango de fechas (por created_at)
        if (dateFrom) {
            where.push("DATE(o.created_at) >= DATE(?)");
            params.push(String(dateFrom));
        }
        if (dateTo) {
            where.push("DATE(o.created_at) <= DATE(?)");
            params.push(String(dateTo));
        }

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        // total
        const [countRows] = await pool.query(
            `
      SELECT COUNT(*) AS total
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN subscriptions s ON s.id = oi.subscription_id
      JOIN users u ON u.id = s.user_id
      JOIN platforms p ON p.id = s.platform_id
      JOIN durations d ON d.id = s.duration_id
      LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
      ${whereSql}
      `,
            params
        );

        const total = Number(countRows?.[0]?.total || 0);
        const pages = Math.max(Math.ceil(total / limit), 1);

        // items (MariaDB: LIMIT offset, limit => LIMIT ?, ?)
        const [rows] = await pool.query(
            `
      SELECT
        s.id AS orderId,
        oi.id AS itemId,
        o.id AS purchaseOrderId,
        o.order_code AS orderCode,
        s.status,
        oi.price,
        o.currency,
        s.expires_at,
        o.created_at,
        u.id AS userId,
        u.email AS userEmail,
        u.name AS userName,
        p.id AS platformId,
        p.name AS platformName,
        p.slug AS platformSlug,
        d.id AS durationId,
        d.name AS durationName,
        d.days,
        pa.id AS accountId,
        pa.email AS accountEmail,
        pa.profile_number AS accountProfile,
        pa.pin AS accountPin
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN subscriptions s ON s.id = oi.subscription_id
      JOIN users u ON u.id = s.user_id
      JOIN platforms p ON p.id = s.platform_id
      JOIN durations d ON d.id = s.duration_id
      LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
      ${whereSql}
      ORDER BY o.created_at DESC, oi.id DESC
      LIMIT ?, ?
      `,
            [...params, offset, limit]
        );

        return res.json({
            page,
            limit,
            total,
            pages,
            items: rows,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

// ✅ Detalle de una compra (igual que antes)
router.get("/admin/orders/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await pool.query(
            `SELECT
        s.*,
        u.email AS user_email,
        u.name AS user_name,
        p.name AS platform_name,
        d.name AS duration_name,
        d.days,
        pp.is_renewable,
        pa.email AS account_email,
        pa.password AS account_password,
        pa.pin AS account_pin,
        pa.profile_number AS account_profile,
        pa.expires_at AS account_expires_at,
        COALESCE(pa.expires_at, s.expires_at) AS effective_expires_at,
        CASE WHEN pa.expires_at IS NOT NULL THEN DATE(DATE_SUB(pa.expires_at, INTERVAL 5 HOUR)) ELSE DATE(s.expires_at) END AS expires_date
      FROM subscriptions s
      JOIN users u ON u.id = s.user_id
      JOIN platforms p ON p.id = s.platform_id
      JOIN durations d ON d.id = s.duration_id
      LEFT JOIN platform_prices pp ON pp.id = s.platform_price_id
      LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
      WHERE s.id = ?
      LIMIT 1`,
            [id]
        );

        if (!rows.length) return res.status(404).json({ message: "Orden no encontrada." });
        return res.json(rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

/**
 * POST /admin/orders/:id/renew
 * Body: { newAccountId?, deductWallet, overridePrice?, note? }
 */
router.post("/admin/orders/:id/renew", requireAuth, requireRole("admin"), async (req, res) => {
    const orderId = Number(req.params.id);
    const { newAccountId, deductWallet, overridePrice, note } = req.body || {};

    if (!Number.isFinite(orderId) || orderId <= 0) {
        return res.status(400).json({ message: "ID de pedido inválido." });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const result = await renewSubscription({
            conn,
            subscriptionId: orderId,
            actorUserId: req.user.id,
            actorRole: "admin",
            deductWallet: deductWallet !== false,
            overridePrice,
            note,
            newAccountId,
            allowAccountChange: true,
        });

        await conn.commit();

        const [userRows] = await pool.query(
            "SELECT name, email FROM users WHERE id = ? LIMIT 1",
            [result.userId]
        );
        const buyer = userRows?.[0] || null;
        notifyRenewalSale({
            seller: buyer?.name || buyer?.email || `ID ${result.userId}`,
            platform: result.platformName,
            total: result.amountCharged,
            currency: result.currency,
            newBalance: result.newBalance,
            orderCode: result.renewalOrderCode,
            subscriptionId: result.subscriptionId,
            renewalOrderId: result.renewalOrderId,
            previousOrderCode: result.previousOrderCode,
            actor: req.user.email || req.user.name || "admin",
        }).catch((e) => console.error("[TelegramBot] notifyRenewalSale admin error:", e?.message || e));

        return res.json(result);
    } catch (err) {
        await conn.rollback();
        console.error("Error POST /admin/orders/:id/renew:", err);
        return res.status(err?.status || 500).json({ message: err?.message || "Error interno al renovar." });
    } finally {
        conn.release();
    }
});

router.get("/admin/renewals/logs", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
        const offset = (page - 1) * limit;
        const q = String(req.query.q || "").trim();
        const actorRole = String(req.query.actorRole || "").trim();

        const where = [];
        const params = [];

        if (q) {
            const qq = `%${q}%`;
            where.push(`(
                srl.renewal_order_code LIKE ? OR
                srl.previous_order_code LIKE ? OR
                u.email LIKE ? OR
                p.name LIKE ? OR
                actor.email LIKE ?
            )`);
            params.push(qq, qq, qq, qq, qq);
        }

        if (actorRole) {
            where.push("srl.actor_role = ?");
            params.push(actorRole);
        }

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        const [[countRow]] = await pool.query(
            `SELECT COUNT(*) AS total
             FROM subscription_renewal_logs srl
             JOIN users u ON u.id = srl.user_id
             LEFT JOIN users actor ON actor.id = srl.actor_user_id
             LEFT JOIN platforms p ON p.id = srl.platform_id
             ${whereSql}`,
            params
        );

        const [rows] = await pool.query(
            `SELECT
                srl.*,
                u.email AS user_email,
                u.name AS user_name,
                actor.email AS actor_email,
                p.name AS platform_name
             FROM subscription_renewal_logs srl
             JOIN users u ON u.id = srl.user_id
             LEFT JOIN users actor ON actor.id = srl.actor_user_id
             LEFT JOIN platforms p ON p.id = srl.platform_id
             ${whereSql}
             ORDER BY srl.created_at DESC, srl.id DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return res.json({
            ok: true,
            items: rows,
            total: Number(countRow?.total || 0),
            page,
            limit,
            totalPages: Math.max(Math.ceil(Number(countRow?.total || 0) / limit), 1),
        });
    } catch (err) {
        console.error("Error GET /admin/renewals/logs:", err);
        return res.status(500).json({ message: "Error cargando logs de renovaciones." });
    }
});

// ✅ Vencimientos (Admin) - Todas las cuentas próximas a vencer o vencidas
router.get("/admin/orders-expiring", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.max(1, Number(req.query.limit) || 20);
        const offset = (page - 1) * limit;

        const { q, platform, email, accountEmail } = req.query;
        const effectiveExpiresSql = "COALESCE(acc.expires_at, s.expires_at)";
        const effectiveExpiresDateSql =
            "CASE WHEN acc.expires_at IS NOT NULL THEN DATE(DATE_SUB(acc.expires_at, INTERVAL 5 HOUR)) ELSE DATE(s.expires_at) END";
        const todayBogotaSql = "DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))";
        const notResoldLaterSql = `
            NOT EXISTS (
                SELECT 1
                FROM order_items oi_later
                JOIN orders o_later ON o_later.id = oi_later.order_id
                JOIN subscriptions s_later ON s_later.id = oi_later.subscription_id
                JOIN platform_accounts acc_later ON acc_later.id = s_later.platform_account_id
                WHERE s_later.id <> s.id
                  AND s_later.status != 'cancelled'
                  AND (
                    (acc.identity_id IS NOT NULL AND acc_later.identity_id = acc.identity_id)
                    OR (
                      COALESCE(acc.email, '') <> ''
                      AND LOWER(COALESCE(acc_later.email, '')) = LOWER(COALESCE(acc.email, ''))
                      AND COALESCE(CAST(acc_later.profile_number AS CHAR), '') = COALESCE(CAST(acc.profile_number AS CHAR), '')
                      AND (
                        acc_later.platform_id = acc.platform_id
                        OR EXISTS (
                          SELECT 1
                          FROM platform_fallbacks pf
                          WHERE COALESCE(pf.is_active, 1) = 1
                            AND (
                              (pf.source_platform_id = acc.platform_id AND pf.fallback_platform_id = acc_later.platform_id)
                              OR (pf.source_platform_id = acc_later.platform_id AND pf.fallback_platform_id = acc.platform_id)
                            )
                        )
                      )
                    )
                  )
                  AND o_later.created_at > COALESCE((
                    SELECT MAX(o_current.created_at)
                    FROM order_items oi_current
                    JOIN orders o_current ON o_current.id = oi_current.order_id
                    WHERE oi_current.subscription_id = s.id
                  ), '1000-01-01')
            )
        `;

        // Por defecto: <= 7 días (para el admin es mejor un margen un poco mayor, o igual 3)
        // Usaremos <= 7 días 
        let whereCols = [
            "s.status != 'cancelled'",
            notResoldLaterSql,
        ];
        let params = [];

        if (q) {
            const qRaw = String(q).trim();
            const qNum = Number(qRaw) || 0;
            const isNumericOnly = /^\d+$/.test(qRaw);

            if (isNumericOnly) {
                whereCols.push("s.id = ?");
                params.push(qNum);
            } else {
                whereCols.push(`EXISTS (
                    SELECT 1
                    FROM order_items oi_q
                    JOIN orders o_q ON o_q.id = oi_q.order_id
                    WHERE oi_q.subscription_id = s.id
                      AND o_q.order_code LIKE ?
                )`);
                params.push(`%${qRaw}%`);
            }
        } else {
            whereCols.push(`${effectiveExpiresDateSql} <= DATE_ADD(${todayBogotaSql}, INTERVAL 7 DAY)`);
        }

        if (platform) {
            whereCols.push("p.slug = ?");
            params.push(platform);
        }

        if (email) {
            whereCols.push("u.email LIKE ?");
            params.push(`%${email}%`);
        }

        if (accountEmail) {
            whereCols.push("acc.email LIKE ?");
            params.push(`%${accountEmail}%`);
        }

        // Optional: filter by attended status
        const attended = req.query.attended;
        if (attended !== undefined && attended !== "all") {
            whereCols.push("COALESCE(s.is_attended, 0) = ?");
            params.push(Number(attended) === 1 ? 1 : 0);
        } else if (attended === undefined || attended === "0") {
            whereCols.push("COALESCE(s.is_attended, 0) = 0");
        }

        // New: Filter by expiry status (vencidos, hoy)
        const expiryFilter = req.query.expiryFilter; // 'vencidos', 'hoy', 'all'
        if (expiryFilter === "vencidos") {
            whereCols.push(`${effectiveExpiresDateSql} < ${todayBogotaSql}`);
        } else if (expiryFilter === "hoy") {
            whereCols.push(`${effectiveExpiresDateSql} = ${todayBogotaSql}`);
        }

        const whereSql = "WHERE " + whereCols.join(" AND ");

        const [countRows] = await pool.query(
            `SELECT COUNT(*) as total
             FROM subscriptions s
             JOIN platforms p ON p.id = s.platform_id
             JOIN users u ON u.id = s.user_id
             LEFT JOIN platform_accounts acc ON acc.id = s.platform_account_id
             ${whereSql}`,
            params
        );
        const total = countRows[0].total;
        const pages = Math.ceil(total / limit);

        const [rows] = await pool.query(
            `SELECT
               s.id,
               (
                 SELECT oi2.order_id
                 FROM order_items oi2
                 JOIN orders o2 ON o2.id = oi2.order_id
                 WHERE oi2.subscription_id = s.id
                 ORDER BY o2.created_at DESC, oi2.id DESC
                 LIMIT 1
               ) AS order_id,
               (
                 SELECT o2.order_code
                 FROM order_items oi2
                 JOIN orders o2 ON o2.id = oi2.order_id
                 WHERE oi2.subscription_id = s.id
                 ORDER BY o2.created_at DESC, oi2.id DESC
                 LIMIT 1
               ) AS order_code,
               s.platform_id,
               s.platform_account_id,
               s.expires_at AS subscription_expires_at,
               acc.expires_at AS account_expires_at,
               ${effectiveExpiresSql} AS expires_at,
               ${effectiveExpiresSql} AS effective_expires_at,
               ${effectiveExpiresDateSql} AS expires_date,
               DATEDIFF(${effectiveExpiresDateSql}, ${todayBogotaSql}) AS days_remaining,
               s.status,
               s.price,
               s.currency,
               s.is_attended,
               u.email AS user_email,
               p.name AS platform_name,
               p.slug AS platform_slug,
               acc.email AS account_email,
               acc.password AS account_password,
               acc.profile_number
             FROM subscriptions s
             JOIN platforms p ON p.id = s.platform_id
             JOIN users u ON u.id = s.user_id
             LEFT JOIN platform_accounts acc ON acc.id = s.platform_account_id
             ${whereSql}
             ORDER BY
               (SELECT MIN(CASE WHEN ex_acc.expires_at IS NOT NULL THEN DATE(DATE_SUB(ex_acc.expires_at, INTERVAL 5 HOUR)) ELSE DATE(ex.expires_at) END)
                FROM subscriptions ex
                LEFT JOIN platform_accounts ex_acc ON ex_acc.id = ex.platform_account_id
                WHERE ex.platform_account_id = s.platform_account_id
                  AND ex.status != 'cancelled'
                  AND ex.platform_account_id IS NOT NULL
               ) ASC,
               COALESCE(acc.email, '') ASC,
               ${effectiveExpiresDateSql} ASC,
               ${effectiveExpiresSql} ASC
             LIMIT ?, ?`,
            [...params, offset, limit]
        );

        return res.json({
            page,
            limit,
            total,
            pages,
            items: rows,
        });

    } catch (err) {
        console.error("Error en GET /admin/orders-expiring:", err);
        return res.status(500).json({ message: "Error cargando vencimientos." });
    }
});

// ✅ Toggle is_attended
router.post("/admin/orders/:id/attend", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const orderId = Number(req.params.id);
        const { is_attended } = req.body;

        if (!Number.isInteger(orderId) || orderId <= 0) {
            return res.status(400).json({ message: "ID de pedido inválido." });
        }

        await pool.query("UPDATE subscriptions SET is_attended = ? WHERE id = ?", [is_attended ? 1 : 0, orderId]);
        return res.json({ ok: true });
    } catch (err) {
        console.error("Error en POST /admin/orders/:id/attend:", err);
        return res.status(500).json({ message: "Error actualizando estado." });
    }
});

// ✅ Bulk attend expirations (Admin)
router.post("/admin/orders/attend-bulk", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
        const uniqueIds = Array.from(new Set(
            rawIds
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value) && value > 0)
        ));

        if (!uniqueIds.length) {
            return res.status(400).json({ message: "El archivo no contiene IDs de vencimientos validos." });
        }

        if (uniqueIds.length > 2000) {
            return res.status(400).json({ message: "Maximo 2000 vencimientos por carga." });
        }

        const placeholders = uniqueIds.map(() => "?").join(",");
        const [existingRows] = await pool.query(
            `SELECT id, is_attended FROM subscriptions WHERE id IN (${placeholders})`,
            uniqueIds
        );

        const foundIds = new Set(existingRows.map((row) => Number(row.id)));
        const notFoundIds = uniqueIds.filter((id) => !foundIds.has(id));
        const alreadyAttended = existingRows.filter((row) => Number(row.is_attended) === 1).length;

        const [result] = await pool.query(
            `UPDATE subscriptions
             SET is_attended = 1
             WHERE id IN (${placeholders})
               AND COALESCE(is_attended, 0) = 0`,
            uniqueIds
        );

        return res.json({
            ok: true,
            requested: rawIds.length,
            unique: uniqueIds.length,
            found: existingRows.length,
            updated: Number(result?.affectedRows || 0),
            alreadyAttended,
            notFound: notFoundIds.length,
            notFoundIds: notFoundIds.slice(0, 25),
        });
    } catch (err) {
        console.error("Error en POST /admin/orders/attend-bulk:", err);
        return res.status(500).json({ message: "Error actualizando vencimientos masivos." });
    }
});

// ✅ Count pending expirations (Admin)
router.get("/admin/orders-expiring-count", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const effectiveExpiresDateSql =
            "CASE WHEN acc.expires_at IS NOT NULL THEN DATE(DATE_SUB(acc.expires_at, INTERVAL 5 HOUR)) ELSE DATE(s.expires_at) END";
        const todayBogotaSql = "DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))";
        const [rows] = await pool.query(
            `SELECT COUNT(*) as count
             FROM subscriptions s
             LEFT JOIN platform_accounts acc ON acc.id = s.platform_account_id
             WHERE s.status != 'cancelled'
               AND COALESCE(s.is_attended, 0) = 0
               AND ${effectiveExpiresDateSql} <= ${todayBogotaSql}
               AND NOT EXISTS (
                   SELECT 1
                   FROM order_items oi_later
                   JOIN orders o_later ON o_later.id = oi_later.order_id
                   JOIN subscriptions s_later ON s_later.id = oi_later.subscription_id
                   JOIN platform_accounts acc_later ON acc_later.id = s_later.platform_account_id
                   WHERE s_later.id <> s.id
                     AND s_later.status != 'cancelled'
                     AND (
                       (acc.identity_id IS NOT NULL AND acc_later.identity_id = acc.identity_id)
                       OR (
                         COALESCE(acc.email, '') <> ''
                         AND LOWER(COALESCE(acc_later.email, '')) = LOWER(COALESCE(acc.email, ''))
                         AND COALESCE(CAST(acc_later.profile_number AS CHAR), '') = COALESCE(CAST(acc.profile_number AS CHAR), '')
                         AND (
                           acc_later.platform_id = acc.platform_id
                           OR EXISTS (
                             SELECT 1
                             FROM platform_fallbacks pf
                             WHERE COALESCE(pf.is_active, 1) = 1
                               AND (
                                 (pf.source_platform_id = acc.platform_id AND pf.fallback_platform_id = acc_later.platform_id)
                                 OR (pf.source_platform_id = acc_later.platform_id AND pf.fallback_platform_id = acc.platform_id)
                               )
                           )
                         )
                       )
                     )
                     AND o_later.created_at > COALESCE((
                       SELECT MAX(o_current.created_at)
                       FROM order_items oi_current
                       JOIN orders o_current ON o_current.id = oi_current.order_id
                       WHERE oi_current.subscription_id = s.id
                     ), '1000-01-01')
               )`
        );
        return res.json({ count: rows[0].count });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error contando vencimientos." });
    }
});

module.exports = router;
