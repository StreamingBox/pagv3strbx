const pool = require("../db");
const { insertCredentialLinkWithRetry } = require("../utils/tokens");
const { makeOrderCode } = require("../utils/orderCode");
const {
    addDaysBogotaDateOnly,
    BOGOTA_TODAY_SQL,
    bogotaDateSql,
    bogotaDateOnlyToUtcEndOfDay,
    parseDateOnly,
    toSqlDateTime,
} = require("../utils/date");
const { buildDeliveryMessage } = require("../utils/deliveryMessage");
const { normalizeCurrency, sameCurrency } = require("../utils/currency");
const { automaticUnitCostForPlan } = require("../utils/profitCosts");
const { enqueueNotification, enqueueSaleNotification } = require("./notificationOutbox.service");
const { schedulePlatformStockAlertCheck } = require("./stockAlertMonitor.service");
const { getCandidatePlatformsForPlatform } = require("./platformFallbacks.service");
const {
    getStrbxReportedNetflixProviderAccount,
    canSellStrbxReportedNetflixAccount,
} = require("../utils/strbxReportedAccounts");

function isAllowedDeliveryPlatform(requestedPlatformId, accountPlatformId, candidatePlatforms = []) {
    const requested = Number(requestedPlatformId);
    const accountPlatform = Number(accountPlatformId);
    if (!Number.isInteger(requested) || requested <= 0 || !Number.isInteger(accountPlatform) || accountPlatform <= 0) return false;
    return candidatePlatforms.some((candidate) => Number(candidate.platformId) === accountPlatform);
}

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
            `SELECT pa.*, p.name AS delivered_platform_name, p.slug AS delivered_platform_slug,
                    p.is_active AS delivered_platform_is_active,
                    CASE WHEN pa.expires_at IS NULL OR ${bogotaDateSql("pa.expires_at")} >= ${BOGOTA_TODAY_SQL}
                         THEN 1 ELSE 0 END AS inventory_not_expired
               FROM platform_accounts pa
               JOIN platforms p ON p.id = pa.platform_id
              WHERE pa.id = ?
              FOR UPDATE`,
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
        if (!Number(account.inventory_not_expired)) {
            const err = new Error("La cuenta de inventario está vencida y ya no se puede vender.");
            err.status = 409;
            throw err;
        }

        const providerReport = await getStrbxReportedNetflixProviderAccount(conn, {
            platformId: account.platform_id,
            email: account.email,
        });
        if (!canSellStrbxReportedNetflixAccount(providerReport, adminUserId)) {
            const err = new Error("Esta cuenta reportada solo puede venderla el administrador que registró el reporte al proveedor.");
            err.status = 403;
            throw err;
        }

        // 2. Obtener datos del plan/precio
        const [priceRows] = await conn.query(
            `SELECT pp.*, pp.id AS platform_price_id, d.days, p.name as platform_name, p.slug as platform_slug, p.type, p.show_device_rule, p.product_details
             FROM platform_prices pp
             JOIN durations d ON d.id = pp.duration_id
             JOIN platforms p ON p.id = pp.platform_id
             WHERE pp.id = ? AND pp.is_active = 1 AND p.is_active = 1`,
            [platformPriceId]
        );
        if (!priceRows.length) {
            const err = new Error("El plan/precio no existe o está inactivo.");
            err.status = 404;
            throw err;
        }
        const plan = priceRows[0];

        // Permitir solo la plataforma solicitada o una equivalencia activa
        // configurada explícitamente para ese producto.
        const candidatePlatforms = await getCandidatePlatformsForPlatform(conn, plan.platform_id);
        if (
            !Number(account.delivered_platform_is_active) ||
            !isAllowedDeliveryPlatform(plan.platform_id, account.platform_id, candidatePlatforms)
        ) {
            const err = new Error("La cuenta no pertenece a la plataforma seleccionada ni a una equivalencia activa.");
            err.status = 400;
            throw err;
        }

        // 3. Obtener Usuario y Wallet (lock)
        const [userRows] = await conn.query(
            "SELECT u.id, u.name, u.email, u.currency, w.id as wallet_id, w.balance, w.currency AS wallet_currency FROM users u JOIN wallets w ON w.user_id = u.id WHERE u.id = ? FOR UPDATE",
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
        if (!sameCurrency(targetUser.wallet_currency || "COP", targetUser.currency || "COP")) {
            const err = new Error("La moneda de la billetera no coincide con la del usuario.");
            err.status = 409;
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
            finalExpiresAt = parseDateOnly(customExpiryDate);
            if (!finalExpiresAt) {
                const err = new Error("La fecha de vencimiento debe tener el formato YYYY-MM-DD.");
                err.status = 400;
                throw err;
            }
        } else {
            // Usar la duración por defecto del plan
            finalExpiresAt = addDaysBogotaDateOnly(Number(plan.days));
        }

        const expiresAtSql = toSqlDateTime(bogotaDateOnlyToUtcEndOfDay(finalExpiresAt));

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
             (user_id, platform_id, platform_price_id, duration_id, platform_account_id, delivered_platform_id, status, expires_at, price, currency)
             VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
            [userId, plan.platform_id, plan.platform_price_id, plan.duration_id, accountId, account.platform_id, finalExpiresAt, totalAmount, plan.currency]
        );
        const subscriptionId = subIns.insertId;

        // 5.3 Crear Order Item
        const recordedUnitCost = Number(account.unit_cost || 0);
        const recordedUnitCostCurrency = normalizeCurrency(account.unit_cost_currency || "COP", "COP");
        const unitCost = recordedUnitCost > 0
            ? recordedUnitCost
            : automaticUnitCostForPlan(plan);
        const unitCostCurrency = recordedUnitCost > 0
            ? recordedUnitCostCurrency
            : normalizeCurrency(plan.currency, "COP");
        const comparableCost = unitCost <= 0 || sameCurrency(unitCostCurrency, plan.currency);
        await conn.query(
            "INSERT INTO order_items (order_id, subscription_id, platform_id, platform_price_id, price, cost_amount, cost_currency, profit_amount, delivered_platform_id, product_details_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                orderId,
                subscriptionId,
                plan.platform_id,
                plan.platform_price_id,
                totalAmount,
                unitCost,
                unitCost > 0 ? unitCostCurrency : plan.currency,
                comparableCost ? Number((totalAmount - unitCost).toFixed(2)) : null,
                account.platform_id,
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

        if (targetUser.email) {
            await enqueueNotification(conn, {
                channel: "email",
                eventType: "order_delivery",
                dedupeKey: `order-delivery:${orderId}`,
                payload: { orderId },
            });
        }

        await enqueueSaleNotification(conn, {
            orderId,
            seller: targetUser.name || targetUser.email || `ID ${userId}`,
            platforms: [plan.platform_name],
            total: totalAmount,
            currency: plan.currency,
            discount: 0,
            profit: profitToAdd,
            newBalance,
            orderCode,
        });

        await conn.commit();
        schedulePlatformStockAlertCheck();

        // 6. Preparar respuesta y correo de entrega
        const results = [{
            subscriptionId,
            plan,
            purchasedPlatformId: plan.platform_id,
            purchasedPlatformName: plan.platform_name,
            purchasedPlatformSlug: plan.platform_slug,
            deliveredPlatformId: account.platform_id,
            deliveredPlatformName: account.delivered_platform_name || plan.platform_name,
            usedFallback: Number(account.platform_id) !== Number(plan.platform_id),
            account: {
                email: account.email,
                password: account.password,
                pin: account.pin,
                two_factor_secret: account.two_factor_secret,
                profile_number: account.profile_number,
                youtube_channel_name: account.youtube_channel_name,
                access_url: account.access_url
            },
            expiresAt: finalExpiresAt,
            token
        }];

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
            deliveredPlatformId: Number(account.platform_id),
            deliveredPlatformName: account.delivered_platform_name || plan.platform_name,
            usedFallback: Number(account.platform_id) !== Number(plan.platform_id),
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

function normalizeSaleItems(items) {
    if (!Array.isArray(items) || items.length < 1 || items.length > 10) {
        const err = new Error("La venta debe incluir entre 1 y 10 cuentas.");
        err.status = 400;
        throw err;
    }

    const seenAccountIds = new Set();
    return items.map((item, index) => {
        const accountId = Number(item?.accountId);
        const platformPriceId = Number(item?.platformPriceId);
        if (!Number.isSafeInteger(accountId) || accountId <= 0 || !Number.isSafeInteger(platformPriceId) || platformPriceId <= 0) {
            const err = new Error(`La cuenta y el plan del artículo ${index + 1} no son válidos.`);
            err.status = 400;
            throw err;
        }
        if (seenAccountIds.has(accountId)) {
            const err = new Error("No se puede agregar dos veces la misma cuenta de inventario.");
            err.status = 400;
            throw err;
        }
        seenAccountIds.add(accountId);
        return { accountId, platformPriceId, customExpiryDate: item.customExpiryDate || null };
    });
}

/**
 * Vende varias cuentas de inventario como una sola orden y un solo débito.
 * Toda validación y escritura ocurre dentro de la misma transacción.
 */
async function sellAccountsFromInventory(payload) {
    const { adminUserId, userId, recordProfit, profitAmount } = payload;
    const items = normalizeSaleItems(payload.items);
    const normalizedUserId = Number(userId);
    if (!Number.isSafeInteger(normalizedUserId) || normalizedUserId <= 0) {
        const err = new Error("userId es obligatorio y debe ser válido.");
        err.status = 400;
        throw err;
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Lock accounts in a deterministic order to reduce deadlocks.
        const accountIds = items.map((item) => item.accountId).sort((a, b) => a - b);
        const accountPlaceholders = accountIds.map(() => "?").join(",");
        const [accountRows] = await conn.query(
            `SELECT pa.*, p.name AS delivered_platform_name, p.slug AS delivered_platform_slug,
                    p.is_active AS delivered_platform_is_active,
                    CASE WHEN pa.expires_at IS NULL OR ${bogotaDateSql("pa.expires_at")} >= ${BOGOTA_TODAY_SQL}
                         THEN 1 ELSE 0 END AS inventory_not_expired
               FROM platform_accounts pa
               JOIN platforms p ON p.id = pa.platform_id
              WHERE pa.id IN (${accountPlaceholders})
              ORDER BY pa.id ASC
              FOR UPDATE`,
            accountIds
        );
        const accountsById = new Map(accountRows.map((account) => [Number(account.id), account]));
        if (accountsById.size !== items.length) {
            const err = new Error("Una o más cuentas de inventario ya no existen.");
            err.status = 404;
            throw err;
        }

        const priceIds = [...new Set(items.map((item) => item.platformPriceId))];
        const pricePlaceholders = priceIds.map(() => "?").join(",");
        const [priceRows] = await conn.query(
            `SELECT pp.*, pp.id AS platform_price_id, d.days, p.name AS platform_name,
                    p.slug AS platform_slug, p.type, p.show_device_rule, p.product_details
               FROM platform_prices pp
               JOIN durations d ON d.id = pp.duration_id
               JOIN platforms p ON p.id = pp.platform_id
              WHERE pp.id IN (${pricePlaceholders}) AND pp.is_active = 1 AND p.is_active = 1`,
            priceIds
        );
        const pricesById = new Map(priceRows.map((price) => [Number(price.id), price]));
        if (pricesById.size !== priceIds.length) {
            const err = new Error("Uno o más planes no existen o están inactivos.");
            err.status = 404;
            throw err;
        }

        const validatedItems = [];
        for (const item of items) {
            const account = accountsById.get(item.accountId);
            const plan = pricesById.get(item.platformPriceId);
            if (account.status !== "available") {
                const err = new Error(`La cuenta #${account.id} no está disponible (estado: ${account.status}).`);
                err.status = 409;
                throw err;
            }
            if (!Number(account.inventory_not_expired)) {
                const err = new Error(`La cuenta #${account.id} está vencida y ya no se puede vender.`);
                err.status = 409;
                throw err;
            }

            const providerReport = await getStrbxReportedNetflixProviderAccount(conn, {
                platformId: account.platform_id,
                email: account.email,
            });
            if (!canSellStrbxReportedNetflixAccount(providerReport, adminUserId)) {
                const err = new Error(`La cuenta #${account.id} reportada solo puede venderla el administrador que registró el reporte al proveedor.`);
                err.status = 403;
                throw err;
            }

            const candidatePlatforms = await getCandidatePlatformsForPlatform(conn, plan.platform_id);
            if (
                !Number(account.delivered_platform_is_active) ||
                !isAllowedDeliveryPlatform(plan.platform_id, account.platform_id, candidatePlatforms)
            ) {
                const err = new Error(`La cuenta #${account.id} no pertenece a la plataforma seleccionada ni a una equivalencia activa.`);
                err.status = 400;
                throw err;
            }

            let expiresAt;
            if (item.customExpiryDate) {
                expiresAt = parseDateOnly(item.customExpiryDate);
                if (!expiresAt) {
                    const err = new Error(`La fecha de vencimiento del artículo para ${plan.platform_name} debe tener el formato YYYY-MM-DD.`);
                    err.status = 400;
                    throw err;
                }
            } else {
                expiresAt = addDaysBogotaDateOnly(Number(plan.days));
            }
            validatedItems.push({ item, account, plan, expiresAt });
        }

        const [userRows] = await conn.query(
            `SELECT u.id, u.name, u.email, u.currency, w.id AS wallet_id, w.balance,
                    w.currency AS wallet_currency
               FROM users u
               JOIN wallets w ON w.user_id = u.id
              WHERE u.id = ?
              FOR UPDATE`,
            [normalizedUserId]
        );
        if (!userRows.length) {
            const err = new Error("El usuario no existe o no tiene wallet.");
            err.status = 404;
            throw err;
        }
        const targetUser = userRows[0];
        const currency = normalizeCurrency(validatedItems[0].plan.currency, "COP");
        if (!sameCurrency(targetUser.currency || "COP", currency) || !sameCurrency(targetUser.wallet_currency || "COP", currency)) {
            const err = new Error("Todos los planes deben usar la moneda de la wallet del usuario.");
            err.status = 400;
            throw err;
        }
        if (validatedItems.some(({ plan }) => !sameCurrency(plan.currency, currency))) {
            const err = new Error("Todos los planes de una venta deben usar la misma moneda.");
            err.status = 400;
            throw err;
        }

        const lineAmounts = validatedItems.map(({ plan }) => Number(plan.price));
        if (lineAmounts.some((amount) => !Number.isFinite(amount) || amount <= 0)) {
            const err = new Error("Uno o más artículos tienen un precio inválido.");
            err.status = 400;
            throw err;
        }
        const totalAmount = Number(lineAmounts.reduce((total, amount) => total + amount, 0).toFixed(2));
        if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
            const err = new Error("El total de la venta no es válido.");
            err.status = 400;
            throw err;
        }
        if (Number(targetUser.balance) < totalAmount) {
            const err = new Error("Saldo insuficiente en la wallet del usuario.");
            err.status = 402;
            err.payload = { balance: targetUser.balance, needed: totalAmount };
            throw err;
        }

        const orderCode = makeOrderCode();
        const [orderInsert] = await conn.query(
            "INSERT INTO orders (user_id, order_code, total, currency, created_at) VALUES (?, ?, ?, ?, NOW())",
            [normalizedUserId, orderCode, totalAmount, currency]
        );
        const orderId = orderInsert.insertId;
        const results = [];

        for (const { item, account, plan, expiresAt } of validatedItems) {
            const expiresAtSql = toSqlDateTime(bogotaDateOnlyToUtcEndOfDay(expiresAt));
            const [subscriptionInsert] = await conn.query(
                `INSERT INTO subscriptions
                 (user_id, platform_id, platform_price_id, duration_id, platform_account_id, delivered_platform_id, status, expires_at, price, currency)
                 VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
                [normalizedUserId, plan.platform_id, plan.platform_price_id, plan.duration_id, account.id, account.platform_id, expiresAt, Number(plan.price), currency]
            );
            const subscriptionId = subscriptionInsert.insertId;
            const recordedUnitCost = Number(account.unit_cost || 0);
            const recordedUnitCostCurrency = normalizeCurrency(account.unit_cost_currency || "COP", "COP");
            const unitCost = recordedUnitCost > 0 ? recordedUnitCost : automaticUnitCostForPlan(plan);
            const unitCostCurrency = recordedUnitCost > 0 ? recordedUnitCostCurrency : normalizeCurrency(plan.currency, "COP");
            const comparableCost = unitCost <= 0 || sameCurrency(unitCostCurrency, plan.currency);
            await conn.query(
                "INSERT INTO order_items (order_id, subscription_id, platform_id, platform_price_id, price, cost_amount, cost_currency, profit_amount, delivered_platform_id, product_details_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    orderId,
                    subscriptionId,
                    plan.platform_id,
                    plan.platform_price_id,
                    Number(plan.price),
                    unitCost,
                    unitCost > 0 ? unitCostCurrency : currency,
                    comparableCost ? Number((Number(plan.price) - unitCost).toFixed(2)) : null,
                    account.platform_id,
                    plan.product_details || null,
                ]
            );
            await conn.query(
                "UPDATE platform_accounts SET status = 'assigned', assigned_to_user_id = ?, assigned_at = NOW(), expires_at = ? WHERE id = ?",
                [normalizedUserId, expiresAtSql, account.id]
            );
            const token = await insertCredentialLinkWithRetry(conn, {
                subscriptionId,
                createdByUserId: adminUserId || normalizedUserId,
            });
            results.push({
                subscriptionId,
                plan,
                purchasedPlatformId: plan.platform_id,
                purchasedPlatformName: plan.platform_name,
                purchasedPlatformSlug: plan.platform_slug,
                deliveredPlatformId: account.platform_id,
                deliveredPlatformName: account.delivered_platform_name || plan.platform_name,
                usedFallback: Number(account.platform_id) !== Number(plan.platform_id),
                account: {
                    email: account.email,
                    password: account.password,
                    pin: account.pin,
                    two_factor_secret: account.two_factor_secret,
                    profile_number: account.profile_number,
                    youtube_channel_name: account.youtube_channel_name,
                    access_url: account.access_url,
                },
                expiresAt,
                token,
                platformPriceId: item.platformPriceId,
                accountId: account.id,
            });
        }

        const newBalance = Number(targetUser.balance) - totalAmount;
        const profitToAdd = recordProfit ? Number(profitAmount || 0) : 0;
        if (!Number.isFinite(profitToAdd) || profitToAdd < 0) {
            const err = new Error("La ganancia indicada no es válida.");
            err.status = 400;
            throw err;
        }
        await conn.query(
            "UPDATE wallets SET balance = ?, profit_total = profit_total + ? WHERE id = ?",
            [newBalance, profitToAdd, targetUser.wallet_id]
        );
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
        if (targetUser.email) {
            await enqueueNotification(conn, {
                channel: "email",
                eventType: "order_delivery",
                dedupeKey: `order-delivery:${orderId}`,
                payload: { orderId },
            });
        }
        await enqueueSaleNotification(conn, {
            orderId,
            seller: targetUser.name || targetUser.email || `ID ${normalizedUserId}`,
            platforms: results.map((result) => result.purchasedPlatformName),
            total: totalAmount,
            currency,
            discount: 0,
            profit: profitToAdd,
            newBalance,
            orderCode,
        });

        await conn.commit();
        schedulePlatformStockAlertCheck();
        const deliveryMessage = buildDeliveryMessage({
            orderCode,
            results,
            baseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:3000",
        });
        return {
            ok: true,
            orderId,
            orderCode,
            total: totalAmount,
            currency,
            items: results.map((result) => ({
                subscriptionId: result.subscriptionId,
                accountId: result.accountId,
                platformPriceId: result.platformPriceId,
                purchasedPlatformId: Number(result.purchasedPlatformId),
                purchasedPlatformName: result.purchasedPlatformName,
                deliveredPlatformId: Number(result.deliveredPlatformId),
                deliveredPlatformName: result.deliveredPlatformName,
                usedFallback: result.usedFallback,
            })),
            deliveryMessage,
            newBalance,
        };
    } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = {
    sellAccountFromInventory,
    sellAccountsFromInventory,
    __test: { isAllowedDeliveryPlatform, normalizeSaleItems },
};
