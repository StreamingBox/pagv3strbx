const { makeOrderCode } = require("../utils/orderCode");
const { addDaysExact, parseDateTime, toSqlDateTime } = require("../utils/date");
const { getRenewalEligibility } = require("../utils/renewals");

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
                pa.expires_at AS account_expires_at,
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

    const eligibility = getRenewalEligibility({
        expiresAt: sub.expires_at,
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

    const previousExpiry = parseDateTime(sub.expires_at) || new Date();
    const days = Number(sub.days || 0);
    const newExpiryDate = addDaysExact(previousExpiry, days);
    const newExpiry = toSqlDateTime(newExpiryDate);

    const previousAccountId = Number(sub.platform_account_id || 0) || null;
    let finalAccountId = previousAccountId;
    let accountChanged = false;

    if (allowAccountChange && newAccountId) {
        finalAccountId = Number(newAccountId);
        if (!Number.isInteger(finalAccountId) || finalAccountId <= 0) {
            const err = new Error("La nueva cuenta seleccionada es inválida.");
            err.status = 400;
            throw err;
        }

        if (finalAccountId !== previousAccountId) {
            const [newAccountRows] = await conn.query(
                `SELECT id, platform_id, status
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

    if (previousAccountId) {
        if (accountChanged) {
            await conn.query(
                `UPDATE platform_accounts
                 SET assigned_to_user_id = NULL,
                     assigned_at = NULL,
                     expires_at = NULL,
                     status = 'available'
                 WHERE id = ?`,
                [previousAccountId]
            );

            await conn.query(
                `UPDATE platform_accounts
                 SET status = 'assigned',
                     assigned_to_user_id = ?,
                     assigned_at = NOW(),
                     expires_at = ?
                 WHERE id = ?`,
                [sub.user_id, newExpiry, finalAccountId]
            );
        } else {
            await conn.query(
                `UPDATE platform_accounts
                 SET expires_at = ?
                 WHERE id = ?`,
                [newExpiry, previousAccountId]
            );
        }
    }

    const renewalOrderCode = makeOrderCode().replace(/^ORD-/, "RENO-");
    const [renewalOrderIns] = await conn.query(
        `INSERT INTO orders (user_id, order_code, total, currency, created_at)
         VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
        [sub.user_id, renewalOrderCode, amount, sub.currency]
    );
    const renewalOrderId = renewalOrderIns.insertId;

    await conn.query(
        `INSERT INTO order_items (order_id, subscription_id, platform_id, platform_price_id, price)
         VALUES (?, ?, ?, ?, ?)`,
        [renewalOrderId, subscriptionId, sub.platform_id, sub.platform_price_id, amount]
    );

    let walletId = null;
    let balanceBefore = null;
    let balanceAfter = null;

    if (deductWallet) {
        const [wrows] = await conn.query(
            "SELECT id, balance FROM wallets WHERE user_id = ? FOR UPDATE",
            [sub.user_id]
        );
        if (!wrows.length) {
            const err = new Error("Billetera del usuario no encontrada.");
            err.status = 404;
            throw err;
        }

        walletId = Number(wrows[0].id);
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
            toSqlDateTime(previousExpiry),
            newExpiry,
            amount,
            sub.currency,
            deductWallet ? 1 : 0,
            walletId,
            balanceBefore,
            balanceAfter,
            note || null,
        ]
    );

    return {
        ok: true,
        subscriptionId,
        userId: sub.user_id,
        platformName: sub.platform_name,
        renewalOrderId,
        renewalOrderCode,
        previousOrderId,
        previousOrderCode,
        previousExpiry: toSqlDateTime(previousExpiry),
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
    };
}

module.exports = { renewSubscription };
