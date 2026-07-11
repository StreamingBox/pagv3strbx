const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { insertCredentialLinkWithRetry } = require("../utils/tokens");
const {
    bogotaDateOnlyToUtcEndOfDay,
    isStoredDateOnlyExpired,
    toSqlDateTime,
} = require("../utils/date");
const {
    findAvailableAccountForPlatform,
    getCandidatePlatformsForPlatform,
} = require("../services/platformFallbacks.service");
const { buildAccountDeliveryMessage } = require("../utils/deliveryMessage");

const router = express.Router();

/**
 * Admin Soporte
 * - Buscar un subscription por ID (incluye orden/cÃ³digo y credenciales actuales)
 * - Reemplazar la cuenta por otra "available" del mismo platform_id
 *
 * Nota: NO cambia la orden, ni el plan, ni la fecha de expiraciÃ³n (expires_at).
 * Solo cambia platform_account_id y por ende las credenciales mostradas.
 */

async function getReplacementCandidates(conn, { platformId, currentAccountId, additionalPlatformIds = [] }) {
    const candidatePlatforms = await getCandidatePlatformsForPlatform(
        conn,
        platformId,
        additionalPlatformIds
    );
    const candidatePlatformIds = candidatePlatforms.map((candidate) => candidate.platformId);
    const candidatePlaceholders = candidatePlatformIds.map(() => "?").join(",");
    const candidateByPlatformId = new Map(
        candidatePlatforms.map((candidate, index) => [candidate.platformId, { ...candidate, priority: index }])
    );

    const [rows] = await conn.query(
        `SELECT pa.id, pa.email, pa.password, pa.pin, pa.two_factor_secret, pa.profile_number, pa.expires_at,
                pa.platform_id, p.name AS platform_name
           FROM platform_accounts pa
           JOIN platforms p ON p.id = pa.platform_id
          WHERE pa.status = 'available'
            AND pa.id <> ?
            AND pa.platform_id IN (${candidatePlaceholders})
            AND (pa.expires_at IS NULL OR DATE(DATE_SUB(pa.expires_at, INTERVAL 5 HOUR)) >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR)))
          ORDER BY FIELD(pa.platform_id, ${candidatePlaceholders}), pa.id ASC`,
        [Number(currentAccountId || 0), ...candidatePlatformIds, ...candidatePlatformIds]
    );

    return rows.map((row) => {
        const candidate = candidateByPlatformId.get(Number(row.platform_id));
        return {
            id: row.id,
            email: row.email,
            password: row.password,
            pin: row.pin,
            two_factor_secret: row.two_factor_secret,
            profile_number: row.profile_number,
            expiresAt: row.expires_at || null,
            platformId: row.platform_id,
            platformName: row.platform_name,
            candidateSource: candidate?.source || "requested",
            isHistorical: candidate?.source === "historical",
            isFallback: Number(row.platform_id) !== Number(platformId),
        };
    });
}

async function getSubscriptionSupportInfo(conn, subscriptionId) {
    // subscription + order + platform + current account
    const [rows] = await conn.query(
        `SELECT
        s.id AS subscription_id,
        s.user_id,
        s.platform_id,
        s.platform_price_id,
        s.duration_id,
        s.status,
        s.expires_at,
        s.platform_account_id,
        s.delivered_platform_id,
        o.id AS order_id,
        o.order_code,
        p.name AS platform_name,
        p.slug AS platform_slug,
        a.email,
        a.password,
        a.pin,
        a.two_factor_secret,
        a.profile_number,
        a.platform_id AS account_platform_id,
        a.expires_at AS account_expires_at
     FROM subscriptions s
     LEFT JOIN order_items oi ON oi.subscription_id = s.id
     LEFT JOIN orders o ON o.id = oi.order_id
     JOIN platforms p ON p.id = s.platform_id
     JOIN platform_accounts a ON a.id = s.platform_account_id
     WHERE s.id = ?
     LIMIT 1`,
        [subscriptionId]
    );

    if (!rows.length) return null;

    const r = rows[0];

    // token: usar el Ãºltimo (si no existe, crearlo)
    const [tokRows] = await conn.query(
        `SELECT token
       FROM credential_links
      WHERE subscription_id = ?
      ORDER BY id DESC
      LIMIT 1`,
        [subscriptionId]
    );

    let token = tokRows?.[0]?.token;
    if (!token) {
        token = await insertCredentialLinkWithRetry(conn, {
            subscriptionId,
            createdByUserId: r.user_id,
        });
    }

    const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
    const replacementCandidates = await getReplacementCandidates(conn, {
        platformId: r.platform_id,
        currentAccountId: r.platform_account_id,
        additionalPlatformIds: [r.delivered_platform_id, r.account_platform_id],
    });

    const message = buildAccountDeliveryMessage({
        orderCode: r.order_code || `#${r.order_id || "-"}`,
        subscriptionId: r.subscription_id,
        platformName: r.platform_name,
        account: {
            email: r.email,
            password: r.password,
            pin: r.pin,
            two_factor_secret: r.two_factor_secret,
            profile_number: r.profile_number,
        },
        expiresAt: r.expires_at,
        token,
        baseUrl,
    });

    return {
        subscriptionId: r.subscription_id,
        orderId: r.order_id,
        orderCode: r.order_code,
        platformId: r.platform_id,
        platformName: r.platform_name,
        deliveredPlatformId: r.delivered_platform_id,
        status: r.status,
        expiresAt: r.expires_at,
        accountId: r.platform_account_id,
        account: {
            email: r.email,
            password: r.password,
            pin: r.pin,
            profile_number: r.profile_number,
        },
        replacementCandidates,
        suggestedReplacementId: replacementCandidates?.[0]?.id || null,
        token,
        message,
    };
}

// GET /admin/support/subscription/:id
router.get(
    "/admin/support/subscription/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
        const subscriptionId = Number(req.params.id);
        if (!Number.isFinite(subscriptionId) || subscriptionId <= 0) {
            return res.status(400).json({ message: "subscriptionId invÃ¡lido." });
        }
        const conn = await pool.getConnection();
        try {
            const info = await getSubscriptionSupportInfo(conn, subscriptionId);
            if (!info) return res.status(404).json({ message: "No se encontrÃ³ el pedido/subscription." });
            return res.json(info);
        } catch (e) {
            console.error("support get subscription error:", e);
            return res.status(500).json({ message: "Error interno." });
        } finally {
            conn.release();
        }
    }
);

// POST /admin/support/replace-account { subscriptionId }
router.post(
    "/admin/support/replace-account",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
        const subscriptionId = Number(req.body?.subscriptionId);
        const replacementAccountIdRaw = req.body?.replacementAccountId;
        const replacementAccountId =
            replacementAccountIdRaw === undefined || replacementAccountIdRaw === null || replacementAccountIdRaw === ""
                ? null
                : Number(replacementAccountIdRaw);
        if (!Number.isFinite(subscriptionId) || subscriptionId <= 0) {
            return res.status(400).json({ message: "subscriptionId invÃ¡lido." });
        }
        if (replacementAccountId !== null && (!Number.isFinite(replacementAccountId) || replacementAccountId <= 0)) {
            return res.status(400).json({ message: "replacementAccountId invÃ¡lido." });
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            // Lock subscription
            const [subRows] = await conn.query(
                `SELECT s.id, s.user_id, s.platform_id, s.delivered_platform_id, s.status, s.expires_at, s.platform_account_id,
                    pa.platform_id AS account_platform_id,
                    pa.expires_at AS account_expires_at, pa.email AS old_account_email
           FROM subscriptions s
           LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
          WHERE s.id = ?
          FOR UPDATE`,
                [subscriptionId]
            );

            if (!subRows.length) {
                await conn.rollback();
                return res.status(404).json({ message: "Subscription no encontrada." });
            }

            const sub = subRows[0];

            if (sub.status !== "active") {
                await conn.rollback();
                return res.status(409).json({ message: "La subscription no estÃ¡ activa." });
            }

            const expired = isStoredDateOnlyExpired(sub.expires_at);
            if (expired) {
                await conn.rollback();
                return res.status(409).json({ message: "La subscription ya estÃ¡ vencida." });
            }

            const resolvedAccount = await findAvailableAccountForPlatform(conn, sub.platform_id, {
                accountId: replacementAccountId || null,
                excludeAccountId: sub.platform_account_id,
                additionalPlatformIds: [sub.delivered_platform_id, sub.account_platform_id],
            });

            if (replacementAccountId && !resolvedAccount?.account) {
                await conn.rollback();
                return res.status(409).json({
                    code: "NO_STOCK",
                    message: "La cuenta seleccionada ya no estÃ¡ disponible para reemplazo.",
                });
            }

            if (!resolvedAccount?.account) {
                await conn.rollback();
                return res.status(409).json({
                    code: "NO_STOCK",
                    message: "Sin stock: no podemos completar la acciÃ³n porque no hay cuentas disponibles para reemplazo.",
                });
            }

            const newAcc = resolvedAccount.account;

            // Marcar nueva cuenta como assigned con misma expiraciÃ³n / user
            await conn.query(
                `UPDATE platform_accounts
            SET status='assigned', assigned_to_user_id=?, assigned_at=NOW(), expires_at=?
          WHERE id = ?`,
                [sub.user_id, toSqlDateTime(bogotaDateOnlyToUtcEndOfDay(sub.expires_at)), newAcc.id]
            );

            // Swap en subscription (MISMA orden, MISMA expiraciÃ³n)
            await conn.query(
                `UPDATE subscriptions
            SET platform_account_id = ?,
                delivered_platform_id = ?,
                is_attended = 0
          WHERE id = ?`,
                [newAcc.id, resolvedAccount.deliveredPlatformId, subscriptionId]
            );

            // Marcar cuenta anterior como sold (fuera de inventario)
            await conn.query(
                `UPDATE platform_accounts
            SET status='sold'
          WHERE id = ?`,
                [sub.platform_account_id]
            );

            const [orderRows] = await conn.query(
                `SELECT o.id AS order_id, o.order_code
                   FROM order_items oi
                   JOIN orders o ON o.id = oi.order_id
                  WHERE oi.subscription_id = ?
                  ORDER BY oi.id DESC
                  LIMIT 1`,
                [subscriptionId]
            );

            await conn.query(
                `INSERT INTO account_replacement_logs
                    (subscription_id, order_id, order_code, user_id, admin_user_id, platform_id,
                     old_account_id, old_account_email, new_account_id, new_account_email, previous_expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    subscriptionId,
                    orderRows?.[0]?.order_id || null,
                    orderRows?.[0]?.order_code || null,
                    sub.user_id,
                    req.user.id,
                    sub.platform_id,
                    sub.platform_account_id,
                    sub.old_account_email || null,
                    newAcc.id,
                    newAcc.email || null,
                    sub.expires_at || null,
                ]
            );

            await conn.commit();

            // Devolver info actualizada (incluye mensaje)
            const info = await getSubscriptionSupportInfo(conn, subscriptionId);
            const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
            if (info) {
                info.message = buildAccountDeliveryMessage({
                    intro: "Tu cuenta ha sido reemplazada por:",
                    orderCode: info.orderCode || `#${info.orderId || "-"}`,
                    subscriptionId: info.subscriptionId,
                    platformName: info.platformName,
                    account: info.account,
                    expiresAt: info.expiresAt,
                    token: info.token,
                    baseUrl,
                });
                info.replaced = {
                    oldAccountId: sub.platform_account_id,
                    newAccountId: newAcc.id,
                };
            }

            return res.json({
                ok: true,
                replaced: {
                    subscriptionId,
                    oldAccountId: sub.platform_account_id,
                    newAccountId: newAcc.id,
                },
                info,
            });
        } catch (e) {
            try {
                await conn.rollback();
            } catch {}
            console.error("support replace error:", e);
            return res.status(500).json({ message: "Error interno." });
        } finally {
            conn.release();
        }
    }
);

module.exports = router;
