const pool = require("../db");
const { insertCredentialLinkWithRetry } = require("../utils/tokens");
const { makeOrderCode } = require("../utils/orderCode");
const { addDaysExact, bogotaDateOnlyToUtcEndOfDay, toSqlDateTime } = require("../utils/date");
const { buildDeliveryMessage } = require("../utils/deliveryMessage");
const { sendOrderDeliveryEmail } = require("./mailService");
const { schedulePlatformStockAlertCheck } = require("./stockAlertMonitor.service");

/**
 * Vende una cuenta específica desde el inventario.
 * logic:
 * 1. Validar cuenta, usuario y precio (plan).
 * 2. Calcular fecha de vencimiento (default o manual).
 * 3. Descontar saldo de la wallet del usuario.
 * 4. Crear Order, Subscription, OrderItem y CredentialLink.
 * 5. Marcar cuenta como 'assigned'.
 * 6. Enviar entrega por correo si aplica.
 */
async function sellAccountFromInventory(payload) {
    const { 
        adminUserId, // el admin que opera (opcional para logs)
        accountId, 
        userId, 
        platformPriceId, 
        customExpiryDate, // YYYY-MM-DD
        recordProfit,
        profitAmount
    } = payload;

    if (!accountId || !userId || !platformPriceId) {
        const err = new Error("accountId, userId y platformPriceId son obligatorios.");
        err.status = 400;
        throw err;
    }

    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        // 1. Obtener datos de la cuenta (lock)
        const [accRows] = await conn.query(
            "SELECT * FROM platform_accounts WHERE id = ? FOR UPDATE",
            [accountId]
        );
        if (!accRows.length) {
            const err = new Error("La cuenta no existe.");
            err.status = 404;
            throw err;
        }
        const account = accRows[0];
        if (account.status !== "available") {
            const err = new Error(`La cuenta no está disponible (estado: ${account.status}).`);
            err.status = 409;
            throw err;
        }

        // 2. Obtener datos del plan/precio
        const [priceRows] = await conn.query(
            `SELECT pp.*, pp.id AS platform_price_id, d.days, p.name as platform_name, p.slug as platform_slug, p.type, p.show_device_rule, p.product_details
             FROM platform_prices pp
             JOIN durations d ON d.id = pp.duration_id
             JOIN platforms p ON p.id = pp.platform_id
             WHERE pp.id = ? AND pp.is_active = 1`,
            [platformPriceId]
        );
        if (!priceRows.length) {
            const err = new Error("El plan/precio no existe o está inactivo.");
            err.status = 404;
            throw err;
        }
        const plan = priceRows[0];

        // Validar que el plan coincida con la plataforma de la cuenta
        if (Number(plan.platform_id) !== Number(account.platform_id)) {
            const err = new Error("El plan seleccionado no pertenece a la plataforma de esta cuenta.");
            err.status = 400;
            throw err;
        }

        // 3. Obtener Usuario y Wallet (lock)
        const [userRows] = await conn.query(
            "SELECT u.id, u.email, u.currency, w.id as wallet_id, w.balance FROM users u JOIN wallets w ON w.user_id = u.id WHERE u.id = ? FOR UPDATE",
            [userId]
        );
        if (!userRows.length) {
            const err = new Error("El usuario no existe o no tiene wallet.");
            err.status = 404;
            throw err;
        }
        const targetUser = userRows[0];
        const totalAmount = Number(plan.price);

        if (targetUser.currency !== plan.currency) {
            const err = new Error(`La moneda del usuario (${targetUser.currency}) no coincide con la del plan (${plan.currency}).`);
            err.status = 400;
            throw err;
        }

        if (Number(targetUser.balance) < totalAmount) {
            const err = new Error("Saldo insuficiente en la wallet del usuario.");
            err.status = 402;
            err.payload = { balance: targetUser.balance, needed: totalAmount };
            throw err;
        }

        // 4. Calcular Fecha de Vencimiento
        let finalExpiresAt;
        if (customExpiryDate) {
            // Usar la fecha manual proporcionada por el admin
            finalExpiresAt = bogotaDateOnlyToUtcEndOfDay(customExpiryDate);
        } else {
            // Usar la duración por defecto del plan
            finalExpiresAt = addDaysExact(new Date(), Number(plan.days));
        }

        const expiresAtSql = toSqlDateTime(finalExpiresAt);

        // 5. Ejecutar Venta
        const orderCode = makeOrderCode();
        
        // 5.1 Crear Orden
        const [ordIns] = await conn.query(
            "INSERT INTO orders (user_id, order_code, total, currency, created_at) VALUES (?, ?, ?, ?, NOW())",
            [userId, orderCode, totalAmount, plan.currency]
        );
        const orderId = ordIns.insertId;

        // 5.2 Crear Subscripción
        const [subIns] = await conn.query(
            `INSERT INTO subscriptions 
             (user_id, platform_id, platform_price_id, duration_id, platform_account_id, status, expires_at, price, currency)
             VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
            [userId, plan.platform_id, plan.platform_price_id, plan.duration_id, accountId, expiresAtSql, totalAmount, plan.currency]
        );
        const subscriptionId = subIns.insertId;

        // 5.3 Crear Order Item
        await conn.query(
            "INSERT INTO order_items (order_id, subscription_id, platform_id, platform_price_id, price, cost_amount, profit_amount, product_details_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                orderId,
                subscriptionId,
                plan.platform_id,
                plan.platform_price_id,
                totalAmount,
                Number(account.unit_cost || 0),
                Number((totalAmount - Number(account.unit_cost || 0)).toFixed(2)),
                plan.product_details || null,
            ]
        );

        // 5.4 Marcar cuenta como asignada
        await conn.query(
            "UPDATE platform_accounts SET status = 'assigned', assigned_to_user_id = ?, assigned_at = NOW(), expires_at = ? WHERE id = ?",
            [userId, expiresAtSql, accountId]
        );

        // 5.5 Generar Token de credenciales
        const token = await insertCredentialLinkWithRetry(conn, {
            subscriptionId,
            createdByUserId: adminUserId || userId,
        });

        // 5.6 Descontar saldo y registrar ganancia
        const newBalance = Number(targetUser.balance) - totalAmount;
        const profitToAdd = recordProfit ? Number(profitAmount || 0) : 0;

        await conn.query(
            "UPDATE wallets SET balance = ?, profit_total = profit_total + ? WHERE id = ?",
            [newBalance, profitToAdd, targetUser.wallet_id]
        );

        // 5.7 Historial de transacciones
        await conn.query(
            "INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, reference_type, reference_id, note) VALUES (?, 'purchase', ?, ?, 'order', ?, ?)",
            [targetUser.wallet_id, -totalAmount, newBalance, orderId, `Venta manual desde inventario: ${orderCode}`]
        );

        if (profitToAdd > 0) {
            await conn.query(
                "INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, reference_type, reference_id, note) VALUES (?, 'profit', ?, ?, 'order', ?, ?)",
                [targetUser.wallet_id, profitToAdd, newBalance, orderId, `Ganancia manual: ${orderCode}`]
            );
        }

        await conn.commit();
        schedulePlatformStockAlertCheck();

        // 6. Preparar respuesta y correo de entrega
        const results = [{
            subscriptionId,
            plan,
            account: {
                email: account.email,
                password: account.password,
                pin: account.pin,
                profile_number: account.profile_number,
                access_url: account.access_url
            },
            expiresAt: finalExpiresAt,
            token
        }];

        const buyerInfo = await pool.query(
            "SELECT name, email FROM users WHERE id = ? LIMIT 1",
            [userId]
        ).then(([r]) => r[0]).catch(() => null);

        if (buyerInfo?.email) {
            sendOrderDeliveryEmail({
                to: buyerInfo.email,
                name: buyerInfo.name,
                orderCode,
                total: totalAmount,
                currency: plan.currency,
                results,
                paymentMethod: "Venta manual desde inventario",
            }).catch((e) => console.error("[mail] sendOrderDeliveryEmail inventory error:", e?.message || e));
        }
        const deliveryMessage = buildDeliveryMessage({
            orderCode,
            results,
            baseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:3000",
        });

        return {
            ok: true,
            orderId,
            orderCode,
            subscriptionId,
            deliveryMessage,
            newBalance
        };

    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = {
    sellAccountFromInventory
};
