const pool = require("../db");
const logger = require("../utils/logger");
const {
    getMinimumPurchaseCop,
    getPolicyStartDate,
    getPreviousCompletedMonth,
    isPolicyPeriodEnabled,
} = require("../utils/monthlyPurchasePolicy");
const { notifyMonthlyPurchaseEnforcement } = require("./telegramBot");

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
let evaluationRunning = false;

async function getEligibleCopResellers(periodStart, periodEnd) {
    const periodStartAt = `${periodStart} 00:00:00`;
    const periodEndAt = `${periodEnd} 00:00:00`;
    const [rows] = await pool.query(`
        SELECT
            u.id,
            u.name,
            u.email,
            COALESCE(SUM(o.total), 0) AS purchase_total
        FROM users u
        LEFT JOIN orders o
          ON o.user_id = u.id
         AND UPPER(COALESCE(o.currency, 'COP')) = 'COP'
         AND DATE_SUB(o.created_at, INTERVAL 5 HOUR) >= ?
         AND DATE_SUB(o.created_at, INTERVAL 5 HOUR) < ?
        WHERE u.role = 'user'
          AND u.status = 'active'
          AND UPPER(COALESCE(u.currency, 'COP')) = 'COP'
          AND COALESCE(u.account_type, 'reseller') = 'reseller'
          AND DATE_SUB(u.created_at, INTERVAL 5 HOUR) < ?
        GROUP BY u.id, u.name, u.email
        ORDER BY u.id ASC
    `, [periodStartAt, periodEndAt, periodStartAt]);

    return rows;
}

async function disableUserForMonthlyMinimum(user, period, requiredTotal) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[lockedUser]] = await conn.query(`
            SELECT id, status, currency, role, account_type
            FROM users
            WHERE id = ?
            LIMIT 1
            FOR UPDATE
        `, [user.id]);

        if (
            !lockedUser
            || lockedUser.status !== "active"
            || lockedUser.role !== "user"
            || String(lockedUser.currency || "COP").toUpperCase() !== "COP"
            || String(lockedUser.account_type || "reseller") !== "reseller"
        ) {
            await conn.rollback();
            return false;
        }

        const [[existing]] = await conn.query(`
            SELECT id
            FROM monthly_purchase_enforcements
            WHERE user_id = ? AND period_start = ?
            LIMIT 1
        `, [user.id, period.periodStart]);
        if (existing) {
            await conn.rollback();
            return false;
        }

        await conn.query(`
            INSERT INTO monthly_purchase_enforcements
                (user_id, period_start, period_end, currency, purchase_total,
                 required_total, previous_status, resulting_status)
            VALUES (?, ?, ?, 'COP', ?, ?, 'active', 'inactive')
        `, [
            user.id,
            period.periodStart,
            period.periodEnd,
            Number(user.purchase_total || 0),
            requiredTotal,
        ]);
        await conn.query(
            "UPDATE users SET status = 'inactive' WHERE id = ? AND status = 'active'",
            [user.id]
        );
        await conn.query(
            "UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL",
            [user.id]
        );
        await conn.commit();
        return true;
    } catch (error) {
        try { await conn.rollback(); } catch { }
        throw error;
    } finally {
        conn.release();
    }
}

async function evaluateMonthlyPurchaseMinimum(now = new Date()) {
    if (evaluationRunning) return { skipped: true, reason: "already_running" };
    evaluationRunning = true;

    try {
        const period = getPreviousCompletedMonth(now);
        if (!isPolicyPeriodEnabled(period.periodStart)) {
            return {
                skipped: true,
                reason: "before_policy_start",
                ...period,
                policyStart: getPolicyStartDate(),
            };
        }

        const requiredTotal = getMinimumPurchaseCop();
        const users = await getEligibleCopResellers(period.periodStart, period.periodEnd);
        const belowMinimum = users.filter(user => Number(user.purchase_total || 0) < requiredTotal);
        const disabled = [];

        for (const user of belowMinimum) {
            if (await disableUserForMonthlyMinimum(user, period, requiredTotal)) {
                disabled.push({
                    id: Number(user.id),
                    name: user.name || "",
                    email: user.email || "",
                    purchaseTotal: Number(user.purchase_total || 0),
                });
            }
        }

        if (disabled.length) {
            await notifyMonthlyPurchaseEnforcement({
                ...period,
                requiredTotal,
                users: disabled,
            });
        }

        logger.info("monthly_purchase_minimum_evaluated", {
            ...period,
            currency: "COP",
            requiredTotal,
            eligibleUsers: users.length,
            belowMinimum: belowMinimum.length,
            disabledUsers: disabled.length,
        });

        return {
            ...period,
            requiredTotal,
            eligibleUsers: users.length,
            belowMinimum: belowMinimum.length,
            disabled,
        };
    } finally {
        evaluationRunning = false;
    }
}

function startMonthlyPurchaseEnforcement() {
    const intervalMs = Math.max(
        15 * 60 * 1000,
        Number(process.env.MONTHLY_MINIMUM_CHECK_INTERVAL_MS || DEFAULT_INTERVAL_MS)
    );

    const run = () => evaluateMonthlyPurchaseMinimum().catch(error => {
        logger.error("monthly_purchase_minimum_failed", { error });
    });

    const initialCheck = setTimeout(run, 15 * 1000);
    initialCheck.unref();
    setInterval(run, intervalMs).unref();
    logger.info("monthly_purchase_minimum_monitor_started", {
        intervalMs,
        currency: "COP",
        requiredTotal: getMinimumPurchaseCop(),
        policyStart: getPolicyStartDate(),
    });
}

module.exports = {
    evaluateMonthlyPurchaseMinimum,
    getEligibleCopResellers,
    startMonthlyPurchaseEnforcement,
};
