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

const TelegramBot = require("node-telegram-bot-api");
const pool = require("../db");
const { createAccountOne } = require("./accounts.service");
const {
    buildTopupProofUrl,
    getManualTopupById,
    updateManualTopupStatus,
} = require("./manualTopups.service");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_ENABLED = String(process.env.TELEGRAM_BOT_ENABLED || "true").toLowerCase() !== "false";
const RAW_IDS = process.env.TELEGRAM_CHAT_IDS || "";
// Conjunto de chat IDs autorizados (números)
const AUTHORIZED = new Set(
    RAW_IDS.split(",").map(s => s.trim()).filter(Boolean).map(Number)
);

const buySessions = new Map();
const stockSessions = new Map();
let bot = null;
let botDisabledByConflict = false;

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

function buildTopupInlineKeyboard(item) {
    const proofUrl = buildTopupProofUrl(item?.proofFileUrl);
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
        `Monto: ${Number(item.amount || 0).toLocaleString("es-CO")} ${item.currency || ""}`.trim(),
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
        lines.push(`Saldo: ${Number(item.balanceBefore).toLocaleString("es-CO")} -> ${Number(item.balanceAfter).toLocaleString("es-CO")} ${item.currency || ""}`.trim());
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
    const proofUrl = buildTopupProofUrl(item?.proofFileUrl);
    if (!proofUrl || !bot) return;
    try {
        if (/\.pdf($|\?)/i.test(proofUrl)) {
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
                includeWhatsapp: true,
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
        if (!isAuthorized(query.message.chat.id)) return bot.answerCallbackQuery(query.id, { text: "No autorizado" });
        try {
            const data = query.data;
            const mockMsg = { chat: query.message.chat, from: query.from };

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
                    const item = await updateManualTopupStatus({
                        id: Number(rawId),
                        status,
                        adminUserId: null,
                        adminNote: `Gestionado desde Telegram por ${actor}`,
                    });
                    await bot.editMessageText(buildTopupMessage(item, { actor }), {
                        chat_id: query.message.chat.id,
                        message_id: query.message.message_id,
                        reply_markup: buildTopupInlineKeyboard(item),
                    });
                    await notifyManualTopupStatusChanged(item, {
                        actor,
                        excludeChatIds: [query.message.chat.id],
                    });
                    bot.answerCallbackQuery(query.id, {
                        text: `Recarga ${getTopupStatusLabel(status).toLowerCase()}.`,
                    }).catch(() => { });
                    return;
                }
                await handleBuyCallback(query);
            }
            bot.answerCallbackQuery(query.id).catch(() => { });
        } catch (e) {
            console.error("[TelegramBot callback error]", e);
        }
    }));

    // Errores de polling
    bot.on("polling_error", (err) => {
        const msg = String(err?.message || err || "");
        const isConflict = err?.code === "ETELEGRAM" && /409|another getUpdates request|terminated by other getUpdates/i.test(msg);
        if (isConflict) {
            console.warn("[TelegramBot] Polling disabled by 409 conflict (another instance is active).");
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

async function notifyManualTopupSubmitted(topupId) {
    if (!bot || AUTHORIZED.size === 0) return;
    const item = await getManualTopupById(Number(topupId));
    if (!item) return;

    const sent = await notifyAuthorizedChats(buildTopupMessage(item), {
        reply_markup: buildTopupInlineKeyboard(item),
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
        reply_markup: buildTopupInlineKeyboard(item),
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
        reply_markup: buildTopupInlineKeyboard(item),
    });
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
        bot = new TelegramBot(TOKEN, { polling: true });
        setupCommands();
        console.log("[TelegramBot] ✅ Bot iniciado en modo polling.");
    } catch (e) {
        console.error("[TelegramBot] Error al iniciar:", e?.message);
    }
}

module.exports = {
    initBot,
    notifySale,
    notifyManualTopupSubmitted,
    notifyManualTopupStatusChanged,
    notifyManualTopupAlert,
};
