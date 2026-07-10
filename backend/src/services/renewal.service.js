const { makeOrderCode } = require("../utils/orderCode");
const {
    addDaysBogotaDateOnly,
    bogotaDateOnlyToUtcEndOfDay,
    formatStoredDateOnly,
    toSqlDateTime,
} = require("../utils/date");
const { buildDeliveryMessage } = require("../utils/deliveryMessage");
const { getRenewalEligibility } = require("../utils/renewals");
const { insertCredentialLinkWithRetry } = require("../utils/tokens");
const { normalizeCurrency, sameCurrency } = require("../utils/currency");

async function renewSubscription({
    conn,
    subscriptionId,
    actorUserId,
    actorRole,
    deductWallet = true,
    overridePrice,
    note,
    newAccountId = null,
    allowAccountChange = false,
}) {
    const [rows] = await conn.query(
        `SELECT s.id, s.user_id, s.platform_id, s.platform_price_id, s.platform_account_id,
                s.duration_id, s.expires_at, s.price AS subscription_price, s.currency,
                s.status, IFNULL(s.is_attended, 0) AS is_attended,
                d.days, p.name AS platform_name, p.slug AS platform_slug, u.email AS user_email,
                p.type AS platform_type,
                p.show_device_rule AS platform_show_device_rule,
                p.product_details,
                pa.expires_at AS account_expires_at,
                pa.unit_cost AS account_unit_cost,
                pa.unit_cost_currency AS account_unit_cost_currency,
                pp.is_renewable,
                pp.price AS renewable_price
         FROM subscriptions s
         JOIN durations d ON d.id = s.duration_id
         JOIN platforms p ON p.id = s.platform_id
         JOIN users u ON u.id = s.user_id
         LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
         LEFT JOIN platform_prices pp ON pp.id = s.platform_price_id
         WHERE s.id = ?
         LIMIT 1
         FOR UPDATE`,
        [subscriptionId]
    );

    if (!rows.length) {
        const err = new Error("Suscripción no encontrada.");
        err.status = 404;
        throw err;
    }

    const sub = rows[0];

    const [[renewalStats]] = await conn.query(
        `SELECT COUNT(*) AS renewal_count
         FROM subscription_renewal_logs
         WHERE subscription_id = ?`,
        [subscriptionId]
    );
    const renewalCount = Number(renewalStats?.renewal_count || 0);

    if (actorRole !== "admin" && Number(sub.user_id) !== Number(actorUserId)) {
        const err = new Error("No autorizado para renovar esta suscripción.");
        err.status = 403;
        throw err;
    }

    // subscriptions.expires_at is the only contractual expiry source.
    const effectiveExpiresAt = sub.expires_at;
    const effectiveExpiresAtIsDateOnly = true;

    const eligibility = getRenewalEligibility({
        expiresAt: effectiveExpiresAt,
        expiresAtIsDateOnly: effectiveExpiresAtIsDateOnly,
        isRenewable: Number(sub.is_renewable) === 1,
        status: sub.status,
        isAttended: sub.is_attended,
        renewalCount,
        platformSlug: sub.platform_slug,
        platformName: sub.platform_name,
    });

    if (!eligibility.canRenew) {
        const err = new Error(eligibility.reason);
        err.status = 400;
        throw err;
    }

    const [recentRenewalRows] = await conn.query(
        `SELECT renewal_order_code, new_expires_at, created_at
         FROM subscription_renewal_logs
         WHERE subscription_id = ?
           AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 MINUTE)
         ORDER BY created_at DESC
         LIMIT 1`,
        [subscriptionId]
    );
    if (recentRenewalRows.length) {
        const err = new Error("Esta cuenta ya fue renovada hace unos minutos. Actualiza la pantalla antes de intentar de nuevo.");
        err.status = 409;
        err.payload = {
            renewalOrderCode: recentRenewalRows[0].renewal_order_code,
            newExpiry: recentRenewalRows[0].new_expires_at,
        };
        throw err;
    }

    const amount = Number(
        overridePrice !== undefined && overridePrice !== null
            ? overridePrice
            : (sub.renewable_price ?? sub.subscription_price ?? 0)
    );

    if (!Number.isFinite(amount) || amount < 0) {
        const err = new Error("El monto de renovación debe ser un número mayor o igual a 0.");
        err.status = 400;
        throw err;
    }

    const previousExpiry = formatStoredDateOnly(effectiveExpiresAt);
    if (!previousExpiry || previousExpiry === "-") {
        const err = new Error("La suscripcion no tiene una fecha de vencimiento valida para renovar.");
        err.status = 400;
        throw err;
    }
    const days = Number(sub.days || 0);
    const newExpiry = addDaysBogotaDateOnly(days, new Date(`${previousExpiry}T12:00:00Z`));
    const previousAccountExpiry = toSqlDateTime(bogotaDateOnlyToUtcEndOfDay(previousExpiry));
    const newAccountExpiry = toSqlDateTime(bogotaDateOnlyToUtcEndOfDay(newExpiry));

    const previousAccountId = Number(sub.platform_account_id || 0) || null;
    let finalAccountId = previousAccountId;
    let accountChanged = false;
    let renewalUnitCost = Number(sub.account_unit_cost || 0);
    let renewalUnitCostCurrency = normalizeCurrency(sub.account_unit_cost_currency || "COP", "COP");

    if (allowAccountChange && newAccountId) {
        finalAccountId = Number(newAccountId);
        if (!Number.isInteger(finalAccountId) || finalAccountId <= 0) {
            const err = new Error("La nueva cuenta seleccionada es inválida.");
            err.status = 400;
            throw err;
        }

        if (finalAccountId !== previousAccountId) {
            const [newAccountRows] = await conn.query(
                `SELECT id, platform_id, status, unit_cost, unit_cost_currency
                 FROM platform_accounts
                 WHERE id = ?
                 LIMIT 1
                 FOR UPDATE`,
                [finalAccountId]
            );

            if (!newAccountRows.length) {
                const err = new Error("La nueva cuenta seleccionada no existe.");
                err.status = 404;
                throw err;
            }

            const newAccount = newAccountRows[0];
            if (Number(newAccount.platform_id) !== Number(sub.platform_id)) {
                const err = new Error("La nueva cuenta no pertenece a la misma plataforma.");
                err.status = 400;
                throw err;
            }

            if (String(newAccount.status) !== "available") {
                const err = new Error("La nueva cuenta ya no está disponible.");
                err.status = 409;
                throw err;
            }

            accountChanged = true;
            renewalUnitCost = Number(newAccount.unit_cost || 0);
            renewalUnitCostCurrency = normalizeCurrency(newAccount.unit_cost_currency || "COP", "COP");
        }
    }

    const [previousOrderRows] = await conn.query(
        `SELECT o.id, o.order_code
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE oi.subscription_id = ?
         ORDER BY o.created_at DESC, oi.id DESC
         LIMIT 1`,
        [subscriptionId]
    );

    const previousOrderId = previousOrderRows[0]?.id || null;
    const previousOrderCode = previousOrderRows[0]?.order_code || null;

    const updateFields = [
        "expires_at = ?",
        "status = 'active'",
        "is_attended = 0",
    ];
    const updateParams = [newExpiry];

    if (accountChanged) {
        updateFields.push("platform_account_id = ?");
        updateParams.push(finalAccountId);
    }
    updateParams.push(subscriptionId);

    await conn.query(
        `UPDATE subscriptions SET ${updateFields.join(", ")} WHERE id = ?`,
        updateParams
    );

    if (accountChanged) {
        if (previousAccountId) {
            await conn.query(
                `UPDATE platform_accounts
                 SET assigned_to_user_id = NULL,
                     assigned_at = NULL,
                     expires_at = NULL,
                     status = 'available'
                 WHERE id = ?`,
                [previousAccountId]
            );

        }
        await conn.query(
            `UPDATE platform_accounts
             SET status = 'assigned',
                 assigned_to_user_id = ?,
                 assigned_at = NOW(),
                 expires_at = ?
             WHERE id = ?`,
            [sub.user_id, newAccountExpiry, finalAccountId]
        );
    } else if (previousAccountId) {
            await conn.query(
                `UPDATE platform_accounts
                 SET expires_at = ?
                 WHERE id = ?`,
                [newAccountExpiry, previousAccountId]
            );
    }

    const renewalOrderCode = makeOrderCode().replace(/^ORD-/, "RENO-");
    const [renewalOrderIns] = await conn.query(
        `INSERT INTO orders (user_id, order_code, total, currency, created_at)
         VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
        [sub.user_id, renewalOrderCode, amount, sub.currency]
    );
    const renewalOrderId = renewalOrderIns.insertId;

    await conn.query(
        `INSERT INTO order_items
            (order_id, subscription_id, platform_id, platform_price_id, price, cost_amount, cost_currency, profit_amount, product_details_snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            renewalOrderId,
            subscriptionId,
            sub.platform_id,
            sub.platform_price_id,
            amount,
            renewalUnitCost,
            renewalUnitCostCurrency,
            renewalUnitCost <= 0 || sameCurrency(renewalUnitCostCurrency, sub.currency)
                ? Number((amount - renewalUnitCost).toFixed(2))
                : null,
            sub.product_details || null,
        ]
    );

    let walletId = null;
    let balanceBefore = null;
    let balanceAfter = null;

    if (deductWallet) {
        const [wrows] = await conn.query(
            "SELECT id, balance, currency FROM wallets WHERE user_id = ? FOR UPDATE",
            [sub.user_id]
        );
        if (!wrows.length) {
            const err = new Error("Billetera del usuario no encontrada.");
            err.status = 404;
            throw err;
        }

        walletId = Number(wrows[0].id);
        if (!sameCurrency(wrows[0].currency || "COP", sub.currency || "COP")) {
            const err = new Error("La moneda de la billetera no coincide con la renovacion.");
            err.status = 409;
            throw err;
        }
        balanceBefore = Number(wrows[0].balance || 0);
        if (balanceBefore < amount) {
            const err = new Error(`Saldo insuficiente. Tiene ${balanceBefore.toLocaleString("es-CO")} y se requieren ${amount.toLocaleString("es-CO")}.`);
            err.status = 400;
            throw err;
        }

        balanceAfter = balanceBefore - amount;
        await conn.query("UPDATE wallets SET balance = ? WHERE id = ?", [balanceAfter, walletId]);
        await conn.query(
            `INSERT INTO wallet_transactions
                (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
             VALUES (?, 'purchase', ?, ?, 'order', ?, ?)`,
            [walletId, -amount, balanceAfter, renewalOrderId, note || `Renovación suscripción #${subscriptionId}`]
        );
    }

    await conn.query(
        `INSERT INTO subscription_renewal_logs
            (subscription_id, previous_order_id, previous_order_code, renewal_order_id, renewal_order_code,
             user_id, actor_user_id, actor_role, platform_id, platform_price_id,
             previous_account_id, new_account_id, previous_expires_at, new_expires_at,
             amount_charged, currency, deduct_wallet, wallet_id, balance_before, balance_after, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            subscriptionId,
            previousOrderId,
            previousOrderCode,
            renewalOrderId,
            renewalOrderCode,
            sub.user_id,
            actorUserId,
            actorRole,
            sub.platform_id,
            sub.platform_price_id,
            previousAccountId,
            finalAccountId,
            previousAccountExpiry,
            newAccountExpiry,
            amount,
            sub.currency,
            deductWallet ? 1 : 0,
            walletId,
            balanceBefore,
            balanceAfter,
            note || null,
        ]
    );

    let account = null;
    if (finalAccountId) {
        const [accountRows] = await conn.query(
            `SELECT pa.id, pa.platform_id, pa.email, pa.password, pa.pin, pa.profile_number, pa.access_url, pa.expires_at,
                    p.name AS delivered_platform_name, p.slug AS delivered_platform_slug
             FROM platform_accounts pa
             LEFT JOIN platforms p ON p.id = pa.platform_id
             WHERE pa.id = ?
             LIMIT 1`,
            [finalAccountId]
        );
        account = accountRows?.[0] || null;
    }

    const [tokenRows] = await conn.query(
        `SELECT token
         FROM credential_links
         WHERE subscription_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [subscriptionId]
    );
    const token = tokenRows?.[0]?.token || await insertCredentialLinkWithRetry(conn, {
        subscriptionId,
        createdByUserId: actorUserId,
    });

    const deliveryMessage = buildDeliveryMessage({
        orderCode: renewalOrderCode,
        baseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:3000",
        results: [{
            subscriptionId,
            plan: {
                platform_id: sub.platform_id,
                platform_name: sub.platform_name,
                platform_slug: sub.platform_slug,
                type: sub.platform_type,
                show_device_rule: sub.platform_show_device_rule,
            },
            account: account || {},
            expiresAt: newExpiry,
            token,
            purchasedPlatformId: sub.platform_id,
            purchasedPlatformName: sub.platform_name,
            purchasedPlatformSlug: sub.platform_slug,
            deliveredPlatformId: account?.platform_id || sub.platform_id,
            deliveredPlatformName: account?.delivered_platform_name || sub.platform_name,
            usedFallback: account ? Number(account.platform_id) !== Number(sub.platform_id) : false,
        }],
    });

    return {
        ok: true,
        subscriptionId,
        userId: sub.user_id,
        platformName: sub.platform_name,
        renewalOrderId,
        renewalOrderCode,
        previousOrderId,
        previousOrderCode,
        previousExpiry,
        newExpiry,
        previousAccountId,
        newAccountId: finalAccountId,
        deducted: deductWallet ? amount : 0,
        amountCharged: amount,
        currency: sub.currency,
        newBalance: balanceAfter,
        balanceBefore,
        walletId,
        eligibleUntilDate: eligibility.expiresOnDate,
        token,
        deliveryMessage,
    };
}

module.exports = { renewSubscription };
