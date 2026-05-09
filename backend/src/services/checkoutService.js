const pool = require("../db");
const { insertCredentialLinkWithRetry } = require("../utils/tokens");
const { makeOrderCode } = require("../utils/orderCode");
const { addDaysExact, toSqlDateTime } = require("../utils/date");
const { buildDeliveryMessage } = require("../utils/deliveryMessage");
const { sendOrderDeliveryEmail } = require("./mailService");
const { normalizeCurrency, sameCurrency } = require("../utils/currency");

function allocateComboPrices(comboPrice, comboItems) {
    const price = Number(comboPrice || 0);
    const regularTotal = comboItems.reduce((sum, item) => sum + Number(item.price || 0), 0);
    if (!comboItems.length) return [];

    if (regularTotal <= 0) {
        const equal = Number((price / comboItems.length).toFixed(2));
        return comboItems.map((item, index) => ({
            ...item,
            salePrice: index === comboItems.length - 1
                ? Number((price - equal * (comboItems.length - 1)).toFixed(2))
                : equal,
        }));
    }

    let allocated = 0;
    return comboItems.map((item, index) => {
        const salePrice = index === comboItems.length - 1
            ? Number((price - allocated).toFixed(2))
            : Number((price * (Number(item.price || 0) / regularTotal)).toFixed(2));
        allocated += salePrice;
        return { ...item, salePrice };
    });
}

async function loadIndividualPlans(conn, platformPriceIds) {
    if (!platformPriceIds.length) return [];

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
            p.type
         FROM platform_prices pp
         JOIN durations d ON d.id = pp.duration_id
         JOIN platforms p ON p.id = pp.platform_id
         WHERE pp.id IN (${placeholders}) AND pp.is_active = 1`,
        platformPriceIds
    );

    const byId = new Map(planRows.map((p) => [Number(p.platform_price_id), p]));
    const missing = platformPriceIds.filter((id) => !byId.has(Number(id)));
    if (missing.length) {
        const err = new Error("Uno o mas planes no existen o estan inactivos.");
        err.status = 404;
        err.payload = { missingPlatformPriceIds: missing };
        throw err;
    }

    return platformPriceIds.map((id) => byId.get(Number(id)));
}

async function loadComboEntries(conn, comboRequests, currency) {
    if (!comboRequests.length) return [];

    const comboIds = [...new Set(comboRequests.map((combo) => combo.comboId))];
    const comboPlaceholders = comboIds.map(() => "?").join(",");

    const [comboRows] = await conn.query(
        `SELECT c.id, c.name, cp.price, cp.currency
         FROM combos c
         JOIN combo_prices cp ON cp.combo_id = c.id
         WHERE c.id IN (${comboPlaceholders})
           AND c.is_active = 1
           AND cp.is_active = 1
           AND UPPER(cp.currency) = ?`,
        [...comboIds, currency]
    );

    const comboMap = new Map(comboRows.map((combo) => [Number(combo.id), combo]));
    const missingCombos = comboIds.filter((id) => !comboMap.has(Number(id)));
    if (missingCombos.length) {
        const err = new Error("Uno o mas combos no existen, estan inactivos o no tienen precio en tu moneda.");
        err.status = 404;
        err.payload = { missingComboIds: missingCombos };
        throw err;
    }

    const [comboItemRows] = await conn.query(
        `SELECT
            ci.combo_id,
            ci.quantity,
            pp.id AS platform_price_id,
            pp.platform_id,
            pp.duration_id,
            pp.price,
            pp.currency,
            d.days,
            p.name AS platform_name,
            p.slug AS platform_slug,
            p.type
         FROM combo_items ci
         JOIN platform_prices pp ON pp.platform_id = ci.platform_id
            AND pp.duration_id = ci.duration_id
            AND UPPER(pp.currency) = ?
            AND pp.is_active = 1
         JOIN durations d ON d.id = pp.duration_id
         JOIN platforms p ON p.id = pp.platform_id AND p.is_active = 1
         WHERE ci.combo_id IN (${comboPlaceholders})
         ORDER BY ci.combo_id ASC, ci.sort_order ASC, ci.id ASC`,
        [currency, ...comboIds]
    );

    const [expectedRows] = await conn.query(
        `SELECT combo_id, SUM(quantity) AS expected_count
         FROM combo_items
         WHERE combo_id IN (${comboPlaceholders})
         GROUP BY combo_id`,
        comboIds
    );
    const expectedCountByCombo = new Map(expectedRows.map((row) => [Number(row.combo_id), Number(row.expected_count || 0)]));

    const itemsByCombo = new Map();
    for (const row of comboItemRows) {
        if (!itemsByCombo.has(row.combo_id)) itemsByCombo.set(row.combo_id, []);
        for (let i = 0; i < Number(row.quantity || 1); i += 1) {
            itemsByCombo.get(row.combo_id).push({ ...row });
        }
    }

    for (const comboId of comboIds) {
        const resolvedCount = itemsByCombo.get(comboId)?.length || 0;
        const expectedCount = expectedCountByCombo.get(comboId) || 0;
        if (!resolvedCount || resolvedCount !== expectedCount) {
            const err = new Error(`El combo ${comboMap.get(comboId)?.name || comboId} tiene plataformas sin precio activo para ${currency}.`);
            err.status = 400;
            throw err;
        }
    }

    const entries = [];
    for (const request of comboRequests) {
        const combo = comboMap.get(request.comboId);
        const comboItems = itemsByCombo.get(request.comboId) || [];

        for (let n = 0; n < request.quantity; n += 1) {
            const allocated = allocateComboPrices(Number(combo.price || 0), comboItems);
            for (const item of allocated) {
                entries.push({
                    plan: item,
                    salePrice: item.salePrice,
                    comboId: combo.id,
                    comboName: combo.name,
                });
            }
        }
    }

    return entries;
}

async function checkoutService({ userId, items, combos, recordProfit, profitAmount }) {
    const platformPriceIds = (Array.isArray(items) ? items : [])
        .map((x) => Number(x?.platformPriceId))
        .filter((n) => Number.isFinite(n) && n > 0);

    const comboRequests = (Array.isArray(combos) ? combos : [])
        .map((x) => ({
            comboId: Number(x?.comboId ?? x?.id),
            quantity: Math.max(1, Number(x?.quantity || 1)),
        }))
        .filter((x) => Number.isInteger(x.comboId) && x.comboId > 0);

    if (!platformPriceIds.length && !comboRequests.length) {
        const err = new Error("Debes enviar al menos un item o combo valido.");
        err.status = 400;
        throw err;
    }

    const requestedUnits = platformPriceIds.length + comboRequests.reduce((sum, combo) => sum + combo.quantity, 0);
    if (requestedUnits > 20) {
        const err = new Error("Maximo 20 items por checkout.");
        err.status = 400;
        throw err;
    }

    if (recordProfit && (!Number.isFinite(profitAmount) || profitAmount < 0)) {
        const err = new Error("profitAmount debe ser un numero >= 0.");
        err.status = 400;
        throw err;
    }

    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        const individualPlans = await loadIndividualPlans(conn, platformPriceIds);
        let currency = normalizeCurrency(individualPlans[0]?.currency || "", "");
        if (!currency) {
            const [urows] = await conn.query("SELECT currency FROM users WHERE id = ? LIMIT 1", [userId]);
            currency = normalizeCurrency(urows?.[0]?.currency || "COP", "COP");
        }

        const purchaseEntries = individualPlans.map((plan) => ({
            plan,
            salePrice: Number(plan.price || 0),
            comboId: null,
            comboName: null,
        }));

        purchaseEntries.push(...await loadComboEntries(conn, comboRequests, currency));

        const mixedCurrency = purchaseEntries.some((entry) => !sameCurrency(entry.plan.currency || "COP", currency));
        if (mixedCurrency) {
            const err = new Error("Todos los items deben tener la misma moneda.");
            err.status = 400;
            throw err;
        }

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
            wallet = {
                ...walletRows[0],
                currency: normalizeCurrency(walletRows[0].currency || currency, currency),
            };
            if (!sameCurrency(wallet.currency, currency)) {
                await conn.query("UPDATE wallets SET currency = ? WHERE id = ?", [currency, wallet.id]);
                wallet.currency = currency;
            }
        }

        if (!sameCurrency(wallet.currency, currency)) {
            const err = new Error(`Tu wallet esta en ${wallet.currency}, pero el carrito esta en ${currency}.`);
            err.status = 400;
            throw err;
        }

        const total = Number(purchaseEntries.reduce((sum, entry) => sum + Number(entry.salePrice || 0), 0).toFixed(2));
        const balance = Number(wallet.balance);

        if (balance < total) {
            const err = new Error("Saldo insuficiente. Debes recargar, contacta con el administrador.");
            err.status = 402;
            err.payload = { needed: total, balance };
            throw err;
        }

        const orderCode = makeOrderCode();
        const [ordIns] = await conn.query(
            `INSERT INTO orders (user_id, order_code, total, currency, created_at)
             VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
            [userId, orderCode, total, currency]
        );
        const orderId = ordIns.insertId;
        const results = [];

        for (const entry of purchaseEntries) {
            const plan = entry.plan;
            const [accRows] = await conn.query(
                `SELECT id, email, password, pin, profile_number, access_url, unit_cost
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

            const expiresAt = addDaysExact(new Date(), Number(plan.days));
            const expiresAtSql = toSqlDateTime(expiresAt);
            const itemPrice = Number(entry.salePrice || 0);

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
                    expiresAtSql,
                    itemPrice,
                    currency,
                ]
            );

            const subscriptionId = subIns.insertId;

            await conn.query(
                `UPDATE platform_accounts
                 SET status='assigned', assigned_to_user_id=?, assigned_at=NOW(), expires_at=?
                 WHERE id=?`,
                [userId, expiresAtSql, account.id]
            );

            const token = await insertCredentialLinkWithRetry(conn, {
                subscriptionId,
                createdByUserId: userId,
            });

            const unitCost = Number(account.unit_cost || 0);
            const itemProfit = Number((itemPrice - unitCost).toFixed(2));
            await conn.query(
                `INSERT INTO order_items
                    (order_id, subscription_id, platform_id, platform_price_id, price, cost_amount, profit_amount, combo_id, combo_name)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [orderId, subscriptionId, plan.platform_id, plan.platform_price_id, itemPrice, unitCost, itemProfit, entry.comboId, entry.comboName]
            );

            results.push({ subscriptionId, plan, account, expiresAt, token });
        }

        const newBalance = balance - total;
        const profitToAdd = recordProfit ? Number(profitAmount || 0) : 0;

        await conn.query(
            "UPDATE wallets SET balance = ?, profit_total = profit_total + ? WHERE id = ?",
            [newBalance, profitToAdd, wallet.id]
        );

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

        const buyerInfo = await pool.query(
            "SELECT name, email FROM users WHERE id = ? LIMIT 1",
            [userId]
        ).then(([r]) => r[0]).catch(() => null);

        const { notifySale } = require("./telegramBot");
        notifySale({
            seller: buyerInfo?.name || buyerInfo?.email || `ID ${userId}`,
            platforms: purchaseEntries.map((entry) => entry.comboName ? `${entry.comboName}: ${entry.plan.platform_name}` : entry.plan.platform_name),
            total,
            currency,
            discount: total,
            profit: profitToAdd,
            newBalance,
            orderCode,
        }).catch((e) => console.error("[TelegramBot] notifySale error:", e?.message));

        if (buyerInfo?.email) {
            sendOrderDeliveryEmail({
                to: buyerInfo.email,
                name: buyerInfo.name,
                orderCode,
                total,
                currency,
                results,
                paymentMethod: "Balance de cuenta",
            }).catch((e) => console.error("[mail] sendOrderDeliveryEmail error:", e?.message || e));
        }

        const [wAfter] = await pool.query(
            "SELECT balance, profit_total, currency FROM wallets WHERE id = ? LIMIT 1",
            [wallet.id]
        );
        const deliveryMessage = buildDeliveryMessage({
            orderCode,
            results,
            baseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:3000",
        });

        return {
            ok: true,
            orderId,
            orderCode,
            count: results.length,
            subscriptionIds: results.map((r) => r.subscriptionId),
            deliveryMessage,
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
