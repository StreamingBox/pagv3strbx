const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { requestCodeForOrder } = require("../services/codesService");
const {
    createTrace,
    updateTraceResult,
    updateTraceByMsgId,
    mapWaStatus,
} = require("../services/whatsappQueue");

const router = express.Router();

async function ensureSettingsTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
            setting_key   VARCHAR(128) PRIMARY KEY,
            setting_value TEXT         NOT NULL,
            updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
}

function normalizePhone(input) {
    const clean = String(input || "").replace(/\s+/g, "");
    if (!clean) return "";
    return clean.startsWith("+") ? clean : `+${clean}`;
}
function normalizeDigits(input) {
    return String(input || "").replace(/\D/g, "");
}

function readSendResult(data) {
    const payload = data?.data && typeof data.data === "object" ? data.data : data;
    const msgId = payload?.msgId || payload?.id || null;
    const statusCode = Number(payload?.status);
    return {
        msgId: msgId ? String(msgId) : null,
        statusCode: Number.isFinite(statusCode) ? statusCode : null,
    };
}

function readWebhookUpdate(body) {
    const eventName = String(body?.event || body?.type || "");
    const data = body?.data || {};
    const update = data?.update || {};
    const key = update?.key || data?.key || {};
    const msgId = key?.id || data?.msgId || data?.id || null;
    const statusCode = Number(update?.status ?? data?.status);
    const errorMessage = update?.error || data?.error || data?.message || null;

    return {
        eventName,
        msgId: msgId ? String(msgId) : null,
        statusCode: Number.isFinite(statusCode) ? statusCode : null,
        errorMessage,
        providerData: body,
    };
}

function readIncomingMessage(body) {
    const eventName = String(body?.event || body?.type || "").trim().toLowerCase();
    const allowedEvents = new Set(["messages.received", "messages-personal.received"]);
    if (!allowedEvents.has(eventName)) return null;

    const rawMessages = body?.data?.messages;
    const message = Array.isArray(rawMessages) ? rawMessages[0] : rawMessages;
    if (!message || typeof message !== "object") return null;

    const key = message?.key || {};
    const allowFromMe = String(process.env.WHATSAPP_ALLOW_FROM_ME_TEST || "false").toLowerCase() === "true";
    if (!allowFromMe && key?.fromMe === true) return null;

    const remoteJid = String(key?.remoteJid || "");
    if (remoteJid.endsWith("@g.us")) return null; // ignorar grupos

    const from =
        key?.cleanedSenderPn ||
        key?.senderPn ||
        (remoteJid.includes("@") ? remoteJid.split("@")[0] : remoteJid);

    const text = String(
        message?.messageBody ||
        message?.message?.conversation ||
        message?.message?.extendedTextMessage?.text ||
        message?.message?.imageMessage?.caption ||
        message?.message?.videoMessage?.caption ||
        message?.message?.buttonsResponseMessage?.selectedDisplayText ||
        message?.message?.listResponseMessage?.title ||
        ""
    ).trim();

    if (!from) return null;
    return { from: normalizePhone(from), text };
}

async function readWaToken() {
    await ensureSettingsTable();
    const [[row]] = await pool.query(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'wasender_token'"
    );
    return String(row?.setting_value || "").trim();
}

async function sendWaText({ token, to, text }) {
    const response = await fetch("https://www.wasenderapi.com/api/send-message", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ to: normalizePhone(to), text }),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok && data?.success !== false, status: response.status, data };
}

async function findUserByWhatsapp(phone) {
    const digits = normalizeDigits(phone);
    if (!digits) return null;

    const [rows] = await pool.query(
        "SELECT id, role, status, whatsapp FROM users WHERE whatsapp IS NOT NULL AND whatsapp <> ''"
    );

    const match = rows.find((r) => {
        const wd = normalizeDigits(r.whatsapp);
        if (!wd) return false;
        return wd === digits || wd.endsWith(digits) || digits.endsWith(wd);
    });

    return match || null;
}

function parseCodeCommand(text) {
    const t = String(text || "").trim();
    if (!t) return { type: "empty" };

    if (/^(ayuda|help|menu)$/i.test(t)) {
        return { type: "help" };
    }

    // Formato OBLIGATORIO:
    // SOLICITUD CODIGO <pedido> <plataforma>
    // Ej: SOLICITUD CODIGO 1234 netflix
    const m = t.match(/^solicitud\s+c[oó]digo\s+(\d+)\s+([a-z0-9._-]+)$/i);
    if (!m) return { type: "unknown" };

    return {
        type: "code",
        orderNumber: Number(m[1]),
        platformSlug: String(m[2] || "").toLowerCase(),
    };
}

function helpText() {
    return [
        "Estas son mis únicas opciones:",
        "",
        "1) SOLICITUD CODIGO <pedido> <plataforma>",
        "Ejemplo: SOLICITUD CODIGO 1234 netflix",
        "",
        "Nota: ese formato es obligatorio para procesar tu solicitud.",
    ].join("\n");
}

function renderCodeReply(result) {
    if (!result) return "No se pudo procesar tu solicitud.";
    if (result.http !== 200 || !result.body?.ok) {
        return result.body?.message || "No se encontró código para esa solicitud.";
    }

    if (result.body?.type === "approval") {
        return [
            "Aprobación encontrada.",
            `Pedido: ${result.body.orderNumber}`,
            `Plataforma: ${result.body.platform}`,
            `Dispositivo: ${result.body.deviceName || "N/A"}`,
        ].join("\n");
    }

    return [
        "Código encontrado.",
        `Pedido: ${result.body.orderNumber}`,
        `Plataforma: ${result.body.platform}`,
        `Email: ${result.body.email || "N/A"}`,
        `Código: ${result.body.code || "N/A"}`,
    ].join("\n");
}

async function tryHandleIncomingCodeRequest(body) {
    const incoming = readIncomingMessage(body);
    if (!incoming) return { handled: false };

    const token = await readWaToken();
    if (!token) return { handled: true, sent: false, reason: "missing_token" };

    const cmd = parseCodeCommand(incoming.text);
    if (cmd.type === "empty") {
        const sent = await sendWaText({ token, to: incoming.from, text: helpText() });
        return { handled: true, sent: sent.ok, reason: "empty" };
    }

    if (cmd.type === "help" || cmd.type === "unknown") {
        const sent = await sendWaText({ token, to: incoming.from, text: helpText() });
        return { handled: true, sent: sent.ok, reason: cmd.type };
    }

    const allowAnyWhatsapp = String(process.env.WHATSAPP_ALLOW_ANY_NUMBER_FOR_CODES || "false").toLowerCase() === "true";

    let user = null;
    if (!allowAnyWhatsapp) {
        user = await findUserByWhatsapp(incoming.from);
        if (!user || String(user.status || "").toLowerCase() !== "active") {
            const sent = await sendWaText({
                token,
                to: incoming.from,
                text: "Tu WhatsApp no está vinculado a una cuenta activa. Escribe a soporte para activarlo.",
            });
            return { handled: true, sent: sent.ok, reason: "user_not_active" };
        }
    }

    const result = await requestCodeForOrder({
        orderNumber: cmd.orderNumber,
        platformSlug: cmd.platformSlug,
        user: allowAnyWhatsapp
            ? { id: 0, role: "admin" }
            : { id: user.id, role: user.role },
        action: "code",
    });

    const reply = renderCodeReply(result);
    const sent = await sendWaText({ token, to: incoming.from, text: reply });
    return { handled: true, sent: sent.ok, reason: "code_query" };
}

// GET /admin/whatsapp/token
router.get("/admin/whatsapp/token", requireAuth, requireRole("admin"), async (_req, res) => {
    try {
        await ensureSettingsTable();
        const [[row]] = await pool.query(
            "SELECT setting_value FROM app_settings WHERE setting_key = 'wasender_token'"
        );
        const token = row?.setting_value || "";
        const preview = token.length > 6
            ? "*".repeat(token.length - 6) + token.slice(-6)
            : token;
        return res.json({ ok: true, preview, hasToken: !!token });
    } catch (e) {
        return res.status(500).json({
            ok: false,
            message: "Error al leer token: " + (e?.message || "desconocido"),
        });
    }
});

// PUT /admin/whatsapp/token
router.put("/admin/whatsapp/token", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        await ensureSettingsTable();
        const { token } = req.body || {};
        if (!token || typeof token !== "string" || token.trim().length < 10) {
            return res.status(400).json({
                ok: false,
                message: "Token inválido (mínimo 10 caracteres).",
            });
        }
        await pool.query(
            `INSERT INTO app_settings (setting_key, setting_value)
             VALUES ('wasender_token', ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
            [token.trim()]
        );
        return res.json({ ok: true, message: "Token guardado correctamente." });
    } catch (e) {
        return res.status(500).json({
            ok: false,
            message: "Error al guardar token: " + (e?.message || "desconocido"),
        });
    }
});

// POST /whatsapp/send
router.post("/whatsapp/send", requireAuth, async (req, res) => {
    let traceId = null;
    try {
        await ensureSettingsTable();
        const { to, text } = req.body || {};
        if (!to || !text) {
            return res.status(400).json({
                ok: false,
                message: "Faltan campos: 'to' y 'text' son requeridos.",
            });
        }

        const phone = normalizePhone(to);
        traceId = await createTrace({
            phone,
            message: text,
            status: "pending",
            source: "direct_api",
            createdByUserId: req.user?.id || null,
            createdByRole: req.user?.role || null,
        });

        const token = await readWaToken();
        if (!token) {
            await updateTraceResult({
                traceId,
                ok: false,
                errorMessage: "Token no configurado",
                providerData: { error: "missing_token" },
            });
            return res.status(503).json({
                ok: false,
                message: "WhatsApp no configurado. Contacta al administrador.",
            });
        }

        const wa = await sendWaText({ token, to: phone, text });
        const data = wa.data;
        const ok = wa.ok;

        if (!ok) {
            const msg = data?.message || data?.error || `Error WaSender (${wa.status})`;
            await updateTraceResult({
                traceId,
                ok: false,
                errorMessage: msg,
                providerData: data,
            });
            return res.status(502).json({ ok: false, message: msg, traceId });
        }

        await updateTraceResult({
            traceId,
            ok: true,
            providerData: data,
        });

        const sendResult = readSendResult(data);
        return res.json({
            ok: true,
            message: "Mensaje enviado por WhatsApp correctamente.",
            traceId,
            msgId: sendResult.msgId,
            waStatusCode: sendResult.statusCode,
            waStatusLabel: mapWaStatus(sendResult.statusCode),
        });
    } catch (e) {
        console.error("[whatsapp.send] Error:", e);
        if (traceId) {
            try {
                await updateTraceResult({
                    traceId,
                    ok: false,
                    errorMessage: e?.message || "Error interno",
                    providerData: { error: e?.message || "internal_error" },
                });
            } catch {
                // ignore secondary errors in trace update
            }
        }
        return res.status(500).json({
            ok: false,
            message: "Error interno al enviar mensaje: " + (e?.message || "desconocido"),
            traceId,
        });
    }
});

// POST /whatsapp/webhook
router.post("/whatsapp/webhook", async (req, res) => {
    try {
        const configuredSecret = String(process.env.WASENDER_WEBHOOK_SECRET || "").trim();
        const receivedSignature = String(req.get("X-Webhook-Signature") || "").trim();
        const skipSignature = String(process.env.WASENDER_SKIP_SIGNATURE || "false").toLowerCase() === "true";

        if (!skipSignature && configuredSecret && receivedSignature !== configuredSecret) {
            console.warn("[whatsapp.webhook] signature_invalid", {
                hasConfiguredSecret: !!configuredSecret,
                hasReceivedSignature: !!receivedSignature,
            });
            return res.status(401).json({ ok: false, message: "Webhook signature inválida." });
        }

        const incomingResult = await tryHandleIncomingCodeRequest(req.body || {});
        const update = readWebhookUpdate(req.body || {});
        console.log("[whatsapp.webhook] event_received", {
            event: req.body?.event || req.body?.type || null,
            hasMsgId: !!update.msgId,
            incomingHandled: !!incomingResult?.handled,
            incomingReason: incomingResult?.reason || null,
        });

        if (!update.msgId) {
            return res.json({
                ok: true,
                updated: 0,
                ignored: true,
                reason: "missing_msg_id",
                incomingHandled: !!incomingResult?.handled,
            });
        }

        const result = await updateTraceByMsgId(update.msgId, update);
        return res.json({
            ok: true,
            updated: result.affectedRows || 0,
            incomingHandled: !!incomingResult?.handled,
        });
    } catch (e) {
        console.error("[whatsapp.webhook] Error:", e);
        return res.status(500).json({ ok: false, message: "Error procesando webhook." });
    }
});

// GET /admin/whatsapp/queue
router.get("/admin/whatsapp/queue", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
        const offset = (page - 1) * limit;

        const phoneFilter = req.query.phone ? String(req.query.phone).trim() : "";
        const statusFilter = req.query.status ? String(req.query.status).trim().toLowerCase() : "all";

        const internalStatuses = new Set(["pending", "sent", "failed"]);
        const waStatuses = new Set(["error", "pending", "sent", "delivered", "read", "played", "unknown"]);

        const conditions = [];
        const params = [];

        if (phoneFilter) {
            conditions.push("q.phone LIKE ?");
            params.push(`%${phoneFilter}%`);
        }

        if (statusFilter !== "all") {
            if (internalStatuses.has(statusFilter)) {
                conditions.push("q.status = ?");
                params.push(statusFilter);
            } else if (waStatuses.has(statusFilter)) {
                conditions.push("q.wa_status_label = ?");
                params.push(statusFilter);
            }
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const [[{ count }]] = await pool.query(
            `SELECT COUNT(*) AS count
             FROM whatsapp_queue q
             LEFT JOIN users u ON u.id = q.created_by_user_id
             ${whereClause}`,
            params
        );

        const [rows] = await pool.query(
            `SELECT
                q.*,
                u.name AS sender_name,
                u.email AS sender_email,
                u.role AS sender_role
             FROM whatsapp_queue q
             LEFT JOIN users u ON u.id = q.created_by_user_id
             ${whereClause}
             ORDER BY q.created_at DESC, q.id DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return res.json({
            items: rows,
            total: Number(count || 0),
            page,
            pages: Math.ceil(Number(count || 0) / limit) || 1,
            limit,
        });
    } catch (e) {
        console.error("Error fetching whatsapp queue:", e);
        return res.status(500).json({ message: "Error interno al obtener traza de WhatsApp." });
    }
});

module.exports = router;

