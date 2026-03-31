const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const pool = require("../db");

const { checkoutService } = require("../services/checkoutService");
const { getOrdersHistory } = require("../services/orderHistoryService");
const { addToQueue } = require("../services/whatsappQueue");

const router = express.Router();

// ✅ Checkout (carrito)
router.post("/checkout", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const includeWhatsapp = !!req.body?.includeWhatsapp;
        const whatsappPhone = req.body?.whatsappPhone;
        const items = Array.isArray(req.body?.items) ? req.body.items : [];

        const recordProfit = !!req.body?.recordProfit;
        const profitAmount = Number(req.body?.profitAmount || 0);

        const data = await checkoutService({
            userId,
            includeWhatsapp,
            whatsappPhone,
            items,
            recordProfit,
            profitAmount,
        });

        return res.status(201).json(data);
    } catch (err) {
        const status = err?.status || 500;
        const payload = err?.payload || null;

        console.error(err);
        return res.status(status).json({
            message: err?.message || "Error interno en checkout.",
            ...(payload || {}),
        });
    }
});

// ✅ Historial de órdenes
router.get("/orders", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { from, to, platformId, q, page, limit } = req.query;

        const data = await getOrdersHistory({
            userId,
            from,
            to,
            platformId,
            q,
            page,
            limit,
        });

        return res.json(data);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error cargando historial." });
    }
});

// Lista plataformas
router.get("/platforms", requireAuth, async (req, res) => {
    const [rows] = await pool.query(
        "SELECT id, name, slug FROM platforms WHERE is_active = 1 ORDER BY name ASC"
    );
    res.json(rows);
});

// ✅ Vencimientos (User) - Solo las cuentas del usuario (<= 3 días o vencidas)
router.get("/orders/expiring", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.max(1, Number(req.query.limit) || 20);
        const offset = (page - 1) * limit;

        const { q, platform } = req.query;

        let whereCols = [
            "s.user_id = ?",
            "s.status != 'cancelled'",
            "s.expires_at <= DATE_ADD(NOW(), INTERVAL 3 DAY)",
            "IFNULL(s.is_attended, 0) = 0"
        ];
        let params = [userId];

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

        const whereSql = "WHERE " + whereCols.join(" AND ");

        const [countRows] = await pool.query(
            `SELECT COUNT(*) as total
             FROM subscriptions s
             JOIN platforms p ON p.id = s.platform_id
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
               p.name AS platform_name,
               p.slug AS platform_slug,
               acc.email AS account_email,
               acc.profile_number,
               s.whatsapp_phone,
               s.reminder_sent
             FROM subscriptions s
             JOIN platforms p ON p.id = s.platform_id
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
        console.error("Error en GET /orders/expiring:", err);
        return res.status(500).json({ message: "Error cargando vencimientos." });
    }
});

// ✅ Count pending expirations (User)
router.get("/orders/expiring-count", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.query(
            `SELECT COUNT(*) as count
             FROM subscriptions
             WHERE user_id = ?
               AND status != 'cancelled'
               AND IFNULL(is_attended, 0) = 0
               AND expires_at <= DATE_ADD(NOW(), INTERVAL 3 DAY)`,
            [userId]
        );
        return res.json({ count: rows[0].count });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error contando vencimientos." });
    }
});

// ✅ Renovar recordatorio por WhatsApp (User & Admin)
router.post("/orders/:id/remind-whatsapp", requireAuth, async (req, res) => {
    try {
        const orderId = Number(req.params.id);
        const { whatsappPhone } = req.body; // Se puede recibir un nuevo teléfono

        const [rows] = await pool.query(`
            SELECT 
                s.user_id, s.whatsapp_phone, s.expires_at, s.reminder_sent,
                p.name AS platform_name,
                acc.email AS account_email, acc.profile_number,
                u.whatsapp AS vendor_phone 
            FROM subscriptions s
            JOIN platforms p ON p.id = s.platform_id
            JOIN users u ON u.id = s.user_id
            LEFT JOIN platform_accounts acc ON acc.id = s.platform_account_id
            WHERE s.id = ?
        `, [orderId]);

        if (!rows.length) return res.status(404).json({ message: "Suscripción no encontrada." });
        const sub = rows[0];

        // Verificar acceso (debe ser dueño o admin)
        if (sub.user_id !== req.user.id && req.user.role !== "admin") {
            return res.status(403).json({ message: "No autorizado para esta cuenta." });
        }

        if (sub.reminder_sent) {
            return res.status(400).json({ message: "El recordatorio ya fue enviado previamente para esta cuenta. No se pueden enviar más mensajes." });
        }

        const phoneToUse = whatsappPhone ? String(whatsappPhone).trim() : sub.whatsapp_phone;
        if (!phoneToUse) {
            return res.status(400).json({ message: "Se requiere un número de WhatsApp para enviar el recordatorio." });
        }

        // Obtener WaSender token
        const [[tokenRow]] = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key = 'wasender_token'");
        if (!tokenRow || !tokenRow.setting_value) return res.status(503).json({ message: "WhatsApp no configurado en ajustes." });

        const phoneStr = phoneToUse.replace(/\\s|-/g, "");
        const finalPhone = phoneStr.startsWith("+") ? phoneStr : "+" + phoneStr;

        const today = new Date();
        const expiryDate = new Date(sub.expires_at);
        today.setHours(0,0,0,0);
        expiryDate.setHours(0,0,0,0);
        
        let dateMsg = "el día de hoy";
        if (expiryDate.getTime() < today.getTime()) {
            dateMsg = "el día " + expiryDate.toLocaleDateString("es-CO");
        } else if (expiryDate.getTime() > today.getTime()) {
             dateMsg = "el próximo " + expiryDate.toLocaleDateString("es-CO");
        }

        const vendorContact = sub.vendor_phone ? `\n📱 *Para renovar, contáctate al número:* ${sub.vendor_phone}` : `\n📱 *Si deseas renovar, por favor comunícate por el mismo medio donde enviaste el comprobante de pago.*`;

        const text = `🔔 *Recordatorio de Vencimiento*\n\nHola, te recordamos que tu perfil de *uid* de *${sub.platform_name}* vence *${dateMsg}*.\n\n*Cuenta:* ${sub.account_email || "Sin email"}\n*Perfil:* ${sub.profile_number || "—"}\n\nPor favor notifícanos si deseas renovar para no perder el acceso.${vendorContact}\n\n---\n⚠️ _Este es un mensaje automático. Por favor no responder a este bot_`.replace("*uid* ", "");

        // Enviar a la cola para rate limiting (1 msj / minuto)
        await addToQueue(finalPhone, text, {
            source: "reminder",
            createdByUserId: req.user?.id || null,
            createdByRole: req.user?.role || null,
        });

        // Actualizar el teléfono (si cambió o es nuevo) y marcar validado
        await pool.query("UPDATE subscriptions SET whatsapp_phone = ?, reminder_sent = 1 WHERE id = ?", [phoneToUse, orderId]);

        return res.json({ ok: true, message: "Recordatorio encolado para WhatsApp." });

    } catch (e) {
        console.error("Error en POST /orders/:id/remind-whatsapp:", e);
        return res.status(500).json({ message: "Error interno al enviar recordatorio: " + e.message });
    }
});

module.exports = router;
