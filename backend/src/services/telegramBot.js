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

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const RAW_IDS = process.env.TELEGRAM_CHAT_IDS || "";
// Conjunto de chat IDs autorizados (números)
const AUTHORIZED = new Set(
    RAW_IDS.split(",").map(s => s.trim()).filter(Boolean).map(Number)
);

const buySessions = new Map();
let bot = null;

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
    await bot.sendMessage(msg.chat.id,
        `👋 Hola *${escMd(name)}*\\!\n\n` +
        `Soy el bot de *StreamingBox Admin*\\. Comandos disponibles:\n\n` +
        `📦 /stock — Ver stock disponible\n` +
        `📊 /ventas \\[n\\] — Últimas ventas\n` +
        `💳 /saldo \\[@nombre\\] — Saldo de usuario\n` +
        `🛒 /comprar — Asistente de compra interactivo`,
        { parse_mode: "MarkdownV2" }
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

        const g = Number(r.profit) > 0 ? ` \\| 💵 *${escMd(money(r.profit))}*` : '';

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
function setupCommands() {
    bot.onText(/^\/start$/, guard(cmdStart));
    bot.onText(/^\/stock$/, guard(cmdStock));
    bot.onText(/^\/ventas(?:\s+(\d+))?$/, guard(cmdVentas));
    bot.onText(/^\/saldo(?:\s+(.+))?$/, guard(cmdSaldo));
    bot.onText(/^\/comprar/, guard(cmdComprarStart));

    // Procesar respuestas del flujo interactivo o comandos desconocidos
    bot.on("message", guard(async (msg) => {
        if (!msg.text?.startsWith("/")) {
            await handleBuyMessage(msg);
        } else {
            const knownCmds = ["/start", "/stock", "/ventas", "/saldo", "/comprar"];
            const cmd = msg.text.split(" ")[0].split("@")[0];
            if (!knownCmds.includes(cmd)) {
                bot.sendMessage(msg.chat.id, `❓ Comando desconocido. Usa /start para ver los disponibles.`).catch(() => { });
            }
        }
    }));

    // Detectar selecciones del teclado inline
    bot.on("callback_query", Object.assign(async (query) => {
        if (!isAuthorized(query.message.chat.id)) return bot.answerCallbackQuery(query.id, { text: "No autorizado" });
        try {
            await handleBuyCallback(query);
            bot.answerCallbackQuery(query.id).catch(() => { });
        } catch (e) {
            console.error("[TelegramBot callback error]", e);
        }
    }));

    // Errores de polling
    bot.on("polling_error", (err) => {
        console.error("[TelegramBot] Polling error:", err?.message || err);
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

/* ─── Inicializar bot ─────────────────────────────────────────── */
function initBot() {
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

module.exports = { initBot, notifySale };
