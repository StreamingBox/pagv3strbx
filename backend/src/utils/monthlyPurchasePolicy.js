const { currentBogotaDateOnly } = require("./date");

const DEFAULT_MINIMUM_COP = 30000;
const DEFAULT_POLICY_START_DATE = "2026-06-01";

function formatDateOnlyUtc(date) {
    return date.toISOString().slice(0, 10);
}

function getPreviousCompletedMonth(now = new Date()) {
    const today = currentBogotaDateOnly(now);
    const [year, month] = today.split("-").map(Number);
    const periodStartDate = new Date(Date.UTC(year, month - 2, 1));
    const periodEndDate = new Date(Date.UTC(year, month - 1, 1));

    return {
        periodStart: formatDateOnlyUtc(periodStartDate),
        periodEnd: formatDateOnlyUtc(periodEndDate),
    };
}

function getMinimumPurchaseCop(env = process.env) {
    const configured = Number(env.MONTHLY_MINIMUM_PURCHASE_COP || DEFAULT_MINIMUM_COP);
    return Number.isFinite(configured) && configured > 0
        ? configured
        : DEFAULT_MINIMUM_COP;
}

function getPolicyStartDate(env = process.env) {
    const configured = String(env.MONTHLY_MINIMUM_START_DATE || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(configured)
        ? configured
        : DEFAULT_POLICY_START_DATE;
}

function isPolicyPeriodEnabled(periodStart, env = process.env) {
    return String(periodStart || "") >= getPolicyStartDate(env);
}

module.exports = {
    DEFAULT_MINIMUM_COP,
    DEFAULT_POLICY_START_DATE,
    getMinimumPurchaseCop,
    getPolicyStartDate,
    getPreviousCompletedMonth,
    isPolicyPeriodEnabled,
};
