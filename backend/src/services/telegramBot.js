/**
 * telegramBot.js
 * Bot de Telegram para StreamingBox Admin
 *
 * Variables de entorno requeridas:
 *   TELEGRAM_BOT_TOKEN  — Token del bot (BotFather)
 *   TELEGRAM_CHAT_IDS   — Chat IDs autorizados separados por coma (ej: "123456789,987654321")
 *
 * Comandos disponibles:
 *   /start        → Bienvenida
 *   /stock        → Cuentas disponibles por plataforma
 *   /ventas [n]   → Últimas n ventas (default 10)
 *   /saldo [@user] → Saldo de tus propios fondos o de un usuario
 *   /comprar <platform_slug> <duracion_días> @usuario → Registrar compra a un usuario
 */

const axios = require("axios");
const { EventEmitter } = require("events");
const pool = require("../db");
const { createAccountOne } = require("./accounts.service");
const {
    buildTopupProofUrl,
    buildTopupProofFileUrl,
    getManualTopupById,
    updateManualTopupStatus,
} = require("./manualTopups.service");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_ENABLED = String(process.env.TELEGRAM_BOT_ENABLED || "true").toLowerCase() !== "false";
const BOT_POLLING_ENABLED = String(process.env.TELEGRAM_BOT_POLLING || "true").toLowerCase() !== "false";
const RAW_IDS = process.env.TELEGRAM_CHAT_IDS || "";
// Conjunto de chat IDs autorizados (números)
const AUTHORIZED = new Set(
    RAW_IDS.split(",").map(s => s.trim()).filter(Boolean).map(Number)
);

const buySessions = new Map();
const stockSessions = new Map();
let bot = null;
let botDisabledByConflict = false;

class TelegramBotClient extends EventEmitter {
    constructor(token, { polling = false } = {}) {
        super();
        this.token = token;
        this.baseUrl = `https://api.telegram.org/bot${token}`;
        this.textHandlers = [];
        this.polling = false;
        this.stopped = false;
        this.offset = 0;
        this.http = axios.create({ baseURL: this.baseUrl, timeout: 35000 });
        if (polling) {
            this.startPolling();
        }
    }

    async request(method, payload = {}) {
        try {
            const { data } = await this.http.post(`/${method}`, payload);
            if (!data?.ok) {
                throw new Error(data?.description || `Telegram ${method} failed`);
            }
            return data.result;
        } catch (err) {
            const description = err?.response?.data?.description;
            if (description) {
                const wrapped = new Error(description);
                wrapped.status = err.response.status;
                throw wrapped;
            }
            throw err;
        }
    }

    setMyCommands(commands) {
        return this.request("setMyCommands", { commands });
    }

    sendMessage(chatId, text, options = {}) {
        return this.request("sendMessage", { chat_id: chatId, text, ...options });
    }

    sendDocument(chatId, document, options = {}) {
        return this.request("sendDocument", { chat_id: chatId, document, ...options });
    }

    sendPhoto(chatId, photo, options = {}) {
        return this.request("sendPhoto", { chat_id: chatId, photo, ...options });
    }

    editMessageText(text, options = {}) {
        return this.request("editMessageText", { text, ...options });
    }

    answerCallbackQuery(callbackQueryId, options = {}) {
        return this.request("answerCallbackQuery", { callback_query_id: callbackQueryId, ...options });
    }

    onText(regex, handler) {
        this.textHandlers.push({ regex, handler });
    }

    async stopPolling() {
        this.stopped = true;
        this.polling = false;
    }

    startPolling() {
        if (this.polling) return;
        this.polling = true;
        this.stopped = false;
        void this.pollLoop();
    }

    async pollLoop() {
        while (!this.stopped) {
            try {
                const updates = await this.request("getUpdates", {
                    offset: this.offset,
                    timeout: 30,
                    allowed_updates: ["message", "callback_query"],
                });
                for (const update of updates || []) {
                    this.offset = Math.max(this.offset, Number(update.update_id || 0) + 1);
                    await this.dispatchUpdate(update);
                }
            } catch (err) {
                this.emit("polling_error", err);
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        }
    }

    async dispatchUpdate(update) {
        if (update.message) {
            const msg = update.message;
            if (typeof msg.text === "string") {
                for (const item of this.textHandlers) {
                    const match = msg.text.match(item.regex);
                    if (match) {
                        await item.handler(msg, match);
                    }
                }
            }
            this.emit("message", msg);
        }
        if (update.callback_query) {
            this.emit("callback_query", update.callback_query);
        }
    }
}

/* ─── Formateo ────────────────────────────────────────────────── */
function money(n) {
    return `$${Number(n || 0).toLocaleString("es-CO")}`;
}
function escMd(text) {
    return String(text || "").replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
function isAuthorized(chatId) {
    if (AUTHORIZED.size === 0) return true; // si no hay lista, abierto (dev)
    return AUTHORIZED.has(Number(chatId));
}

function getTopupStatusLabel(status) {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "submitted") return "Enviada";
    if (normalized === "reviewing") return "Revisando";
    if (normalized === "approved") return "Aprobada";
    if (normalized === "rejected") return "Rechazada";
    return normalized || "Sin estado";
}

function displayTopupCurrency(value) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "USD") return "USDT";
    return normalized || String(value || "").trim();
}

async function buildTopupInlineKeyboard(item) {
    const proofUrl = await buildTopupProofUrl(item?.proofFileUrl, item?.id);
    const rows = [];

    if (proofUrl) {
        rows.push([{ text: "Ver comprobante", url: proofUrl }]);
    }

    const status = String(item?.status || "").toLowerCase();
    if (!["approved", "rejected"].includes(status) && Number(item?.id) > 0) {
        rows.push([
            { text: "Revisando", callback_data: `topup_reviewing_${item.id}` },
            { text: "Aprobar", callback_data: `topup_approved_${item.id}` },
            { text: "Rechazar", callback_data: `topup_rejected_${item.id}` },
        ]);
    }

    return rows.length ? { inline_keyboard: rows } : undefined;
}

function buildTopupMessage(item, extra = {}) {
    const lines = [
        "Recarga manual",
        `Codigo: ${item.requestCode}`,
        `Usuario: ${item.userName || "-"}${item.userEmail ? ` | ${item.userEmail}` : ""}`,
        `Monto: ${Number(item.amount || 0).toLocaleString("es-CO")} ${displayTopupCurrency(item.currency) || ""}`.trim(),
        `Metodo: ${item.methodLabel || "-"}`,
        `Estado: ${getTopupStatusLabel(item.status)}`,
    ];

    if (item.payerName) {
        lines.push(`Girador declarado: ${item.payerName}`);
    }
    if (item.declaredPaidAt) {
        const declared = new Date(item.declaredPaidAt);
        lines.push(`Hora declarada: ${declared.toLocaleString("es-CO", { timeZone: "America/Bogota" })}`);
    }
    if (item.createdAt) {
        const date = new Date(item.createdAt);
        lines.push(`Creada: ${date.toLocaleString("es-CO", { timeZone: "America/Bogota" })}`);
    }
    if (item.balanceBefore != null && item.balanceAfter != null) {
        lines.push(`Saldo: ${Number(item.balanceBefore).toLocaleString("es-CO")} -> ${Number(item.balanceAfter).toLocaleString("es-CO")} ${displayTopupCurrency(item.currency) || ""}`.trim());
    }
    if (item.adminNote) {
        lines.push(`Nota: ${item.adminNote}`);
    }
    if (item.autoValidationNote) {
        lines.push(`Validacion: ${item.autoValidationNote}`);
    }
    if (extra.actor) {
        lines.push(`Gestionado por: ${extra.actor}`);
    }
    if (extra.note) {
        lines.push(`Detalle: ${extra.note}`);
    }
    return lines.join("\n");
}

function getUserRegistrationStatusLabel(status) {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "active") return "Activo";
    if (normalized === "pending") return "Pendiente";
    if (normalized === "rejected") return "Rechazado";
    if (normalized === "inactive") return "Inactivo";
    if (normalized === "blocked") return "Bloqueado";
    return normalized || "Sin estado";
}

function mapRegistrationUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name || "",
        email: row.email || "",
        role: row.role || "user",
        status: row.status || "pending",
        currency: row.currency || "COP",
        createdAt: row.created_at,
    };
}

async function getRegistrationUserById(userId, db = pool) {
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) return null;
    const [rows] = await db.query(
        `SELECT id, name, email, role, status, currency, created_at
           FROM users
          WHERE id = ?
          LIMIT 1`,
        [id]
    );
    return mapRegistrationUser(rows[0]);
}

function buildUserRegistrationInlineKeyboard(user) {
    const status = String(user?.status || "").toLowerCase();
    if (status !== "pending" || !(Number(user?.id) > 0)) return undefined;
    return {
        inline_keyboard: [[
            { text: "Activar", callback_data: `user_active_${user.id}` },
            { text: "Rechazar", callback_data: `user_rejected_${user.id}` },
        ]],
    };
}

function buildUserRegistrationMessage(user, extra = {}) {
    const lines = [
        "Nuevo usuario registrado",
        `ID: ${user.id}`,
        `Nombre: ${user.name || "-"}`,
        `Email: ${user.email || "-"}`,
        `Estado: ${getUserRegistrationStatusLabel(user.status)}`,
        `Moneda: ${user.currency || "COP"}`,
    ];

    if (user.createdAt) {
        const date = new Date(user.createdAt);
        lines.push(`Creado: ${date.toLocaleString("es-CO", { timeZone: "America/Bogota" })}`);
    }
    if (extra.actor) lines.push(`Gestionado por: ${extra.actor}`);
    if (extra.note) lines.push(`Detalle: ${extra.note}`);
    return lines.join("\n");
}

async function updateRegisteredUserStatusFromTelegram({ id, status }) {
    const userId = Number(id);
    const nextStatus = String(status || "").trim().toLowerCase();
    if (!Number.isFinite(userId) || userId <= 0) {
        throw new Error("Usuario invalido.");
    }
    if (!["active", "rejected"].includes(nextStatus)) {
        throw new Error("Estado invalido.");
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
            `SELECT id, name, email, role, status, currency, created_at
               FROM users
              WHERE id = ?
              LIMIT 1
              FOR UPDATE`,
            [userId]
        );
        if (!rows.length) {
            await conn.rollback();
            throw new Error("Usuario no encontrado.");
        }

        const current = mapRegistrationUser(rows[0]);
        const currentStatus = String(current.status || "").toLowerCase();
        if (currentStatus !== "pending") {
            await conn.commit();
            return {
                user: current,
                changed: false,
                note: `No se cambio porque ya esta ${getUserRegistrationStatusLabel(currentStatus)}.`,
            };
        }

        await conn.query("UPDATE users SET status = ? WHERE id = ?", [nextStatus, userId]);

        if (nextStatus === "active") {
            await conn.query(
                `INSERT INTO wallets (user_id, balance, currency)
                 SELECT u.id, 0.00, COALESCE(u.currency, 'COP')
                   FROM users u
                   LEFT JOIN wallets w ON w.user_id = u.id
                  WHERE u.id = ?
                    AND w.id IS NULL`,
                [userId]
            );
        }

        const [updatedRows] = await conn.query(
            `SELECT id, name, email, role, status, currency, created_at
               FROM users
              WHERE id = ?
              LIMIT 1`,
            [userId]
        );
        await conn.commit();
        return {
            user: mapRegistrationUser(updatedRows[0]),
            changed: true,
            note: `Estado actualizado a ${getUserRegistrationStatusLabel(nextStatus)}.`,
        };
    } catch (err) {
        try { await conn.rollback(); } catch { }
        throw err;
    } finally {
        conn.release();
    }
}

async function notifyAuthorizedChats(text, options = {}, meta = {}) {
    if (!bot || AUTHORIZED.size === 0) return [];
    const sent = [];
    const excluded = new Set((meta.excludeChatIds || []).map((id) => Number(id)));
    for (const chatId of AUTHORIZED) {
        if (excluded.has(Number(chatId))) continue;
        try {
            const message = await bot.sendMessage(chatId, text, options);
            sent.push({ chatId, message });
        } catch (e) {
            console.error(`[TelegramBot] Error enviando a ${chatId}:`, e?.message || e);
        }
    }
    return sent;
}

async function sendTopupProofPreview(chatId, item) {
    const viewerUrl = await buildTopupProofUrl(item?.proofFileUrl, item?.id);
    const fileUrl = await buildTopupProofFileUrl(item?.proofFileUrl, item?.id);
    const proofUrl = fileUrl || viewerUrl;
    if (!proofUrl || !bot) return;
    try {
        if (/\.pdf($|\?)/i.test(String(item?.proofFileUrl || proofUrl))) {
            await bot.sendDocument(chatId, proofUrl, {
                caption: `Comprobante ${item.requestCode}`,
            });
            return;
        }
        await bot.sendPhoto(chatId, proofUrl, {
            caption: `Comprobante ${item.requestCode}`,
        });
    } catch (err) {
        console.error(`[TelegramBot] Error enviando comprobante a ${chatId}:`, err?.message || err);
        if (viewerUrl) {
            await bot.sendMessage(chatId, `No pude adjuntar el comprobante, pero puedes abrirlo aqui:\n${viewerUrl}`).catch(() => { });
        }
    }
}

/* ─── Guard de autorización ───────────────────────────────────── */
function guard(handler) {
    return async (msg, match) => {
        if (!isAuthorized(msg.chat.id)) {
            return bot.sendMessage(msg.chat.id, "🚫 No autorizado.");
        }
        try {
            await handler(msg, match);
        } catch (e) {
            console.error("[TelegramBot]", e);
            bot.sendMessage(msg.chat.id, "⚠️ Error interno al procesar el comando.").catch(() => { });
        }
    };
}

/* ─── Comandos ────────────────────────────────────────────────── */

/** /start */
async function cmdStart(msg) {
    const name = msg.from?.first_name || "Admin";
    const opts = {
        parse_mode: "MarkdownV2",
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "🛒 Comprar a cliente", callback_data: "cmd_comprar" }
                ],
                [
                    { text: "📦 Ver Stock", callback_data: "cmd_stock" },
                    { text: "📊 Últimas Ventas", callback_data: "cmd_ventas" }
                ],
                [
                    { text: "💳 Consultar mi saldo", callback_data: "cmd_saldo" },
                    { text: "➕ Agregar Stock", callback_data: "cmd_addstock" }
                ]
            ]
        }
    };

    await bot.sendMessage(msg.chat.id,
        `👋 Hola *${escMd(name)}*\\!\n\n` +
        `Soy el bot de *StreamingBox Admin*\\. ¿Qué deseas hacer hoy?`,
        opts
    );
}

/** /stock — cuentas disponibles agrupadas por plataforma */
async function cmdStock(msg) {
    const [rows] = await pool.query(`
        SELECT
            p.name AS platform,
            COUNT(pa.id) AS disponibles,
            (SELECT COUNT(*) FROM platform_accounts pa2 WHERE pa2.platform_id = p.id AND pa2.status != 'disabled') AS total
        FROM platforms p
        LEFT JOIN platform_accounts pa
            ON pa.platform_id = p.id AND pa.status = 'available'
        WHERE p.is_active = 1
        GROUP BY p.id, p.name
        HAVING disponibles > 0
        ORDER BY disponibles DESC
    `);

    if (!rows.length) {
        return bot.sendMessage(msg.chat.id, "📦 No hay plataformas activas.");
    }

    const lines = rows.map(r => {
        const emoji = r.disponibles === 0 ? "🔴" : r.disponibles <= 2 ? "🟡" : "🟢";
        return `${emoji} *${escMd(r.platform)}*: ${r.disponibles} disponibles / ${r.total} total`;
    });

    await bot.sendMessage(msg.chat.id,
        `📦 *Stock actual*\n━━━━━━━━━━━━━\n${lines.join("\n")}`,
        { parse_mode: "MarkdownV2" }
    );
}

/** /ventas [n] — últimas n ventas */
async function cmdVentas(msg, match) {
    const n = Math.min(Math.max(parseInt(match?.[1]) || 10, 1), 30);

    const [rows] = await pool.query(`
        SELECT
            o.order_code,
            o.total,
            o.currency,
            o.created_at,
            u.name,
            u.email,
            GROUP_CONCAT(p.name ORDER BY p.name SEPARATOR ', ') AS platforms,
            COALESCE((SELECT SUM(amount) FROM wallet_transactions wt WHERE wt.reference_type = 'order' AND wt.reference_id = o.id AND wt.type = 'profit'), 0) AS profit
        FROM orders o
        JOIN users u ON u.id = o.user_id
        JOIN order_items oi ON oi.order_id = o.id
        JOIN platforms p ON p.id = oi.platform_id
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT ?
    `, [n]);

    if (!rows.length) {
        return bot.sendMessage(msg.chat.id, "📊 Sin ventas registradas.");
    }

    const lines = rows.map(r => {
        const date = new Date(r.created_at);
        const d = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

        const platArr = (r.platforms || "").split(",").map(p => p.trim()).filter(Boolean);
        const counts = {};
        for (const p of platArr) counts[p] = (counts[p] || 0) + 1;
        const platStrs = Object.entries(counts).map(([name, q]) => q > 1 ? `${q}x ${name}` : name);
        const formatPlats = platStrs.join(", ");

        const g = ` \\| 💵 *${escMd(money(r.profit || 0))}*`;

        return `🛒 *${escMd(r.order_code)}*\n👤 ${escMd(r.name || r.email)}\n📺 ${escMd(formatPlats)}\n💰 *${escMd(money(r.total))}*${g} \\| 📅 ${escMd(d)}`;
    });

    await bot.sendMessage(msg.chat.id,
        `📊 *Últimas ${n} ventas*\n━━━━━━━━━━━━━\n\n${lines.join("\n\n")}`,
        { parse_mode: "MarkdownV2" }
    );
}

/** /saldo [@username | userId] */
async function cmdSaldo(msg, match) {
    const arg = match?.[1]?.trim();

    let whereClause = "u.id = ?";
    let param = msg.from.id; // default: propio chat (si está vinculado)

    if (arg) {
        const asNum = Number(arg);
        if (Number.isFinite(asNum) && asNum > 0) {
            whereClause = "u.id = ?";
            param = asNum;
        } else {
            const clean = arg.replace(/^@/, "");
            whereClause = "u.name LIKE ?";
            param = `%${clean}%`;
        }
    }

    const [rows] = await pool.query(`
        SELECT u.name, u.email, w.balance, w.profit_total, w.currency
        FROM users u
        LEFT JOIN wallets w ON w.user_id = u.id
        WHERE ${whereClause}
        LIMIT 1
    `, [param]);

    if (!rows.length) {
        return bot.sendMessage(msg.chat.id, "❌ Usuario no encontrado.");
    }

    const r = rows[0];
    const balance = Number(r.balance || 0);
    const profit = Number(r.profit_total || 0);
    const emoji = balance <= 0 ? "🔴" : balance < 50000 ? "🟡" : "🟢";

    await bot.sendMessage(msg.chat.id,
        `💳 *Saldo de ${escMd(r.name || r.email)}*\n━━━━━━━━━━━━━\n` +
        `${emoji} Saldo: *${escMd(money(balance))}*\n` +
        `💰 Ganancia acumulada: *${escMd(money(profit))}*`,
        { parse_mode: "MarkdownV2" }
    );
}

/** /comprar -> Inicia el proceso interactivo */
async function cmdComprarStart(msg) {
    buySessions.set(msg.chat.id, { step: 'ASK_USER' });
    await bot.sendMessage(msg.chat.id, "🛒 *Proceso de Compra*\n\n¿A quién le vas a realizar la venta? Escribe parte de su nombre o correo para buscarlo:", { parse_mode: "Markdown" });
}

async function handleBuyMessage(msg) {
    const session = buySessions.get(msg.chat.id);
    if (!session || msg.text?.startsWith("/")) return;

    if (session.step === 'ASK_USER') {
        const q = msg.text.trim();
        const [users] = await pool.query(
            "SELECT id, name, email FROM users WHERE name LIKE ? OR email LIKE ? LIMIT 5",
            [`%${q}%`, `%${q}%`]
        );

        if (!users.length) {
            return bot.sendMessage(msg.chat.id, "❌ No encontré a nadie con ese nombre o correo. Intenta con otro:");
        }

        const opts = {
            reply_markup: {
                inline_keyboard: users.map(u => [{
                    text: `${u.name} (${u.email})`,
                    callback_data: `buys_u_${u.id}`
                }])
            }
        };
        await bot.sendMessage(msg.chat.id, "¿Cuál de estos usuarios es?", opts);

    } else if (session.step === 'ASK_PROFIT') {
        const profit = Number(msg.text) || 0;
        session.profit = profit;

        await bot.sendMessage(msg.chat.id, "⏳ Procesando la compra...");
        try {
            const { checkoutService } = require("./checkoutService");
            const result = await checkoutService({
                userId: session.userId,
                items: [{ platformPriceId: session.priceId }],
                recordProfit: session.profit > 0,
                profitAmount: session.profit
            });

            await bot.sendMessage(msg.chat.id,
                `✅ *¡Compra Exitosa!*\n\nCopia y envía este mensaje al cliente:\n\n\`\`\`text\n${result.message}\n\`\`\``,
                { parse_mode: "Markdown" }
            );
        } catch (err) {
            await bot.sendMessage(msg.chat.id, `❌ *Error al procesar compra:*\n${err.message}`, { parse_mode: "Markdown" });
        }

        buySessions.delete(msg.chat.id);
    }
}

async function handleBuyCallback(query) {
    const data = query.data;
    const chatId = query.message.chat.id;
    if (!data.startsWith("buys_")) return;

    const session = buySessions.get(chatId) || {};

    if (data.startsWith("buys_u_")) {
        session.userId = parseInt(data.replace("buys_u_", ""));
        session.step = 'ASK_PLATFORM';
        buySessions.set(chatId, session);

        const [plats] = await pool.query(`
            SELECT DISTINCT p.id, p.name 
            FROM platforms p
            JOIN platform_accounts pa ON pa.platform_id = p.id
            WHERE p.is_active = 1 AND pa.status = 'available'
            ORDER BY p.name ASC
        `);

        if (!plats.length) {
            return bot.editMessageText("❌ En este momento no hay ninguna plataforma con cuentas disponibles en stock.", {
                chat_id: chatId,
                message_id: query.message.message_id
            });
        }

        const kb = [];
        for (let i = 0; i < plats.length; i += 2) {
            kb.push(plats.slice(i, i + 2).map(p => ({
                text: p.name,
                callback_data: `buys_p_${p.id}`
            })));
        }

        await bot.editMessageText(`✅ Usuario seleccionado.\n\n¿Qué plataforma vas a venderle?`, {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: { inline_keyboard: kb }
        });

    } else if (data.startsWith("buys_p_")) {
        session.platformId = parseInt(data.replace("buys_p_", ""));

        const [prices] = await pool.query(`
            SELECT pp.id, d.days, pp.price, pp.currency 
            FROM platform_prices pp 
            JOIN durations d ON d.id = pp.duration_id
            WHERE pp.platform_id = ? AND pp.is_active = 1
            ORDER BY d.days ASC
        `, [session.platformId]);

        if (!prices.length) {
            return bot.editMessageText("❌ Esa plataforma no tiene precios/días configurados.", {
                chat_id: chatId,
                message_id: query.message.message_id
            });
        }

        const kb = prices.map(p => [{
            text: `${p.days} días - ${p.currency} $${Number(p.price).toLocaleString("es-CO")}`,
            callback_data: `buys_d_${p.id}`
        }]);

        await bot.editMessageText("⏳ ¿Por cuántos días?", {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: { inline_keyboard: kb }
        });

    } else if (data.startsWith("buys_d_")) {
        session.priceId = parseInt(data.replace("buys_d_", ""));
        session.step = 'ASK_PROFIT';
        buySessions.set(chatId, session);

        await bot.editMessageText(`💰 ¿Cuánta ganancia (profit) deseas registrar en esta venta?\n\n(Escribe el número en el chat, ó 0 si no deseas grabar ganancia):`, {
            chat_id: chatId,
            message_id: query.message.message_id
        });
    }
}

/* ─── Registrar comandos ──────────────────────────────────────── */
async function cmdAddStockStart(msg) {
    buySessions.delete(msg.chat.id);
    stockSessions.set(msg.chat.id, { step: "ASK_PLATFORM" });

    const [plats] = await pool.query(
        `SELECT id, name
         FROM platforms
         WHERE is_active = 1
         ORDER BY name ASC
         LIMIT 100`
    );

    if (!plats.length) {
        return bot.sendMessage(msg.chat.id, "No hay plataformas activas.");
    }

    const kb = [];
    for (let i = 0; i < plats.length; i += 2) {
        kb.push(
            plats.slice(i, i + 2).map((p) => ({
                text: p.name,
                callback_data: `stock_p_${p.id}`,
            }))
        );
    }

    await bot.sendMessage(
        msg.chat.id,
        "Agregar Stock\n\nSelecciona la plataforma:",
        { reply_markup: { inline_keyboard: kb } }
    );
}

async function handleStockMessage(msg) {
    const s = stockSessions.get(msg.chat.id);
    if (!s || msg.text?.startsWith("/")) return;

    const txt = String(msg.text || "").trim();

    if (s.step === "ASK_EMAIL") {
        if (!txt.includes("@")) return bot.sendMessage(msg.chat.id, "Email invalido. Intenta de nuevo:");
        s.email = txt.toLowerCase();
        s.step = "ASK_PASSWORD";
        stockSessions.set(msg.chat.id, s);
        return bot.sendMessage(msg.chat.id, "Ahora escribe la password:");
    }

    if (s.step === "ASK_PASSWORD") {
        if (txt.length < 3) return bot.sendMessage(msg.chat.id, "Password demasiado corta. Intenta de nuevo:");
        s.password = txt;
        s.step = "ASK_PROFILE";
        stockSessions.set(msg.chat.id, s);
        return bot.sendMessage(msg.chat.id, "Perfil (1-5) o '-' para omitir:");
    }

    if (s.step === "ASK_PROFILE") {
        s.profileNumber = txt === "-" ? null : txt;
        s.step = "ASK_PIN";
        stockSessions.set(msg.chat.id, s);
        return bot.sendMessage(msg.chat.id, "PIN o '-' para omitir:");
    }

    if (s.step === "ASK_PIN") {
        s.pin = txt === "-" ? null : txt;
        s.step = "ASK_EXPIRES";
        stockSessions.set(msg.chat.id, s);
        return bot.sendMessage(msg.chat.id, "Fecha expiracion YYYY-MM-DD o '-' para omitir:");
    }

    if (s.step === "ASK_EXPIRES") {
        const expiresAt = txt === "-" ? null : txt;
        if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
            return bot.sendMessage(msg.chat.id, "Formato invalido. Usa YYYY-MM-DD o '-':");
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const out = await createAccountOne(conn, {
                platformId: s.platformId,
                email: s.email,
                password: s.password,
                pin: s.pin,
                profileNumber: s.profileNumber,
                expiresAt: expiresAt || null,
            });
            await conn.commit();
            await bot.sendMessage(
                msg.chat.id,
                `Stock agregado\nPlataforma ID: ${out.platformId}\nCuenta ID: ${out.id}\nEmail: ${s.email}`
            );
        } catch (e) {
            await conn.rollback();
            await bot.sendMessage(msg.chat.id, `Error agregando stock: ${e?.message || "desconocido"}`);
        } finally {
            conn.release();
            stockSessions.delete(msg.chat.id);
        }
    }
}

async function handleStockCallback(query) {
    const data = String(query.data || "");
    if (!data.startsWith("stock_p_")) return false;

    const chatId = query.message.chat.id;
    const platformId = Number(data.replace("stock_p_", ""));
    if (!Number.isFinite(platformId) || platformId <= 0) {
        await bot.answerCallbackQuery(query.id, { text: "Plataforma invalida" });
        return true;
    }

    const [rows] = await pool.query("SELECT id, name FROM platforms WHERE id = ? LIMIT 1", [platformId]);
    if (!rows.length) {
        await bot.answerCallbackQuery(query.id, { text: "Plataforma no encontrada" });
        return true;
    }

    const s = stockSessions.get(chatId) || {};
    s.platformId = platformId;
    s.platformName = rows[0].name;
    s.step = "ASK_EMAIL";
    stockSessions.set(chatId, s);

    await bot.editMessageText(
        `Plataforma: ${rows[0].name}\n\nEscribe el email de la cuenta:`,
        {
            chat_id: chatId,
            message_id: query.message.message_id,
        }
    );
    return true;
}

function setupCommands() {
    bot.setMyCommands([
        { command: "start", description: "Menú principal" },
        { command: "comprar", description: "Asistente de compra" },
        { command: "addstock", description: "Agregar stock manual" },
        { command: "stock", description: "Ver stock disponible" },
        { command: "ventas", description: "Últimas ventas" },
        { command: "saldo", description: "Consultar un saldo" }
    ]).catch(err => console.error("[TelegramBot] Error setting commands:", err));

    bot.onText(/^\/start$/i, guard(cmdStart));
    bot.onText(/^\/stock$/i, guard(cmdStock));
    bot.onText(/^\/ventas(?:\s+(\d+))?$/i, guard(cmdVentas));
    bot.onText(/^\/saldo(?:\s+(.+))?$/i, guard(cmdSaldo));
    bot.onText(/^\/comprar/i, guard(cmdComprarStart));
    bot.onText(/^\/addstock/i, guard(cmdAddStockStart));

    // Procesar respuestas del flujo interactivo o comandos desconocidos
    bot.on("message", guard(async (msg) => {
        if (!msg.text?.startsWith("/")) {
            await handleStockMessage(msg);
            await handleBuyMessage(msg);
        } else {
            const knownCmds = ["/start", "/stock", "/ventas", "/saldo", "/comprar", "/addstock"];
            const cmd = msg.text.split(" ")[0].split("@")[0].toLowerCase().trim();
            if (!knownCmds.includes(cmd)) {
                bot.sendMessage(msg.chat.id, `❓ Comando desconocido. Usa /start para ver los disponibles.`).catch(() => { });
            }
        }
    }));

    // Detectar selecciones del teclado inline
    bot.on("callback_query", Object.assign(async (query) => {
        const chatId = query.message?.chat?.id ?? query.from?.id;
        if (!isAuthorized(chatId)) return bot.answerCallbackQuery(query.id, { text: "No autorizado" });
        try {
            const data = query.data;
            const mockMsg = { chat: query.message?.chat || { id: chatId }, from: query.from };

            if (data === "cmd_stock") {
                await cmdStock(mockMsg);
            } else if (data === "cmd_ventas") {
                await cmdVentas(mockMsg, [null, "10"]);
            } else if (data === "cmd_saldo") {
                await cmdSaldo(mockMsg, []);
            } else if (data === "cmd_comprar") {
                await cmdComprarStart(mockMsg, []);
            } else if (data === "cmd_addstock") {
                await cmdAddStockStart(mockMsg, []);
            } else {
                const handledStock = await handleStockCallback(query);
                if (handledStock) {
                    bot.answerCallbackQuery(query.id).catch(() => { });
                    return;
                }
                const topupMatch = String(data || "").match(/^topup_(reviewing|approved|rejected)_(\d+)$/);
                if (topupMatch) {
                    const [, status, rawId] = topupMatch;
                    const actor = query.from?.username
                        ? `@${query.from.username}`
                        : (query.from?.first_name || "Admin Telegram");
                    try {
                        const item = await updateManualTopupStatus({
                            id: Number(rawId),
                            status,
                            adminUserId: null,
                            adminNote: null,
                        });
                        const replyMarkup = await buildTopupInlineKeyboard(item);
                        if (query.message?.chat?.id && query.message?.message_id) {
                            await bot.editMessageText(buildTopupMessage(item, { actor }), {
                                chat_id: query.message.chat.id,
                                message_id: query.message.message_id,
                                reply_markup: replyMarkup,
                            }).catch((editErr) => {
                                console.warn("[TelegramBot topup edit warning]", editErr?.message || editErr);
                            });
                        }
                        notifyManualTopupStatusChanged(item, {
                            actor,
                            excludeChatIds: query.message?.chat?.id ? [query.message.chat.id] : [],
                        }).catch((notifyErr) => {
                            console.error("[TelegramBot topup notify error]", notifyErr?.message || notifyErr);
                        });
                        bot.answerCallbackQuery(query.id, {
                            text: `Recarga ${getTopupStatusLabel(status).toLowerCase()}.`,
                        }).catch(() => { });
                    } catch (topupErr) {
                        const message = topupErr?.message || "No se pudo actualizar la recarga.";
                        console.error("[TelegramBot topup callback error]", message);
                        const currentItem = await getManualTopupById(Number(rawId)).catch(() => null);
                        if (currentItem && query.message?.chat?.id && query.message?.message_id) {
                            const replyMarkup = await buildTopupInlineKeyboard(currentItem).catch(() => undefined);
                            bot.editMessageText(buildTopupMessage(currentItem, { actor, note: message }), {
                                chat_id: query.message.chat.id,
                                message_id: query.message.message_id,
                                reply_markup: replyMarkup,
                            }).catch((editErr) => {
                                console.warn("[TelegramBot topup error edit warning]", editErr?.message || editErr);
                            });
                        }
                        bot.answerCallbackQuery(query.id, {
                            text: message.slice(0, 180),
                            show_alert: true,
                        }).catch(() => { });
                    }
                    return;
                }
                const userMatch = String(data || "").match(/^user_(active|rejected)_(\d+)$/);
                if (userMatch) {
                    const [, status, rawId] = userMatch;
                    const actor = query.from?.username
                        ? `@${query.from.username}`
                        : (query.from?.first_name || "Admin Telegram");
                    try {
                        const result = await updateRegisteredUserStatusFromTelegram({
                            id: Number(rawId),
                            status,
                        });
                        const user = result.user;
                        const replyMarkup = buildUserRegistrationInlineKeyboard(user);
                        const text = buildUserRegistrationMessage(user, {
                            actor,
                            note: result.note,
                        });
                        if (query.message?.chat?.id && query.message?.message_id) {
                            await bot.editMessageText(text, {
                                chat_id: query.message.chat.id,
                                message_id: query.message.message_id,
                                reply_markup: replyMarkup || { inline_keyboard: [] },
                            }).catch((editErr) => {
                                console.warn("[TelegramBot user edit warning]", editErr?.message || editErr);
                            });
                        }
                        notifyAuthorizedChats(`Registro actualizado\n\n${text}`, {
                            reply_markup: replyMarkup,
                        }, {
                            excludeChatIds: query.message?.chat?.id ? [query.message.chat.id] : [],
                        }).catch((notifyErr) => {
                            console.error("[TelegramBot user notify error]", notifyErr?.message || notifyErr);
                        });
                        bot.answerCallbackQuery(query.id, {
                            text: result.changed
                                ? `Usuario ${getUserRegistrationStatusLabel(status).toLowerCase()}.`
                                : result.note.slice(0, 180),
                        }).catch(() => { });
                    } catch (userErr) {
                        const message = userErr?.message || "No se pudo actualizar el usuario.";
                        console.error("[TelegramBot user callback error]", message);
                        const currentUser = await getRegistrationUserById(Number(rawId)).catch(() => null);
                        if (currentUser && query.message?.chat?.id && query.message?.message_id) {
                            const replyMarkup = buildUserRegistrationInlineKeyboard(currentUser);
                            bot.editMessageText(buildUserRegistrationMessage(currentUser, { actor, note: message }), {
                                chat_id: query.message.chat.id,
                                message_id: query.message.message_id,
                                reply_markup: replyMarkup || { inline_keyboard: [] },
                            }).catch((editErr) => {
                                console.warn("[TelegramBot user error edit warning]", editErr?.message || editErr);
                            });
                        }
                        bot.answerCallbackQuery(query.id, {
                            text: message.slice(0, 180),
                            show_alert: true,
                        }).catch(() => { });
                    }
                    return;
                }
                await handleBuyCallback(query);
            }
            bot.answerCallbackQuery(query.id).catch(() => { });
        } catch (e) {
            console.error("[TelegramBot callback error]", e);
            bot.answerCallbackQuery(query.id, {
                text: "Error procesando la accion.",
                show_alert: true,
            }).catch(() => { });
        }
    }));

    // Errores de polling
    bot.on("polling_error", (err) => {
        const msg = String(err?.message || err || "");
        const status = Number(err?.response?.status || err?.status || 0);
        const description = String(err?.response?.data?.description || err?.description || "");
        const isConflict = status === 409
            || /409|another getUpdates request|terminated by other getUpdates/i.test(`${msg} ${description}`);
        if (isConflict) {
            if (!botDisabledByConflict) {
                console.warn("[TelegramBot] Polling desactivado: hay otra instancia activa usando el mismo bot.");
            }
            botDisabledByConflict = true;
            bot.stopPolling().catch(() => { });
            return;
        }
        console.error("[TelegramBot] Polling error:", msg);
    });
    bot.on("error", (err) => {
        console.error("[TelegramBot] Error:", err?.message || err);
    });

    console.log("[TelegramBot] Comandos registrados. Chat IDs autorizados:", [...AUTHORIZED]);
}

/* ─── Notificación de venta ───────────────────────────────────── */

/**
 * Envía notificación de nueva venta a todos los chats autorizados.
 * @param {{ seller: string, platforms: string[], total: number, currency: string,
 *            discount: number, profit: number, newBalance: number,
 *            orderCode: string }} data
 */
async function notifySale({ seller, platforms, total, currency, discount, profit, newBalance, orderCode }) {
    if (!bot || AUTHORIZED.size === 0) return;

    const sign = currency === "COP" ? "" : `${currency} `;
    const msg =
        `🎯 *Nueva Venta*\n━━━━━━━━━━━━━\n` +
        `👤 Vendedor: *${escMd(seller)}*\n` +
        `📺 Plataforma: *${escMd(platforms.join(", "))}*\n` +
        `💰 Total: *${escMd(sign + money(total))}*\n` +
        `⬇️ Descuento: *${escMd(sign + money(discount))}*\n` +
        `💵 Ganancia: *${escMd(sign + money(profit))}*\n` +
        `💳 Saldo restante: *${escMd(sign + money(newBalance))}*\n` +
        `🔑 Orden: \`${escMd(orderCode)}\``;

    for (const chatId of AUTHORIZED) {
        bot.sendMessage(chatId, msg, { parse_mode: "MarkdownV2" }).catch(e =>
            console.error(`[TelegramBot] Error enviando a ${chatId}:`, e?.message)
        );
    }
}

async function notifyRenewalSale({
    seller,
    platform,
    total,
    currency,
    newBalance,
    orderCode,
    subscriptionId,
    renewalOrderId,
    previousOrderCode,
    actor,
}) {
    if (!bot || AUTHORIZED.size === 0) return;

    const totalLabel = `${Number(total || 0).toLocaleString("es-CO")} ${currency || ""}`.trim();
    const balanceLabel = newBalance == null
        ? "No disponible"
        : `${Number(newBalance || 0).toLocaleString("es-CO")} ${currency || ""}`.trim();

    await notifyAuthorizedChats(
        [
            "🔁 Renovación registrada",
            `👤 Cliente: ${seller || "-"}`,
            `🖥️ Plataforma: ${platform || "-"}`,
            `🆔 Suscripción renovada: #${subscriptionId || "-"}`,
            `🧾 Orden original: ${previousOrderCode || "-"}`,
            `🆕 Renovación ID: ${renewalOrderId || "-"}`,
            `🧾 Orden renovación: ${orderCode || "-"}`,
            actor ? `👤 Procesado por: ${actor}` : "",
            `💰 Valor: ${totalLabel}`,
            `💳 Saldo restante: ${balanceLabel}`,
        ].filter(Boolean).join("\n")
    );
}

async function notifyManualTopupSubmitted(topupId) {
    if (!bot || AUTHORIZED.size === 0) return;
    const item = await getManualTopupById(Number(topupId));
    if (!item) return;

    const sent = await notifyAuthorizedChats(buildTopupMessage(item), {
        reply_markup: await buildTopupInlineKeyboard(item),
    });

    await Promise.all(sent.map(({ chatId }) => sendTopupProofPreview(chatId, item)));
}

async function notifyManualTopupStatusChanged(itemOrId, extra = {}) {
    if (!bot || AUTHORIZED.size === 0) return;
    const item = typeof itemOrId === "object" && itemOrId
        ? itemOrId
        : await getManualTopupById(Number(itemOrId));
    if (!item) return;

    const title = item.status === "approved"
        ? "Recarga aprobada"
        : item.status === "rejected"
            ? "Recarga rechazada"
            : "Recarga en revision";

    await notifyAuthorizedChats(`${title}\n\n${buildTopupMessage(item, extra)}`, {
        reply_markup: await buildTopupInlineKeyboard(item),
    }, {
        excludeChatIds: extra.excludeChatIds || [],
    });
}

async function notifyManualTopupAlert(itemOrId, extra = {}) {
    if (!bot || AUTHORIZED.size === 0) return;
    const item = typeof itemOrId === "object" && itemOrId
        ? itemOrId
        : await getManualTopupById(Number(itemOrId));
    if (!item) return;

    const title = extra.title || "Novedad de recarga";
    await notifyAuthorizedChats(`${title}\n\n${buildTopupMessage(item, extra)}`, {
        reply_markup: await buildTopupInlineKeyboard(item),
    });
}

async function notifyUserRegistered(userOrId) {
    if (!bot || AUTHORIZED.size === 0) return;
    const user = typeof userOrId === "object" && userOrId
        ? mapRegistrationUser(userOrId)
        : await getRegistrationUserById(Number(userOrId));
    if (!user) return;

    await notifyAuthorizedChats(buildUserRegistrationMessage(user), {
        reply_markup: buildUserRegistrationInlineKeyboard(user),
    });
}

async function notifyOutOfStockPlatforms(platforms) {
    if (!bot || AUTHORIZED.size === 0 || !Array.isArray(platforms) || platforms.length === 0) return 0;
    const names = platforms
        .map(item => String(item?.platform_name || item?.platformName || item?.name || "").trim())
        .filter(Boolean);
    if (!names.length) return 0;

    const message = [
        "🚨 Alerta de inventario",
        "",
        names.length === 1
            ? "Esta plataforma quedó sin stock:"
            : "Estas plataformas quedaron sin stock:",
        ...names.map(name => `• ${name}`),
        "",
        "Revisa Inventario de Cuentas para cargar nuevas pantallas.",
    ].join("\n");
    const sent = await notifyAuthorizedChats(message);
    return sent.length;
}

async function notifyMonthlyPurchaseEnforcement({ periodStart, requiredTotal, users }) {
    if (!bot || AUTHORIZED.size === 0 || !Array.isArray(users) || users.length === 0) return 0;
    const periodLabel = new Intl.DateTimeFormat("es-CO", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(`${periodStart}T00:00:00Z`));
    const visibleUsers = users.slice(0, 40);
    const message = [
        "📉 Compra mínima mensual",
        "",
        `Periodo evaluado: ${periodLabel}`,
        `Mínimo requerido: ${Number(requiredTotal || 0).toLocaleString("es-CO")} COP`,
        `Usuarios deshabilitados: ${users.length}`,
        "",
        ...visibleUsers.map(user => (
            `• #${user.id} ${user.email || user.name || "Usuario"}: `
            + `${Number(user.purchaseTotal || 0).toLocaleString("es-CO")} COP`
        )),
        users.length > visibleUsers.length
            ? `• Y ${users.length - visibleUsers.length} usuarios más.`
            : "",
    ].filter(Boolean).join("\n");
    const sent = await notifyAuthorizedChats(message);
    return sent.length;
}

/* ─── Inicializar bot ─────────────────────────────────────────── */
function initBot() {
    if (!BOT_ENABLED) {
        console.warn("[TelegramBot] TELEGRAM_BOT_ENABLED=false - bot disabled.");
        return;
    }
    if (!TOKEN) {
        console.warn("[TelegramBot] TELEGRAM_BOT_TOKEN no definido — bot deshabilitado.");
        return;
    }

    try {
        bot = new TelegramBotClient(TOKEN, { polling: BOT_POLLING_ENABLED });
        setupCommands();
        console.log(`[TelegramBot] ✅ Bot iniciado${BOT_POLLING_ENABLED ? " en modo polling" : " sin polling"}.`);
    } catch (e) {
        console.error("[TelegramBot] Error al iniciar:", e?.message);
    }
}

module.exports = {
    initBot,
    notifySale,
    notifyRenewalSale,
    notifyManualTopupSubmitted,
    notifyManualTopupStatusChanged,
    notifyManualTopupAlert,
    notifyUserRegistered,
    notifyOutOfStockPlatforms,
    notifyMonthlyPurchaseEnforcement,
};
