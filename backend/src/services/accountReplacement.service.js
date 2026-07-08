const { isExpiryDateExpired } = require("../utils/date");
const { findAvailableAccountForPlatform } = require("./platformFallbacks.service");

async function replaceSubscriptionAccount({
    conn,
    subscriptionId,
    replacementAccountId = null,
    adminUserId,
}) {
    const [subRows] = await conn.query(
        `SELECT s.id, s.user_id, s.platform_id, s.delivered_platform_id, s.status,
                s.expires_at, s.platform_account_id,
                pa.platform_id AS account_platform_id,
                pa.expires_at AS account_expires_at,
                pa.email AS old_account_email
           FROM subscriptions s
           LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
          WHERE s.id = ?
          FOR UPDATE`,
        [subscriptionId]
    );

    if (!subRows.length) {
        const error = new Error("Suscripcion no encontrada.");
        error.status = 404;
        throw error;
    }

    const subscription = subRows[0];
    if (subscription.status !== "active") {
        const error = new Error("La suscripcion no esta activa.");
        error.status = 409;
        throw error;
    }

    const expired = subscription.account_expires_at
        ? isExpiryDateExpired(subscription.account_expires_at)
        : isExpiryDateExpired(subscription.expires_at, { storedDateOnly: true });
    if (expired) {
        const error = new Error("La suscripcion ya esta vencida.");
        error.status = 409;
        throw error;
    }

    const resolvedAccount = await findAvailableAccountForPlatform(conn, subscription.platform_id, {
        accountId: replacementAccountId || null,
        excludeAccountId: subscription.platform_account_id,
        additionalPlatformIds: [
            subscription.delivered_platform_id,
            subscription.account_platform_id,
        ],
    });

    if (!resolvedAccount?.account) {
        const error = new Error(
            replacementAccountId
                ? "La cuenta seleccionada ya no esta disponible para reemplazo."
                : "Sin stock: no hay cuentas disponibles para completar el reemplazo."
        );
        error.status = 409;
        error.code = "NO_STOCK";
        throw error;
    }

    const newAccount = resolvedAccount.account;
    const effectiveExpiry = subscription.account_expires_at || subscription.expires_at;

    await conn.query(
        `UPDATE platform_accounts
            SET status = 'assigned', assigned_to_user_id = ?, assigned_at = NOW(), expires_at = ?
          WHERE id = ?`,
        [subscription.user_id, effectiveExpiry, newAccount.id]
    );
    await conn.query(
        `UPDATE subscriptions
            SET platform_account_id = ?, delivered_platform_id = ?, is_attended = 0
          WHERE id = ?`,
        [newAccount.id, resolvedAccount.deliveredPlatformId, subscriptionId]
    );
    await conn.query(
        "UPDATE platform_accounts SET status = 'sold' WHERE id = ?",
        [subscription.platform_account_id]
    );

    const [orderRows] = await conn.query(
        `SELECT o.id AS order_id, o.order_code
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
          WHERE oi.subscription_id = ?
          ORDER BY oi.id DESC
          LIMIT 1`,
        [subscriptionId]
    );

    await conn.query(
        `INSERT INTO account_replacement_logs
            (subscription_id, order_id, order_code, user_id, admin_user_id, platform_id,
             old_account_id, old_account_email, new_account_id, new_account_email, previous_expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            subscriptionId,
            orderRows?.[0]?.order_id || null,
            orderRows?.[0]?.order_code || null,
            subscription.user_id,
            adminUserId,
            subscription.platform_id,
            subscription.platform_account_id,
            subscription.old_account_email || null,
            newAccount.id,
            newAccount.email || null,
            effectiveExpiry || null,
        ]
    );

    return {
        subscription,
        oldAccountId: subscription.platform_account_id,
        newAccountId: newAccount.id,
        newAccount,
    };
}

module.exports = { replaceSubscriptionAccount };
