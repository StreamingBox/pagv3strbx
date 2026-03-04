const pool = require("../db");
const { insertCredentialLinkWithRetry } = require("../utils/tokens");
const { makeOrderCode } = require("../utils/orderCode");
const { buildWhatsappMessage } = require("../utils/whatsappMessage");

async function checkoutService({ userId, includeWhatsapp, items, recordProfit, profitAmount }) {
    const platformPriceIds = items
        .map((x) => Number(x?.platformPriceId))
        .filter((n) => Number.isFinite(n) && n > 0);

    if (!platformPriceIds.length) {
        const err = new Error("items debe contener al menos un platformPriceId válido.");
        err.status = 400;
        throw err;
    }

    if (platformPriceIds.length > 20) {
        const err = new Error("Máximo 20 items por checkout.");
        err.status = 400;
        throw err;
    }

    if (recordProfit && (!Number.isFinite(profitAmount) || profitAmount < 0)) {
        const err = new Error("profitAmount debe ser un número >= 0.");
        err.status = 400;
        throw err;
    }

    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        // 1) Traer planes
        const placeholders = platformPriceIds.map(() => "?").join(",");
        const [planRows] = await conn.query(
            `SELECT
         pp.id AS platform_price_id,
         pp.platform_id,
         pp.duration_id,
         pp.price,
         pp.currency,
         d.days,
         p.name AS platform_name,
         p.slug AS platform_slug,
         p.whatsapp_instructions
       FROM platform_prices pp
       JOIN durations d ON d.id = pp.duration_id
       JOIN platforms p ON p.id = pp.platform_id
       WHERE pp.id IN (${placeholders}) AND pp.is_active = 1`,
            platformPriceIds
        );

        // permitir duplicados + validar que existan
        const byId = new Map(planRows.map((p) => [Number(p.platform_price_id), p]));
        const missing = platformPriceIds.filter((id) => !byId.has(Number(id)));
        if (missing.length) {
            const err = new Error("Uno o más planes no existen o están inactivos.");
            err.status = 404;
            err.payload = { missingPlatformPriceIds: missing };
            throw err;
        }

        const plans = platformPriceIds.map((id) => byId.get(Number(id)));

        // 2) Moneda consistente
        const currency = (plans[0].currency || "COP").toString();
        const mixedCurrency = plans.some((p) => (p.currency || "COP").toString() !== currency);
        if (mixedCurrency) {
            const err = new Error("Todos los items deben tener la misma moneda.");
            err.status = 400;
            throw err;
        }

        // 3) Wallet lock
        const [walletRows] = await conn.query(
            "SELECT id, balance, currency FROM wallets WHERE user_id = ? FOR UPDATE",
            [userId]
        );

        let wallet;
        if (!walletRows.length) {
            const [wIns] = await conn.query(
                "INSERT INTO wallets (user_id, balance, currency) VALUES (?, 0.00, ?)",
                [userId, currency]
            );
            wallet = { id: wIns.insertId, balance: 0.0, currency };
        } else {
            wallet = walletRows[0];
        }

        // ✅ Evitar compra en moneda distinta a la wallet
        if ((wallet.currency || "COP").toString() !== currency) {
            const err = new Error(`Tu wallet está en ${wallet.currency}, pero el carrito está en ${currency}.`);
            err.status = 400;
            throw err;
        }

        // 4) Total + saldo
        const total = plans.reduce((sum, p) => sum + Number(p.price || 0), 0);
        const balance = Number(wallet.balance);

        if (balance < total) {
            const err = new Error("Saldo insuficiente. Debes recargar, contacta con el administrador.");
            err.status = 402;
            err.payload = { needed: total, balance };
            throw err;
        }

        // ✅ Crear ORDEN (1 sola)
        const orderCode = makeOrderCode();
        const [ordIns] = await conn.query(
            `INSERT INTO orders (user_id, order_code, total, currency, created_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
            [userId, orderCode, total, currency]
        );
        const orderId = ordIns.insertId;

        // 5) Items: reservar cuenta + crear subscription + token + order_items
        const results = [];

        for (const plan of plans) {
            const [accRows] = await conn.query(
                `SELECT id, email, password, pin, profile_number, access_url
         FROM platform_accounts
         WHERE platform_id = ? AND status = 'available'
         ORDER BY id ASC
         LIMIT 1
         FOR UPDATE`,
                [plan.platform_id]
            );

            if (!accRows.length) {
                const err = new Error(`No hay cuentas disponibles para ${plan.platform_name}. Contacta al administrador.`);
                err.status = 409;
                throw err;
            }

            const account = accRows[0];
            const expiresAt = new Date(Date.now() + Number(plan.days) * 24 * 60 * 60 * 1000);

            const [subIns] = await conn.query(
                `INSERT INTO subscriptions
          (user_id, platform_id, platform_price_id, duration_id, platform_account_id,
           status, expires_at, price, currency)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
                [
                    userId,
                    plan.platform_id,
                    plan.platform_price_id,
                    plan.duration_id,
                    account.id,
                    expiresAt,
                    Number(plan.price),
                    currency,
                ]
            );

            const subscriptionId = subIns.insertId;

            await conn.query(
                `UPDATE platform_accounts
         SET status='assigned', assigned_to_user_id=?, assigned_at=NOW(), expires_at=?
         WHERE id=?`,
                [userId, expiresAt, account.id]
            );

            const token = await insertCredentialLinkWithRetry(conn, {
                subscriptionId,
                createdByUserId: userId,
                showWhatsapp: includeWhatsapp,
            });

            await conn.query(
                `INSERT INTO order_items (order_id, subscription_id, platform_id, platform_price_id, price)
         VALUES (?, ?, ?, ?, ?)`,
                [orderId, subscriptionId, plan.platform_id, plan.platform_price_id, Number(plan.price)]
            );

            results.push({ subscriptionId, plan, account, expiresAt, token });
        }

        // 6) Wallet: descontar + (opcional) sumar ganancia
        const newBalance = balance - total;
        const profitToAdd = recordProfit ? Number(profitAmount || 0) : 0;

        await conn.query(
            "UPDATE wallets SET balance = ?, profit_total = profit_total + ? WHERE id = ?",
            [newBalance, profitToAdd, wallet.id]
        );

        // 7) wallet_transactions
        await conn.query(
            `INSERT INTO wallet_transactions
        (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
       VALUES (?, 'purchase', ?, ?, 'order', ?, ?)`,
            [wallet.id, -Number(total), newBalance, orderId, `Orden ${orderCode}`]
        );

        if (profitToAdd > 0) {
            await conn.query(
                `INSERT INTO wallet_transactions
          (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
         VALUES (?, 'profit', ?, ?, 'order', ?, ?)`,
                [wallet.id, Number(profitToAdd), newBalance, orderId, `Ganancia registrada en orden ${orderCode}`]
            );
        }

        await conn.commit();

        // 8) Notificación Telegram (fire-and-forget, no bloquea)
        const sellerInfo = await pool.query(
            "SELECT name, email FROM users WHERE id = ? LIMIT 1", [userId]
        ).then(([r]) => r[0]).catch(() => null);

        const { notifySale } = require("./telegramBot");
        notifySale({
            seller: sellerInfo?.name || sellerInfo?.email || `ID ${userId}`,
            platforms: plans.map(p => p.platform_name),
            total,
            currency,
            discount: total,          // lo que se descontó del wallet
            profit: profitToAdd,     // ganancia registrada
            newBalance,
            orderCode,
        }).catch(e => console.error("[TelegramBot] notifySale error:", e?.message));

        // 9) Mensaje WhatsApp
        const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
        const message = buildWhatsappMessage({ orderCode, results, baseUrl });

        // leer wallet actualizada (incluye ganancia acumulada)
        const [wAfter] = await pool.query(
            "SELECT balance, profit_total, currency FROM wallets WHERE id = ? LIMIT 1",
            [wallet.id]
        );

        return {
            ok: true,
            orderId,
            orderCode,
            count: results.length,
            subscriptionIds: results.map((r) => r.subscriptionId),
            message,
            total,
            currency,
            wallet: {
                balance: Number(wAfter?.[0]?.balance ?? newBalance),
                profit_total: Number(wAfter?.[0]?.profit_total ?? 0),
                currency: wAfter?.[0]?.currency ?? currency,
            },
        };
    } catch (err) {
        try { await conn.rollback(); } catch { }
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { checkoutService };
