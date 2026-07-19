// BACKEND
// pagv2strbx/src/services/inventory.service.js

const pool = require("../db");
const { escapeCsv } = require("../utils/csv");
const {
    bogotaDateOnlyToUtcEndOfDay,
    formatDateOnlyBogota,
    parseDateOnly,
    toSqlDateTime,
} = require("../utils/date");
const {
    normalizeOptionalValue,
    normalizeProfileForIdentity,
} = require("../utils/normalize");
const { validateCostModelInput } = require("../utils/accountCosts");
const { normalizeAccessUrl } = require("../utils/accountAccess");
const { isIptvProduct } = require("../utils/productDeliveryProfile");
const { normalizeCurrency, sameCurrency } = require("../utils/currency");

const EDITABLE_STATUSES = new Set(["available", "assigned", "sold", "inactive", "down", "expired", "disabled", "legacy_review"]);
const ACTIVE_SUBSCRIPTION_EXPIRES_DATE_SQL =
    "CASE WHEN active_sub.expires_at IS NOT NULL THEN DATE(active_sub.expires_at) ELSE DATE(DATE_SUB(pa.expires_at, INTERVAL 5 HOUR)) END";

const LATEST_REPLACEMENT_JOIN = `
LEFT JOIN (
    SELECT arl1.*
    FROM account_replacement_logs arl1
    INNER JOIN (
        SELECT new_account_id, MAX(id) AS max_id
        FROM account_replacement_logs
        GROUP BY new_account_id
    ) arl_last ON arl_last.max_id = arl1.id
) latest_replacement ON latest_replacement.new_account_id = pa.id`;

function toMoney(value) {
    const amount = Number(value || 0);
    return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
}

async function refundSubscriptionRelease(conn, { subscription, releaseLogId, orderCode }) {
    const subscriptionId = Number(subscription?.id || 0);
    const userId = Number(subscription?.user_id || 0);
    if (!subscriptionId || !userId) return null;

    const [[existingRefund]] = await conn.query(
        `SELECT id, amount, balance_after
           FROM wallet_transactions
          WHERE reference_type = 'subscription_release_refund'
            AND reference_id = ?
          LIMIT 1`,
        [subscriptionId]
    );
    if (existingRefund) {
        if (releaseLogId) {
            await conn.query(
                `UPDATE account_release_logs
                    SET wallet_transaction_id = ?,
                        wallet_amount = ?,
                        wallet_currency = ?
                  WHERE id = ?`,
                [
                    existingRefund.id,
                    toMoney(existingRefund.amount),
                    normalizeCurrency(subscription.currency || "COP", "COP"),
                    releaseLogId,
                ]
            );
        }
        return {
            alreadyRefunded: true,
            walletTransactionId: existingRefund.id,
            refundedAmount: toMoney(existingRefund.amount),
        };
    }

    const refundAmount = toMoney(subscription.item_price ?? subscription.price);
    if (refundAmount <= 0) return null;

    const targetCurrency = normalizeCurrency(subscription.currency || subscription.order_currency || "COP", "COP");
    const [walletRows] = await conn.query(
        "SELECT id, balance, profit_total, currency FROM wallets WHERE user_id = ? FOR UPDATE",
        [userId]
    );

    let wallet;
    if (!walletRows.length) {
        const [walletInsert] = await conn.query(
            "INSERT INTO wallets (user_id, balance, currency) VALUES (?, 0.00, ?)",
            [userId, targetCurrency]
        );
        wallet = { id: walletInsert.insertId, balance: 0, profit_total: 0, currency: targetCurrency };
    } else {
        wallet = {
            ...walletRows[0],
            balance: toMoney(walletRows[0].balance),
            profit_total: toMoney(walletRows[0].profit_total),
            currency: normalizeCurrency(walletRows[0].currency || targetCurrency, targetCurrency),
        };
    }

    if (!sameCurrency(wallet.currency, targetCurrency)) {
        const err = new Error(`No se pudo devolver la venta: la wallet esta en ${wallet.currency} y la venta en ${targetCurrency}.`);
        err.status = 409;
        throw err;
    }

    const newBalance = toMoney(wallet.balance + refundAmount);
    const itemProfit = Math.max(toMoney(subscription.profit_amount), 0);
    let profitToReverse = 0;
    if (itemProfit > 0 && subscription.order_id) {
        const [[profitRows]] = await conn.query(
            `SELECT
                COALESCE(SUM(CASE WHEN type = 'profit' THEN amount ELSE 0 END), 0) AS order_profit,
                COALESCE((
                    SELECT SUM(ABS(wtr.amount))
                      FROM wallet_transactions wtr
                     WHERE wtr.wallet_id = ?
                       AND wtr.type = 'profit_reversal'
                       AND wtr.reference_type = 'subscription_release_profit'
                       AND wtr.reference_id IN (
                            SELECT oi.subscription_id
                              FROM order_items oi
                             WHERE oi.order_id = ?
                       )
                ), 0) AS already_reversed
               FROM wallet_transactions
              WHERE wallet_id = ?
                AND reference_type = 'order'
                AND reference_id = ?`,
            [wallet.id, subscription.order_id, wallet.id, subscription.order_id]
        );
        const remainingProfit = Math.max(toMoney(profitRows.order_profit) - toMoney(profitRows.already_reversed), 0);
        profitToReverse = Math.min(itemProfit, remainingProfit);
    }
    const newProfitTotal = toMoney(wallet.profit_total - profitToReverse);

    await conn.query(
        "UPDATE wallets SET balance = ?, profit_total = ? WHERE id = ?",
        [newBalance, newProfitTotal, wallet.id]
    );

    const [refundInsert] = await conn.query(
        `INSERT INTO wallet_transactions
            (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
         VALUES (?, 'refund', ?, ?, 'subscription_release_refund', ?, ?)`,
        [
            wallet.id,
            refundAmount,
            newBalance,
            subscriptionId,
            `Devolucion por liberacion forzada${orderCode ? `: ${orderCode}` : ""}`,
        ]
    );

    if (profitToReverse > 0) {
        await conn.query(
            `INSERT INTO wallet_transactions
                (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
             VALUES (?, 'profit_reversal', ?, ?, 'subscription_release_profit', ?, ?)`,
            [
                wallet.id,
                -profitToReverse,
                newBalance,
                subscriptionId,
                `Reversa de ganancia por liberacion forzada${orderCode ? `: ${orderCode}` : ""}`,
            ]
        );
    }

    if (releaseLogId) {
        await conn.query(
            `UPDATE account_release_logs
                SET wallet_transaction_id = ?,
                    wallet_amount = ?,
                    wallet_currency = ?
              WHERE id = ?`,
            [refundInsert.insertId, refundAmount, targetCurrency, releaseLogId]
        );
    }

    return {
        alreadyRefunded: false,
        walletTransactionId: refundInsert.insertId,
        refundedAmount: refundAmount,
        currency: targetCurrency,
        balanceAfter: newBalance,
        reversedProfit: profitToReverse,
    };
}

/**
 * Construye WHERE dinámico + params para inventory/export.
 */
function buildInventoryWhere({ platformId, status, q, assignedTo, profileNumber, expiresFrom, expiresTo }) {
    const where = [];
    const params = [];

    if (platformId) {
        where.push("pa.platform_id = ?");
        params.push(Number(platformId));
    }

    if (status) {
        if (status === "sold") {
            where.push("pa.status IN ('assigned','sold')");
        } else if (["assigned", "available", "inactive", "down", "expired", "disabled", "legacy_review"].includes(status)) {
            where.push("pa.status = ?");
            params.push(status);
        } else {
            // ignorar status inválido
        }
    }

    if (q) {
        where.push(`(
            pa.email LIKE ? OR
            pa.platform_name LIKE ? OR
            p.name LIKE ? OR
            u.email LIKE ? OR
            CAST(active_sub.id AS CHAR) LIKE ? OR
            CAST(latest_replacement.subscription_id AS CHAR) LIKE ? OR
            CAST(latest_replacement.order_id AS CHAR) LIKE ? OR
            COALESCE(latest_replacement.order_code, '') LIKE ?
        )`);
        params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    if (assignedTo) {
        where.push("u.email LIKE ?");
        params.push(`%${assignedTo}%`);
    }

    const profileFilter = String(profileNumber || "").trim();
    if (profileFilter) {
        const normalized = profileFilter.toLowerCase().replace(/\s+/g, "");
        if (["sinperfil", "none", "null", "-", "—"].includes(normalized)) {
            where.push("(pa.profile_number IS NULL OR CAST(pa.profile_number AS CHAR) = '')");
        } else {
            where.push("CAST(pa.profile_number AS CHAR) = ?");
            params.push(profileFilter);
        }
    }

    const from = parseDateOnly(expiresFrom);
    const to = parseDateOnly(expiresTo);
    const effectiveExpiresDateSql = ACTIVE_SUBSCRIPTION_EXPIRES_DATE_SQL;

    if (from) {
        where.push(`${effectiveExpiresDateSql} >= ?`);
        params.push(from);
    }
    if (to) {
        where.push(`${effectiveExpiresDateSql} <= ?`);
        params.push(to);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    return { whereSql, params };
}

/**
 * GET /admin/inventory
 */
async function getInventory(query = {}) {
    const { platformId, status, q, assignedTo, profileNumber, expiresFrom, expiresTo, page = 1, limit = 5 } = query;

    const { whereSql, params } = buildInventoryWhere({
        platformId,
        status,
        q,
        assignedTo,
        profileNumber,
        expiresFrom,
        expiresTo,
    });

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 2000);
    const offset = (pageNum - 1) * limitNum;

    // Obtener total
    const [countRows] = await pool.query(
        `SELECT COUNT(*) as total
         FROM platform_accounts pa
         LEFT JOIN platforms p ON p.id = pa.platform_id
         LEFT JOIN users u ON u.id = pa.assigned_to_user_id
         LEFT JOIN subscriptions active_sub
           ON active_sub.platform_account_id = pa.id
          AND active_sub.status = 'active'
         ${LATEST_REPLACEMENT_JOIN}
         ${whereSql}`,
        params
    );
    const total = countRows[0]?.total || 0;

    const [rows] = await pool.query(
        `SELECT
      pa.id,
      pa.platform_id,
      p.name AS platform_name_ref,
      p.slug AS platform_slug,
      pa.platform_name AS platform_name_raw,
      pa.email,
      pa.password,
      pa.access_url,
      pa.pin,
      pa.two_factor_secret,
      pa.profile_number,
      pa.parent_account_cost_total,
      pa.parent_profiles_total,
      pa.unit_cost,
      pa.status,
      pa.assigned_to_user_id,
      u.email AS assigned_user_email,
      u.name  AS assigned_user_name,
      pa.assigned_at,
      pa.expires_at,
      COALESCE(active_sub.id, latest_replacement.subscription_id) AS sale_id,
      latest_replacement.id AS replacement_log_id,
      latest_replacement.old_account_id AS replaced_from_account_id,
      latest_replacement.old_account_email AS replaced_from_account_email,
      latest_replacement.order_id AS replacement_order_id,
      latest_replacement.order_code AS replacement_order_code,
      active_sub.expires_at AS subscription_expires_at,
      DATE_FORMAT(${ACTIVE_SUBSCRIPTION_EXPIRES_DATE_SQL}, '%Y-%m-%d') AS display_expires_date,
      pa.created_at,
      pa.updated_at
    FROM platform_accounts pa
    LEFT JOIN platforms p ON p.id = pa.platform_id
    LEFT JOIN users u ON u.id = pa.assigned_to_user_id
    LEFT JOIN subscriptions active_sub
      ON active_sub.platform_account_id = pa.id
     AND active_sub.status = 'active'
    ${LATEST_REPLACEMENT_JOIN}
    ${whereSql}
    ORDER BY pa.id DESC
    LIMIT ${limitNum} OFFSET ${offset}`,
        params
    );

    const items = rows.map((r) => ({
        ...r,
        platform_name: r.platform_name_ref || r.platform_name_raw || "",
        sale_id: r.sale_id || null,
        is_replacement: !!r.replacement_log_id,
        replaced_from_account_id: r.replaced_from_account_id || null,
        replaced_from_account_email: r.replaced_from_account_email || null,
        replacement_order_id: r.replacement_order_id || null,
        replacement_order_code: r.replacement_order_code || null,
        display_expires_at: r.display_expires_date || r.subscription_expires_at || r.expires_at,
        sold_like: ["assigned", "sold"].includes(String(r.status || "")),
    }));

    return {
        items,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
    };
}

/**
 * GET /admin/inventory/export
 * Devuelve { filename, csv } para que el route sete headers y responda.
 */
async function exportInventoryCsv(query = {}) {
    const { platformId, status, q, assignedTo, profileNumber, expiresFrom, expiresTo } = query;

    const { whereSql, params } = buildInventoryWhere({
        platformId,
        status,
        q,
        assignedTo,
        profileNumber,
        expiresFrom,
        expiresTo,
    });

    const [rows] = await pool.query(
        `SELECT
      pa.id,
      COALESCE(p.name, pa.platform_name) AS platform_name,
      pa.email,
      pa.password,
      pa.access_url,
      pa.pin,
      pa.two_factor_secret,
      pa.profile_number,
      pa.parent_account_cost_total,
      pa.parent_profiles_total,
      pa.unit_cost,
      pa.status,
      u.email AS assigned_user_email,
      COALESCE(active_sub.id, latest_replacement.subscription_id) AS sale_id,
      pa.expires_at,
      active_sub.expires_at AS subscription_expires_at,
      DATE_FORMAT(${ACTIVE_SUBSCRIPTION_EXPIRES_DATE_SQL}, '%Y-%m-%d') AS display_expires_date
    FROM platform_accounts pa
    LEFT JOIN platforms p ON p.id = pa.platform_id
    LEFT JOIN users u ON u.id = pa.assigned_to_user_id
    LEFT JOIN subscriptions active_sub
      ON active_sub.platform_account_id = pa.id
     AND active_sub.status = 'active'
    ${LATEST_REPLACEMENT_JOIN}
    ${whereSql}
    ORDER BY ${ACTIVE_SUBSCRIPTION_EXPIRES_DATE_SQL} DESC, pa.id DESC`,
        params
    );

    const header = [
        "id",
        "platform",
        "email",
        "password",
        "access_url",
        "pin",
        "two_factor_secret",
        "profile_number",
        "account_cost_total",
        "account_profiles_total",
        "unit_cost",
        "status",
        "sale_id",
        "assigned_to",
        "expires_at",
    ].join(",");

    const lines = rows.map((r) =>
        [
            escapeCsv(r.id),
            escapeCsv(r.platform_name),
            escapeCsv(r.email),
            escapeCsv(r.password),
            escapeCsv(r.access_url),
            escapeCsv(r.pin),
            escapeCsv(r.two_factor_secret),
            escapeCsv(r.profile_number),
            escapeCsv(r.parent_account_cost_total),
            escapeCsv(r.parent_profiles_total),
            escapeCsv(r.unit_cost),
            escapeCsv(r.status),
            escapeCsv(r.sale_id || ""),
            escapeCsv(r.assigned_user_email || ""),
            escapeCsv(r.display_expires_date || ((r.subscription_expires_at || r.expires_at) ? formatDateOnlyBogota(r.subscription_expires_at || r.expires_at) : "")),
        ].join(",")
    );

    return {
        filename: "inventario.csv",
        csv: [header, ...lines].join("\n"),
    };
}

async function getInventoryAccountDetail(id) {
    const accountId = Number(id);
    if (!Number.isInteger(accountId) || accountId <= 0) {
        const err = new Error("id requerido.");
        err.status = 400;
        throw err;
    }

    const [[account]] = await pool.query(
        `SELECT
            pa.id,
            pa.platform_id,
            COALESCE(p.name, pa.platform_name) AS platform_name,
            pa.email,
            pa.password,
            pa.access_url,
            pa.pin,
            pa.two_factor_secret,
            pa.profile_number,
            pa.parent_account_cost_total,
            pa.parent_profiles_total,
            pa.unit_cost,
            pa.status,
            pa.assigned_to_user_id,
            u.email AS assigned_user_email,
            u.name AS assigned_user_name,
            pa.assigned_at,
            pa.expires_at,
            pa.created_at,
            pa.updated_at
         FROM platform_accounts pa
         LEFT JOIN platforms p ON p.id = pa.platform_id
         LEFT JOIN users u ON u.id = pa.assigned_to_user_id
         WHERE pa.id = ?
         LIMIT 1`,
        [accountId]
    );

    if (!account) {
        const err = new Error("Cuenta no encontrada.");
        err.status = 404;
        throw err;
    }

    const [subscriptionRows] = await pool.query(
        `SELECT
            s.id AS subscription_id,
            s.status,
            s.expires_at,
            s.created_at,
            o.id AS order_id,
            o.order_code,
            u.email AS buyer_email,
            u.name AS buyer_name
         FROM subscriptions s
         LEFT JOIN order_items oi ON oi.subscription_id = s.id
         LEFT JOIN orders o ON o.id = oi.order_id
         LEFT JOIN users u ON u.id = s.user_id
         WHERE s.platform_account_id = ?
         ORDER BY s.id DESC`,
        [accountId]
    );

    const [replacementRows] = await pool.query(
        `SELECT
            arl.id,
            arl.subscription_id,
            arl.order_id,
            arl.order_code,
            arl.old_account_id,
            arl.old_account_email,
            arl.new_account_id,
            arl.new_account_email,
            arl.previous_expires_at,
            arl.created_at,
            admin.email AS admin_email,
            admin.name AS admin_name,
            usr.email AS user_email,
            usr.name AS user_name
         FROM account_replacement_logs arl
         LEFT JOIN users admin ON admin.id = arl.admin_user_id
         LEFT JOIN users usr ON usr.id = arl.user_id
         WHERE arl.old_account_id = ? OR arl.new_account_id = ?
         ORDER BY arl.id DESC`,
        [accountId, accountId]
    );

    const [releaseRows] = await pool.query(
        `SELECT
            arl.id,
            arl.account_id,
            arl.subscription_id,
            arl.order_id,
            arl.order_code,
            arl.user_id,
            arl.admin_user_id,
            arl.previous_status,
            arl.previous_assigned_to_user_id,
            arl.previous_expires_at,
            arl.reason,
            arl.forced,
            arl.wallet_transaction_id,
            arl.wallet_amount,
            arl.wallet_currency,
            arl.created_at,
            admin.email AS admin_email,
            admin.name AS admin_name,
            usr.email AS user_email,
            usr.name AS user_name
         FROM account_release_logs arl
         LEFT JOIN users admin ON admin.id = arl.admin_user_id
         LEFT JOIN users usr ON usr.id = arl.user_id
         WHERE arl.account_id = ?
         ORDER BY arl.id DESC`,
        [accountId]
    );

    const currentSubscription = subscriptionRows.find((row) => String(row.status) === "active") || null;
    const lastSubscription = subscriptionRows[0] || null;

    const timeline = [
        ...subscriptionRows.map((row) => ({
            type: "subscription",
            created_at: row.created_at,
            title: `Venta #${row.subscription_id}`,
            subtitle: row.order_code || (row.order_id ? `Orden #${row.order_id}` : "Sin orden"),
            meta: row.buyer_email || row.buyer_name || "",
            status: row.status,
            expires_at: row.expires_at,
        })),
        ...replacementRows.map((row) => ({
            type: row.new_account_id === accountId ? "replacement_in" : "replacement_out",
            created_at: row.created_at,
            title: row.new_account_id === accountId ? "Entró por reemplazo" : "Salió por reemplazo",
            subtitle: row.order_code || (row.order_id ? `Orden #${row.order_id}` : "Sin orden"),
            meta: row.new_account_id === accountId
                ? `${row.old_account_id ? `Cuenta #${row.old_account_id}` : "Cuenta anterior"}${row.old_account_email ? ` · ${row.old_account_email}` : ""}`
                : `${row.new_account_id ? `Cuenta #${row.new_account_id}` : "Cuenta nueva"}${row.new_account_email ? ` · ${row.new_account_email}` : ""}`,
            status: null,
            expires_at: row.previous_expires_at,
            admin_email: row.admin_email || null,
        })),
        ...releaseRows.map((row) => ({
            type: "release",
            created_at: row.created_at,
            title: row.forced ? "Cuenta liberada forzada" : "Cuenta liberada",
            subtitle: row.order_code || (row.order_id ? `Orden #${row.order_id}` : row.subscription_id ? `Venta #${row.subscription_id}` : "Sin venta asociada"),
            meta: `${row.user_email || row.user_name || "Sin comprador"}${row.reason ? ` · ${row.reason}` : ""}`,
            status: row.previous_status || null,
            expires_at: row.previous_expires_at,
            admin_email: row.admin_email || null,
        })),
    ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    return {
        account: {
            ...account,
            current_subscription_id: currentSubscription?.subscription_id || null,
            current_order_id: currentSubscription?.order_id || null,
            current_order_code: currentSubscription?.order_code || null,
        },
        currentSubscription,
        lastSubscription,
        subscriptions: subscriptionRows,
        replacements: replacementRows.map((row) => ({
            ...row,
            direction: row.new_account_id === accountId ? "incoming" : "outgoing",
        })),
        releases: releaseRows,
        timeline,
    };
}

/**
 * PATCH /admin/inventory/:id
 * Permite:
 *  - resetear asignación
 *  - cambiar status/email/password/pin/profile_number/expires_at
 */
async function patchInventory(id, body = {}, options = {}) {
    const {
        status,
        email,
        password,
        access_url,
        pin,
        two_factor_secret,
        profile_number,
        reset_assign,
        force_release,
        forceRelease,
        releaseReason,
        expires_at,
        expiresAt,
        costMode,
        costAmount,
        unitCost,
        motherCostTotal,
        motherProfilesTotal,
    } = body;

    const accountId = Number(id);
    if (!Number.isInteger(accountId) || accountId <= 0) {
        const err = new Error("id requerido.");
        err.status = 400;
        throw err;
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        if (reset_assign) {
            const shouldForceRelease = force_release === true || forceRelease === true;
            const [[accountToReset]] = await conn.query(
                `SELECT id, status, assigned_to_user_id, expires_at
                   FROM platform_accounts
                  WHERE id = ?
                  FOR UPDATE`,
                [accountId]
            );
            if (!accountToReset) {
                const error = new Error("Cuenta no encontrada.");
                error.status = 404;
                throw error;
            }

            const [activeSubscriptions] = await conn.query(
                `SELECT DISTINCT
                        s.id,
                        s.user_id,
                        s.expires_at,
                        s.price,
                        s.currency,
                        oi.id AS order_item_id,
                        oi.order_id,
                        oi.price AS item_price,
                        oi.profit_amount,
                        o.order_code,
                        o.currency AS order_currency
                   FROM subscriptions s
                   LEFT JOIN order_items oi ON oi.subscription_id = s.id
                   LEFT JOIN orders o ON o.id = oi.order_id
                  WHERE s.platform_account_id = ?
                    AND s.status = 'active'
                    AND s.expires_at >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))
                  ORDER BY s.expires_at DESC, s.id DESC
                  FOR UPDATE`,
                [accountId]
            );

            if (activeSubscriptions.length && !shouldForceRelease) {
                const activeSubscription = activeSubscriptions[0];
                const error = new Error(`No se puede liberar esta cuenta: sigue asignada a la suscripcion #${activeSubscription.id} hasta ${String(activeSubscription.expires_at).slice(0, 10)}.`);
                error.status = 409;
                error.code = "ACTIVE_SUBSCRIPTION";
                error.payload = {
                    activeSubscription: {
                        id: activeSubscription.id,
                        orderId: activeSubscription.order_id || null,
                        orderCode: activeSubscription.order_code || null,
                        expiresAt: activeSubscription.expires_at,
                    },
                };
                throw error;
            }

            const releaseRefunds = [];
            if (activeSubscriptions.length) {
                for (const sub of activeSubscriptions) {
                    const [releaseInsert] = await conn.query(
                        `INSERT INTO account_release_logs
                            (account_id, subscription_id, order_id, order_code, user_id, admin_user_id,
                             previous_status, previous_assigned_to_user_id, previous_expires_at, reason, forced)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                        [
                            accountId,
                            sub.id,
                            sub.order_id || null,
                            sub.order_code || null,
                            sub.user_id || null,
                            options.adminUserId || null,
                            accountToReset.status || null,
                            accountToReset.assigned_to_user_id || null,
                            accountToReset.expires_at || null,
                            normalizeOptionalValue(releaseReason) || "Liberacion forzada desde inventario",
                        ]
                    );
                    const refund = await refundSubscriptionRelease(conn, {
                        subscription: sub,
                        releaseLogId: releaseInsert.insertId,
                        orderCode: sub.order_code || null,
                    });
                    if (refund) releaseRefunds.push({ subscriptionId: sub.id, ...refund });
                }
                await conn.query(
                    `UPDATE subscriptions
                        SET platform_account_id = NULL,
                            status = 'cancelled'
                      WHERE platform_account_id = ?
                        AND status = 'active'
                        AND expires_at >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))`,
                    [accountId]
                );
            } else {
                await conn.query(
                    `INSERT INTO account_release_logs
                        (account_id, subscription_id, user_id, admin_user_id,
                         previous_status, previous_assigned_to_user_id, previous_expires_at, reason, forced)
                     VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
                    [
                        accountId,
                        options.adminUserId || null,
                        accountToReset.status || null,
                        accountToReset.assigned_to_user_id || null,
                        accountToReset.expires_at || null,
                        normalizeOptionalValue(releaseReason) || "Liberacion desde inventario",
                        shouldForceRelease ? 1 : 0,
                    ]
                );
            }

            await conn.query(
                `UPDATE platform_accounts
                    SET assigned_to_user_id = NULL,
                        assigned_at = NULL,
                        expires_at = NULL,
                        status = 'available'
                  WHERE id = ?`,
                [accountId]
            );
            await conn.commit();
            return {
                ok: true,
                reset: true,
                forced: shouldForceRelease,
                detachedSubscriptions: activeSubscriptions.length,
                refundedSubscriptions: releaseRefunds.length,
            };
        }

        if (reset_assign) {
            const [[accountToReset]] = await conn.query(
                "SELECT id FROM platform_accounts WHERE id = ? FOR UPDATE",
                [accountId]
            );
            if (!accountToReset) {
                const error = new Error("Cuenta no encontrada.");
                error.status = 404;
                throw error;
            }
            const [[activeSubscription]] = await conn.query(
                `SELECT id, user_id, expires_at
                   FROM subscriptions
                  WHERE platform_account_id = ?
                    AND status = 'active'
                    AND expires_at >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))
                  ORDER BY expires_at DESC, id DESC
                  LIMIT 1
                  FOR UPDATE`,
                [accountId]
            );
            if (activeSubscription) {
                const error = new Error(`No se puede liberar esta cuenta: sigue asignada a la suscripción #${activeSubscription.id} hasta ${String(activeSubscription.expires_at).slice(0, 10)}.`);
                error.status = 409;
                error.code = "ACTIVE_SUBSCRIPTION";
                throw error;
            }
            await conn.query(
                `UPDATE platform_accounts
                    SET assigned_to_user_id = NULL,
                        assigned_at = NULL,
                        expires_at = NULL,
                        status = 'available'
                  WHERE id = ?`,
                [accountId]
            );
            await conn.commit();
            return { ok: true, reset: true };
        }

        const [[current]] = await conn.query(
            `SELECT pa.id, pa.identity_id, pa.platform_id, pa.email, pa.password, pa.access_url, pa.pin,
                    pa.two_factor_secret, pa.profile_number, p.name AS platform_name, p.slug AS platform_slug
             FROM platform_accounts pa
             LEFT JOIN platforms p ON p.id = pa.platform_id
             WHERE pa.id = ?
             FOR UPDATE`,
            [accountId]
        );

        if (!current) {
            const err = new Error("Cuenta no encontrada.");
            err.status = 404;
            throw err;
        }

        const sets = [];
        const params = [];
        const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

        let nextEmail = current.email;
        let nextPassword = current.password;
        let nextAccessUrl = current.access_url;
        let nextPin = current.pin;
        let nextProfile = current.profile_number;
        let refreshIdentity = false;

        if (has("status")) {
            const cleanStatus = normalizeOptionalValue(status);
            if (!cleanStatus || !EDITABLE_STATUSES.has(cleanStatus)) {
                const err = new Error("Estado invalido.");
                err.status = 400;
                throw err;
            }
            sets.push("status = ?");
            params.push(cleanStatus);

            if (cleanStatus === "available") {
                const [[activeSubscription]] = await conn.query(
                    `SELECT id FROM subscriptions
                      WHERE platform_account_id = ?
                        AND status = 'active'
                        AND expires_at >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))
                      LIMIT 1
                      FOR UPDATE`,
                    [accountId]
                );
                if (activeSubscription) {
                    const error = new Error(`No se puede marcar disponible: la suscripción #${activeSubscription.id} sigue activa.`);
                    error.status = 409;
                    error.code = "ACTIVE_SUBSCRIPTION";
                    throw error;
                }
            }
        }

        if (has("email")) {
            const cleanEmail = normalizeOptionalValue(email);
            if (!cleanEmail) {
                const err = new Error("Correo requerido.");
                err.status = 400;
                throw err;
            }
            nextEmail = cleanEmail;
            sets.push("email = ?");
            params.push(cleanEmail);
            refreshIdentity = true;
        }

        if (has("password")) {
            nextPassword = normalizeOptionalValue(password);
            sets.push("password = ?");
            params.push(nextPassword);
            refreshIdentity = true;
        }

        if (has("access_url") || has("accessUrl") || has("url")) {
            const rawAccessUrl = has("accessUrl")
                ? body.accessUrl
                : (has("url") ? body.url : access_url);
            nextAccessUrl = normalizeAccessUrl(rawAccessUrl, {
                required: isIptvProduct({
                    platformName: current.platform_name,
                    platformSlug: current.platform_slug,
                }),
            });
            sets.push("access_url = ?");
            params.push(nextAccessUrl);
        }

        if (has("pin")) {
            nextPin = normalizeOptionalValue(pin);
            sets.push("pin = ?");
            params.push(nextPin);
            refreshIdentity = true;
        }

        if (has("two_factor_secret") || has("twoFactorSecret")) {
            const rawTwoFactor = has("twoFactorSecret") ? body.twoFactorSecret : two_factor_secret;
            sets.push("two_factor_secret = ?");
            params.push(normalizeOptionalValue(rawTwoFactor));
        }

        if (has("profile_number")) {
            const profStr = normalizeOptionalValue(profile_number);
            if (profStr === null) {
                nextProfile = null;
            } else {
                const n = Number(profStr);
                if (!Number.isInteger(n) || n < 0) {
                    const err = new Error("Perfil invalido.");
                    err.status = 400;
                    throw err;
                }
                nextProfile = n;
            }
            sets.push("profile_number = ?");
            params.push(nextProfile);
            refreshIdentity = true;
        }

        if (has("expiresAt") || has("expires_at")) {
            const rawExpires = has("expiresAt") ? expiresAt : expires_at;
            const expText = normalizeOptionalValue(rawExpires);
            const expOnly = expText ? parseDateOnly(expText) : null;
            if (expText && !expOnly) {
                const err = new Error("Fecha de expiracion invalida.");
                err.status = 400;
                throw err;
            }
            sets.push("expires_at = ?");
            params.push(expOnly ? toSqlDateTime(bogotaDateOnlyToUtcEndOfDay(expOnly)) : null);
        }

        if (isIptvProduct({
            platformName: current.platform_name,
            platformSlug: current.platform_slug,
        }) && !nextAccessUrl) {
            const err = new Error("URL es obligatoria para IPTV.");
            err.status = 400;
            throw err;
        }

        const hasCostFields = [
            "costMode",
            "costAmount",
            "unitCost",
            "motherCostTotal",
            "motherProfilesTotal",
        ].some(has);

        if (hasCostFields) {
            const costInput = {
                costMode,
                costAmount,
                unitCost,
                motherCostTotal,
                motherProfilesTotal,
            };
            const costModel = validateCostModelInput(costInput);

            sets.push("parent_account_cost_total = ?");
            params.push(costModel.parentCostTotal);
            sets.push("parent_profiles_total = ?");
            params.push(costModel.parentProfilesTotal);
            sets.push("unit_cost = ?");
            params.push(costModel.unitCost);
        }

        if (refreshIdentity) {
            const identityProfile = normalizeProfileForIdentity(nextProfile);
            const [identityResult] = await conn.query(
                `INSERT INTO account_identities (platform_id, email, profile_number, last_password, last_pin)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   last_password = VALUES(last_password),
                   last_pin = VALUES(last_pin),
                   updated_at = CURRENT_TIMESTAMP`,
                [current.platform_id, nextEmail, identityProfile, nextPassword, nextPin]
            );

            let identityId = identityResult.insertId || null;
            if (!identityId) {
                const [[identityRow]] = await conn.query(
                    `SELECT id
                     FROM account_identities
                     WHERE platform_id = ?
                       AND LOWER(email) = LOWER(?)
                       AND profile_number = ?
                     LIMIT 1`,
                    [current.platform_id, nextEmail, identityProfile]
                );
                identityId = identityRow?.id || null;
            }

            if (identityId) {
                sets.push("identity_id = ?");
                params.push(identityId);
            }
        }

        if (!sets.length) {
            await conn.commit();
            return { ok: true, unchanged: true };
        }

        await conn.query(
            `UPDATE platform_accounts
             SET ${sets.join(", ")}
             WHERE id = ?`,
            [...params, accountId]
        );

        await conn.commit();
        return { ok: true };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = {
    getInventory,
    getInventoryAccountDetail,
    exportInventoryCsv,
    patchInventory,
};
