const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { insertCredentialLinkWithRetry } = require("../utils/tokens");
const { buildWhatsappMessage } = require("../utils/whatsappMessage");

const router = express.Router();

// ✅ Historial de compras (subscriptions) con PAGINACIÓN + FILTROS
router.get("/admin/orders", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const {
            userId,
            status,
            platformId,
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
        if (currency) {
            where.push("s.currency = ?");
            params.push(String(currency));
        }

        // búsqueda general
        if (q) {
            const qq = `%${String(q).trim()}%`;
            where.push("(u.email LIKE ? OR u.name LIKE ? OR p.name LIKE ?)");
            params.push(qq, qq, qq);
        }

        // rango de fechas (por created_at)
        if (dateFrom) {
            where.push("DATE(s.created_at) >= DATE(?)");
            params.push(String(dateFrom));
        }
        if (dateTo) {
            where.push("DATE(s.created_at) <= DATE(?)");
            params.push(String(dateTo));
        }

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        // total
        const [countRows] = await pool.query(
            `
      SELECT COUNT(*) AS total
      FROM subscriptions s
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
        s.status,
        s.price,
        s.currency,
        s.expires_at,
        s.created_at,
        u.id AS userId,
        u.email AS userEmail,
        u.name AS userName,
        p.id AS platformId,
        p.name AS platformName,
        d.id AS durationId,
        d.name AS durationName,
        d.days,
        pa.id AS accountId,
        pa.email AS accountEmail,
        pa.profile_number AS accountProfile,
        pa.pin AS accountPin
      FROM subscriptions s
      JOIN users u ON u.id = s.user_id
      JOIN platforms p ON p.id = s.platform_id
      JOIN durations d ON d.id = s.duration_id
      LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
      ${whereSql}
      ORDER BY s.id DESC
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
        pa.email AS account_email,
        pa.password AS account_password,
        pa.pin AS account_pin,
        pa.profile_number AS account_profile
      FROM subscriptions s
      JOIN users u ON u.id = s.user_id
      JOIN platforms p ON p.id = s.platform_id
      JOIN durations d ON d.id = s.duration_id
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

        // 1. Fetch subscription with duration days + price
        const [rows] = await conn.query(
            `SELECT s.id, s.user_id, s.platform_id, s.platform_account_id,
                    s.expires_at, s.price, s.currency, s.status,
                    d.days, p.name AS platform_name, u.email AS user_email
             FROM subscriptions s
             JOIN durations d ON d.id = s.duration_id
             JOIN platforms p ON p.id = s.platform_id
             JOIN users u ON u.id = s.user_id
             WHERE s.id = ?
             LIMIT 1`,
            [orderId]
        );

        if (!rows.length) {
            await conn.rollback();
            return res.status(404).json({ message: "Pedido no encontrado." });
        }

        const sub = rows[0];
        const days = Number(sub.days || 30);
        const amount = Number(overridePrice !== undefined ? overridePrice : sub.price);
        const userId = sub.user_id;

        // 2. Calculate new expiry: extend from MAX(now, current_expiry)
        const base = sub.expires_at && new Date(sub.expires_at) > new Date()
            ? new Date(sub.expires_at)
            : new Date();
        base.setDate(base.getDate() + days);
        const newExpiry = base.toISOString().slice(0, 19).replace("T", " ");

        // 3. Build update fields
        const updateFields = ["expires_at = ?", "status = 'active'"];
        const updateParams = [newExpiry];

        if (newAccountId) {
            updateFields.push("platform_account_id = ?");
            updateParams.push(Number(newAccountId));
        }
        updateParams.push(orderId);

        await conn.query(
            `UPDATE subscriptions SET ${updateFields.join(", ")} WHERE id = ?`,
            updateParams
        );

        let newBalance = null;

        // 4. Optionally deduct wallet
        if (deductWallet) {
            const [wrows] = await conn.query(
                "SELECT id, balance, currency FROM wallets WHERE user_id = ? FOR UPDATE",
                [userId]
            );
            if (!wrows.length) {
                await conn.rollback();
                return res.status(404).json({ message: "Billetera del usuario no encontrada." });
            }

            const walletId = wrows[0].id;
            const balance = Number(wrows[0].balance);

            if (balance < amount) {
                await conn.rollback();
                return res.status(400).json({
                    message: `Saldo insuficiente. Tiene ${balance.toLocaleString("es-CO")} y se requieren ${amount.toLocaleString("es-CO")}.`
                });
            }

            newBalance = balance - amount;

            await conn.query("UPDATE wallets SET balance = ? WHERE id = ?", [newBalance, walletId]);

            await conn.query(
                `INSERT INTO wallet_transactions
                    (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
                 VALUES (?, 'purchase', ?, ?, 'renewal', ?, ?)`,
                [walletId, -amount, newBalance, orderId, note || `Renovación pedido #${orderId}`]
            );
        }

        await conn.commit();

        // --- Build WhatsApp Receipt ---
        const finalAccountId = newAccountId || sub.platform_account_id;
        let whatsappText = "";

        if (finalAccountId) {
            // Fetch account details
            const [accRows] = await conn.query(
                "SELECT email, password, profile_number, pin FROM platform_accounts WHERE id = ?",
                [finalAccountId]
            );

            // Get newest token or create one using the shared util
            const [tokRows] = await conn.query(
                "SELECT token FROM credential_links WHERE subscription_id = ? ORDER BY id DESC LIMIT 1",
                [orderId]
            );

            let token = tokRows.length > 0 ? tokRows[0].token : null;
            if (!token) {
                // ✅ Usa insertCredentialLinkWithRetry para consistencia y anti-colisión
                token = await insertCredentialLinkWithRetry(pool, {
                    subscriptionId: orderId,
                    createdByUserId: req.user.id,
                    showWhatsapp: false,
                });
            }

            if (accRows.length > 0) {
                const resultObj = {
                    subscriptionId: orderId,
                    plan: { platform_name: sub.platform_name },
                    account: accRows[0],
                    expiresAt: new Date(newExpiry),
                    token: token
                };

                const orderCodeStr = `ORD-${String(orderId).padStart(6, "0")}`;

                whatsappText = buildWhatsappMessage({
                    orderCode: orderCodeStr,
                    results: [resultObj],
                    baseUrl: process.env.BASE_URL || "https://strbx.com.co"
                });
            }
        }

        return res.json({
            ok: true,
            orderId,
            newExpiry,
            newAccountId: finalAccountId,
            deducted: deductWallet ? amount : 0,
            newBalance,
            whatsappText
        });
    } catch (err) {
        await conn.rollback();
        console.error("Error POST /admin/orders/:id/renew:", err);
        return res.status(500).json({ message: "Error interno al renovar." });
    } finally {
        conn.release();
    }
});

// ✅ Vencimientos (Admin) - Todas las cuentas próximas a vencer o vencidas
router.get("/admin/orders-expiring", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.max(1, Number(req.query.limit) || 20);
        const offset = (page - 1) * limit;

        const { q, platform, email } = req.query;

        // Por defecto: <= 7 días (para el admin es mejor un margen un poco mayor, o igual 3)
        // Usaremos <= 7 días 
        let whereCols = [
            "s.status != 'cancelled'",
            "s.expires_at <= DATE_ADD(NOW(), INTERVAL 7 DAY)"
        ];
        let params = [];

        if (q) {
            whereCols.push("s.id = ?");
            const qStr = String(q).trim().replace(/^ORD-0*/i, "");
            const qNum = Number(qStr) || 0;
            params.push(qNum);
        }

        if (platform) {
            whereCols.push("p.slug = ?");
            params.push(platform);
        }

        if (email) {
            whereCols.push("u.email LIKE ?");
            params.push(`%${email}%`);
        }

        // Optional: filter by attended status
        const attended = req.query.attended;
        if (attended !== undefined && attended !== "all") {
            whereCols.push("s.is_attended = ?");
            params.push(Number(attended) === 1 ? 1 : 0);
        } else if (attended === undefined || attended === "0") {
            // By default, showing pending ones
            whereCols.push("s.is_attended = 0");
        }

        const whereSql = "WHERE " + whereCols.join(" AND ");

        const [countRows] = await pool.query(
            `SELECT COUNT(*) as total
             FROM subscriptions s
             JOIN platforms p ON p.id = s.platform_id
             JOIN users u ON u.id = s.user_id
             ${whereSql}`,
            params
        );
        const total = countRows[0].total;
        const pages = Math.ceil(total / limit);

        const [rows] = await pool.query(
            `SELECT
               s.id,
               s.platform_id,
               s.platform_account_id,
               s.expires_at,
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
             ORDER BY s.expires_at ASC
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
        const orderId = req.params.id;
        const { is_attended } = req.body;

        await pool.query("UPDATE subscriptions SET is_attended = ? WHERE id = ?", [is_attended ? 1 : 0, orderId]);

        return res.json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error actualizando estado de atención." });
    }
});

module.exports = router;

