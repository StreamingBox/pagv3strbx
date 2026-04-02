const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { insertCredentialLinkWithRetry } = require("../utils/tokens");
const { buildWhatsappMessage } = require("../utils/whatsappMessage");
const { formatDateOnlyBogota } = require("../utils/date");

const router = express.Router();

/**
 * Admin Soporte
 * - Buscar un subscription por ID (incluye orden/cÃ³digo y credenciales actuales)
 * - Reemplazar la cuenta por otra "available" del mismo platform_id
 *
 * Nota: NO cambia la orden, ni el plan, ni la fecha de expiraciÃ³n (expires_at).
 * Solo cambia platform_account_id y por ende las credenciales mostradas.
 */

function buildReplacementWhatsappMessage({ orderCode, subscriptionId, platformName, account, expiresAt, token, baseUrl }) {
    const cleanBaseUrl = String(baseUrl || "").replace(/\/+$/, "");
    const credentialUrl = token ? `${cleanBaseUrl}/s/${token}` : "";
    const lines = [
        "Tu cuenta ha sido remplazada por:",
        "",
        `🧾 Orden: ${orderCode || "-"}`,
        "📦 Pedido múltiple (1 items)",
        "",
        `🆔 ID: ${subscriptionId || "-"} | 🖥️ ${platformName || "—"}`,
    ];

    if (account?.email) lines.push(`📧 Correo: ${account.email}`);
    if (account?.password) lines.push(`🔑 Contraseña: ${account.password}`);
    if (account?.profile_number !== null && account?.profile_number !== undefined && String(account.profile_number).trim() !== "") {
        lines.push(`👤 Perfil: ${account.profile_number}`);
    }
    if (account?.pin !== null && account?.pin !== undefined && String(account.pin).trim() !== "") {
        lines.push(`🔢 Pin: ${account.pin}`);
    }
    if (expiresAt) {
        lines.push(`📅 Expira: ${formatDateOnlyBogota(expiresAt)}`);
    }
    if (credentialUrl) {
        lines.push("");
        lines.push(`*🔗⚠️ Debido a que en ocasiones se bloquea o cambia la clave, en este enlace ${credentialUrl} puedes consultar la contraseña hasta tu último día contratado. 💻🔑:*`);
    }

    return lines.join("\n").trim();
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
        o.id AS order_id,
        o.order_code,
        p.name AS platform_name,
        p.slug AS platform_slug,
        u.whatsapp AS user_whatsapp,
        a.email,
        a.password,
        a.pin,
        a.profile_number
     FROM subscriptions s
     LEFT JOIN order_items oi ON oi.subscription_id = s.id
     LEFT JOIN orders o ON o.id = oi.order_id
     JOIN platforms p ON p.id = s.platform_id
     JOIN users u ON u.id = s.user_id
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
            showWhatsapp: 1,
        });
    }

    const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";

    const message = buildWhatsappMessage({
        orderCode: r.order_code || `#${r.order_id || "-"}`,
        baseUrl,
        results: [
            {
                subscriptionId: r.subscription_id,
                plan: { platform_name: r.platform_name, platform_slug: r.platform_slug },
                account: {
                    email: r.email,
                    password: r.password,
                    pin: r.pin,
                    profile_number: r.profile_number,
                },
                expiresAt: new Date(r.expires_at),
                token,
            },
        ],
    });

    return {
        subscriptionId: r.subscription_id,
        orderId: r.order_id,
        orderCode: r.order_code,
        platformId: r.platform_id,
        platformName: r.platform_name,
        status: r.status,
        expiresAt: r.expires_at,
        accountId: r.platform_account_id,
        account: {
            email: r.email,
            password: r.password,
            pin: r.pin,
            profile_number: r.profile_number,
        },
        token,
        whatsappPhone: r.user_whatsapp || null,
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
        if (!Number.isFinite(subscriptionId) || subscriptionId <= 0) {
            return res.status(400).json({ message: "subscriptionId invÃ¡lido." });
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            // Lock subscription
            const [subRows] = await conn.query(
                `SELECT id, user_id, platform_id, status, expires_at, platform_account_id
           FROM subscriptions
          WHERE id = ?
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

            const expired = new Date(sub.expires_at).getTime() < Date.now();
            if (expired) {
                await conn.rollback();
                return res.status(409).json({ message: "La subscription ya estÃ¡ vencida." });
            }

            // Tomar otra cuenta disponible del MISMO platform_id
            const [accRows] = await conn.query(
                `SELECT id, email, password, pin, profile_number
           FROM platform_accounts
          WHERE platform_id = ? AND status = 'available'
          ORDER BY id ASC
          LIMIT 1
          FOR UPDATE`,
                [sub.platform_id]
            );

            if (!accRows.length) {
                await conn.rollback();
                return res.status(409).json({
                    code: "NO_STOCK",
                    message: "Sin stock: no podemos completar la acciÃ³n porque no hay cuentas disponibles para reemplazo.",
                });
            }

            const newAcc = accRows[0];

            // Marcar nueva cuenta como assigned con misma expiraciÃ³n / user
            await conn.query(
                `UPDATE platform_accounts
            SET status='assigned', assigned_to_user_id=?, assigned_at=NOW(), expires_at=?
          WHERE id = ?`,
                [sub.user_id, sub.expires_at, newAcc.id]
            );

            // Swap en subscription (MISMA orden, MISMA expiraciÃ³n)
            await conn.query(
                `UPDATE subscriptions
            SET platform_account_id = ?
          WHERE id = ?`,
                [newAcc.id, subscriptionId]
            );

            // Marcar cuenta anterior como sold (fuera de inventario)
            await conn.query(
                `UPDATE platform_accounts
            SET status='sold'
          WHERE id = ?`,
                [sub.platform_account_id]
            );

            await conn.commit();

            // Devolver info actualizada (incluye mensaje)
            const info = await getSubscriptionSupportInfo(conn, subscriptionId);
            const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
            if (info) {
                info.message = buildReplacementWhatsappMessage({
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
