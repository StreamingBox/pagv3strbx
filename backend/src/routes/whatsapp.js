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
const { sendWaText, normalizePhone } = require("../services/wasenderClient");
const {
    cleanupExpiredWebhookDedupe,
    reserveWebhookEvent,
} = require("../services/whatsappWebhookDedupe");
const { getSubscriptionWithAccount } = require("../services/codeQueries");
const { toCodeSlug } = require("../utils/platformSlugMap");

const router = express.Router();
const flowSessions = new Map(); // phone -> { step, orderNumber, platforms, updatedAt }
const FLOW_TTL_MS = 15 * 60 * 1000;

async function ensureSettingsTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
            setting_key   VARCHAR(128) PRIMARY KEY,
            setting_value TEXT         NOT NULL,
            updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
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

function readIncomingMessageMeta(body) {
    const incoming = readIncomingMessage(body);
    const messageNode = Array.isArray(body?.data?.messages)
        ? body.data.messages[0]
        : body?.data?.messages;
    const key = messageNode?.key || {};
    const msgId = key?.id ? String(key.id) : null;
    const remoteJid = String(key?.remoteJid || "");
    const eventName = String(body?.event || body?.type || "").trim().toLowerCase();

    return {
        eventName,
        msgId,
        remoteJid,
        from: incoming?.from || "",
        text: String(incoming?.text || "").trim(),
    };
}

function makeIncomingFingerprint(body) {
    const meta = readIncomingMessageMeta(body);
    if (!meta.from) return null;
    if (meta.msgId) return null;

    const normalizedText = meta.text.toLowerCase().replace(/\s+/g, " ").trim();
    return `fallback:${meta.from}:${normalizedText}`;
}

async function readWaToken() {
    await ensureSettingsTable();
    const [[row]] = await pool.query(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'wasender_token'"
    );
    return String(row?.setting_value || "").trim();
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

    if (/^(solicitud\s+codigo|codigo|1)$/i.test(t)) {
        return { type: "start_flow" };
    }

    const m = t.match(/^solicitud\s+codigo\s+(\d+)\s+([a-z0-9._-]+)$/i);
    if (!m) return { type: "unknown" };

    return {
        type: "code",
        orderNumber: Number(m[1]),
        platformSlug: String(m[2] || "").toLowerCase(),
    };
}


function getActiveSession(phone) {
    const session = flowSessions.get(phone);
    if (!session) return null;
    if (Date.now() - Number(session.updatedAt || 0) > FLOW_TTL_MS) {
        flowSessions.delete(phone);
        return null;
    }
    return session;
}

function setSession(phone, patch) {
    const current = getActiveSession(phone) || {};
    flowSessions.set(phone, {
        ...current,
        ...patch,
        updatedAt: Date.now(),
    });
}

function helpText() {
    return [
        "✨ *Menu Streaming Box*",
        "🧩 Unica opcion disponible:",
        "👉 Marca *1* para SOLICITUD CODIGO",
        "",
        "Escribe el numero 1 para iniciar.",
    ].join("\n");
}

function renderCodeReply(result) {
    if (!result) return "No se pudo procesar tu solicitud.";
    if (result.http !== 200 || !result.body?.ok) {
        return result.body?.message || "No se encontró código para esa solicitud.";
    }

    if (result.body?.type === "approval") {
        return [
            "✅ *Aprobación encontrada*",
            `📦 *Pedido:* ${result.body.orderNumber}`,
            `📺 *Plataforma:* ${result.body.platform}`,
            `📱 *Dispositivo:* ${result.body.deviceName || "N/A"}`,
        ].join("\n");
    }

    return [
        "✅ *Código encontrado*",
        `📦 *Pedido:* ${result.body.orderNumber}`,
        `📺 *Plataforma:* ${result.body.platform}`,
        `🔑 *Código:* ${result.body.code || "N/A"}`,
    ].join("\n");
}

async function resolveRequestUser(phone) {
    const allowAnyWhatsapp = String(process.env.WHATSAPP_ALLOW_ANY_NUMBER_FOR_CODES || "false").toLowerCase() === "true";
    if (allowAnyWhatsapp) return { ok: true, user: { id: 0, role: "admin" } };

    const user = await findUserByWhatsapp(phone);
    if (!user || String(user.status || "").toLowerCase() !== "active") {
        return { ok: false, message: "Tu WhatsApp no está vinculado a una cuenta activa. Escribe a soporte para activarlo." };
    }
    return { ok: true, user: { id: user.id, role: user.role } };
}

async function executeCodeRequest({ token, to, orderNumber, platformSlug }) {
    try {
        const userResolution = await resolveRequestUser(to);
        if (!userResolution.ok) {
            const sent = await sendWaText({
                token,
                to,
                text: userResolution.message,
            });
            return { handled: true, sent: sent.ok, reason: "user_not_active" };
        }

        const result = await requestCodeForOrder({
            orderNumber,
            platformSlug,
            user: userResolution.user,
            action: "code",
        });

        const reply = renderCodeReply(result);
        const sent = await sendWaText({ token, to, text: reply });
        return { handled: true, sent: sent.ok, reason: "code_query" };
    } catch (error) {
        console.error("[whatsapp.code] execute_failed", {
            to: normalizePhone(to),
            orderNumber,
            platformSlug,
            message: error?.message || String(error),
        });
        const sent = await sendWaText({
            token,
            to,
            text: "Ocurrió un error consultando el codigo. Intenta nuevamente en unos segundos.",
        });
        return { handled: true, sent: sent.ok, reason: "execute_failed" };
    }
}

async function processOrderLookupInBackground({ token, to, orderNumber }) {
    try {
        const sub = await getSubscriptionWithAccount(orderNumber);

        if (!sub) {
            await sendWaText({
                token,
                to,
                text: "No se encontró ningún pedido con ese número. Verifica y vuelve a escribir SOLICITUD CODIGO.",
                context: "whatsapp_order_not_found",
            });
            return { handled: true, sent: true, reason: "order_not_found" };
        }

        const platformNameOrSlug = sub.platformSlug || sub.platform_slug || sub.platformName || sub.platform_name || sub.name || "";
        const platformSlug = toCodeSlug(platformNameOrSlug);

        if (!platformSlug) {
            await sendWaText({
                token,
                to,
                text: "Error al identificar la plataforma de tu pedido. Contacta a soporte.",
                context: "whatsapp_platform_not_identified",
            });
            return { handled: true, sent: true, reason: "platform_not_identified" };
        }

        return executeCodeRequest({ token, to, orderNumber, platformSlug });
    } catch (error) {
        console.error("[whatsapp.code] background_order_lookup_failed", {
            to: normalizePhone(to),
            orderNumber,
            message: error?.message || String(error),
        });

        await sendWaText({
            token,
            to,
            text: "Ocurrió un error consultando tu pedido. Intenta nuevamente en unos segundos.",
            context: "whatsapp_order_lookup_failed",
        });
        return { handled: true, sent: false, reason: "background_order_lookup_failed" };
    }
}

async function tryHandleIncomingCodeRequest(body) {
    const incoming = readIncomingMessage(body);
    if (!incoming) return { handled: false };

    const token = await readWaToken();
    if (!token) return { handled: true, sent: false, reason: "missing_token" };

    const activeSession = getActiveSession(incoming.from);

    if (activeSession?.step === "await_order") {
        const raw = String(incoming.text || "").trim();
        if (!/^\d+$/.test(raw)) {
            const sent = await sendWaText({
                token,
                to: incoming.from,
                text: "Pedido invalido. Responde solo el numero del pedido. Ejemplo: 1234",
            });
            return { handled: true, sent: sent.ok, reason: "invalid_order" };
        }

        const orderNumber = Number(raw);
        flowSessions.delete(incoming.from);

        const ackPromise = sendWaText({
            token,
            to: incoming.from,
            text: "Perfecto. Estoy buscando tu código. Espera un momento...",
            context: "whatsapp_lookup_ack",
        });

        processOrderLookupInBackground({
            token,
            to: incoming.from,
            orderNumber,
        }).catch((error) => {
            console.error("[whatsapp.code] background_lookup_unhandled", {
                to: normalizePhone(incoming.from),
                orderNumber,
                message: error?.message || String(error),
            });
        });

        const sent = await ackPromise;
        return { handled: true, sent: sent.ok, reason: "order_lookup_started" };
    }

    // El bloque de await_platform ya no es estrictamente necesario, pero se puede dejar por precaucion / retrocompatibilidad
    if (activeSession?.step === "await_platform") {
        flowSessions.delete(incoming.from);
        const sent = await sendWaText({ token, to: incoming.from, text: "Flujo expirado o cambiado. Escribe: SOLICITUD CODIGO" });
        return { handled: true, sent: sent.ok, reason: "flow_deprecated" };
    }

    const cmd = parseCodeCommand(incoming.text);
    if (cmd.type === "empty") {
        const sent = await sendWaText({ token, to: incoming.from, text: helpText() });
        return { handled: true, sent: sent.ok, reason: "empty" };
    }

    if (cmd.type === "start_flow") {
        setSession(incoming.from, { step: "await_order" });
        const sent = await sendWaText({
            token,
            to: incoming.from,
            text: "Perfecto. Escribe el numero de pedido. Ejemplo: 1234",
        });
        return { handled: true, sent: sent.ok, reason: "await_order" };
    }

    if (cmd.type === "help" || cmd.type === "unknown") {
        const sent = await sendWaText({ token, to: incoming.from, text: helpText() });
        return { handled: true, sent: sent.ok, reason: cmd.type };
    }

    return executeCodeRequest({
        token,
        to: incoming.from,
        orderNumber: cmd.orderNumber,
        platformSlug: cmd.platformSlug,
    });
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
        cleanupExpiredWebhookDedupe().catch(() => { });
        const configuredSecret = String(process.env.WASENDER_WEBHOOK_SECRET || "").trim();
        const receivedSignature = String(req.get("X-Webhook-Signature") || "").trim();
        const skipSignature = String(process.env.WASENDER_SKIP_SIGNATURE || "false").toLowerCase() === "true";

        if (!skipSignature && configuredSecret && receivedSignature !== configuredSecret) {
            console.warn("[whatsapp.webhook] signature_invalid");
            return res.status(401).json({ ok: false, message: "Webhook signature inválida." });
        }

        const body = req.body || {};
        const update = readWebhookUpdate(body);
        const incomingMeta = readIncomingMessageMeta(body);
        const eventName = String(body?.event || body?.type || null);
        const msgIdToTrack = update.msgId || incomingMeta.msgId || body?.data?.key?.id;
        const fallbackFingerprint = makeIncomingFingerprint(body);
        const dedupe = await reserveWebhookEvent({
            msgId: msgIdToTrack,
            fallbackFingerprint,
            eventName,
            phone: incomingMeta.from,
            text: incomingMeta.text,
        });
        const isDuplicate = dedupe.isDuplicate;
        const duplicateReason = isDuplicate ? dedupe.reason : null;

        // Si no es un duplicado, procesarlo en BACKGROUND sin bloquear
        if (!isDuplicate) {
            tryHandleIncomingCodeRequest(body).catch((e) => {
                console.error("[whatsapp.webhook] Error en background handle:", e);
            });
        }

        // Log the event, without waiting for incomingResult
        console.log("[whatsapp.webhook] event_received", {
            event: eventName,
            hasMsgId: !!msgIdToTrack,
            isDuplicate,
            duplicateReason,
            dedupeKey: dedupe.eventKey,
        });

        if (!update.msgId) {
            return res.json({
                ok: true,
                updated: 0,
                ignored: true,
                reason: "missing_msg_id",
            });
        }

        const result = await updateTraceByMsgId(update.msgId, update);
        return res.json({
            ok: true,
            updated: result.affectedRows || 0,
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
