const pool = require("../db");

const PROMO_TIME_ZONE = "America/Bogota";
const PROMO_CURRENCY = "COP";
const PROMO_MINIMUM = 50000;
const PROMO_PERCENT = 10;
const SETTINGS_KEY = "recharge_bonus_promotion_json";

const DEFAULT_SETTINGS = Object.freeze({
    saturdayEnabled: true,
    manualStartsAt: null,
    manualEndsAt: null,
});

function validIso(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeSettings(value) {
    let parsed = value;
    if (typeof value === "string") {
        try {
            parsed = JSON.parse(value);
        } catch {
            parsed = {};
        }
    }
    const input = parsed && typeof parsed === "object" ? parsed : {};
    return {
        saturdayEnabled: input.saturdayEnabled !== false,
        manualStartsAt: validIso(input.manualStartsAt),
        manualEndsAt: validIso(input.manualEndsAt),
    };
}

function getBogotaParts(value) {
    const date = value instanceof Date ? value : new Date(value);
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: PROMO_TIME_ZONE,
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
    return {
        weekday: values.weekday,
        year: Number(values.year),
        month: Number(values.month),
        day: Number(values.day),
        hour: Number(values.hour),
        minute: Number(values.minute),
        second: Number(values.second),
    };
}

function localPartsToUtc(parts) {
    const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0, parts.second || 0);
    let candidate = target;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const actual = getBogotaParts(new Date(candidate));
        const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
        const delta = target - represented;
        candidate += delta;
        if (delta === 0) break;
    }
    return new Date(candidate);
}

function addLocalDays(parts, days) {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function getBogotaDayBounds(value) {
    const parts = getBogotaParts(value);
    const nextDay = addLocalDays(parts, 1);
    return {
        start: localPartsToUtc({ ...parts, hour: 0, minute: 0, second: 0 }),
        end: localPartsToUtc({ ...nextDay, hour: 0, minute: 0, second: 0 }),
    };
}

function createManualActivation(value = new Date()) {
    const now = value instanceof Date ? value : new Date(value);
    const { end } = getBogotaDayBounds(now);
    return {
        manualStartsAt: now.toISOString(),
        manualEndsAt: end.toISOString(),
    };
}

function getPromotionStatus(value = new Date(), settings = DEFAULT_SETTINGS) {
    const now = value instanceof Date ? value : new Date(value);
    const normalized = normalizeSettings(settings);
    const manualStart = normalized.manualStartsAt ? new Date(normalized.manualStartsAt) : null;
    const manualEnd = normalized.manualEndsAt ? new Date(normalized.manualEndsAt) : null;
    const manuallyActive = Boolean(manualStart && manualEnd && now >= manualStart && now < manualEnd);
    const isSaturday = getBogotaParts(now).weekday === "Sat";
    const saturdayActive = normalized.saturdayEnabled && isSaturday;
    const active = saturdayActive || manuallyActive;
    const dayBounds = getBogotaDayBounds(now);

    return {
        active,
        activeBy: saturdayActive ? "saturday" : manuallyActive ? "manual" : null,
        activeUntil: saturdayActive
            ? dayBounds.end.toISOString()
            : manuallyActive
                ? manualEnd.toISOString()
                : null,
        saturdayEnabled: normalized.saturdayEnabled,
        manuallyActive,
        manualEndsAt: normalized.manualEndsAt,
        timeZone: PROMO_TIME_ZONE,
        minimumAmount: PROMO_MINIMUM,
        percent: PROMO_PERCENT,
        currency: PROMO_CURRENCY,
    };
}

function getRechargeBonusSnapshot({ amount, currency, createdAt = new Date(), settings = DEFAULT_SETTINGS }) {
    const numericAmount = Number(amount);
    const normalizedCurrency = String(currency || "").trim().toUpperCase();
    const status = getPromotionStatus(createdAt, settings);
    const eligible = status.active
        && normalizedCurrency === PROMO_CURRENCY
        && Number.isFinite(numericAmount)
        && numericAmount >= PROMO_MINIMUM;
    return {
        bonusAmount: eligible ? Math.round(numericAmount * PROMO_PERCENT / 100) : 0,
        bonusPercent: eligible ? PROMO_PERCENT : 0,
        bonusCampaign: eligible ? status.activeBy : null,
    };
}

async function getRechargeBonusSettings(db = pool) {
    const [rows] = await db.query(
        "SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1",
        [SETTINGS_KEY]
    );
    return normalizeSettings(rows[0]?.setting_value);
}

async function saveRechargeBonusSettings(settings, db = pool) {
    const normalized = normalizeSettings(settings);
    await db.query(
        `INSERT INTO app_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [SETTINGS_KEY, JSON.stringify(normalized)]
    );
    return normalized;
}

module.exports = {
    DEFAULT_SETTINGS,
    PROMO_CURRENCY,
    PROMO_MINIMUM,
    PROMO_PERCENT,
    PROMO_TIME_ZONE,
    createManualActivation,
    getBogotaDayBounds,
    getPromotionStatus,
    getRechargeBonusSettings,
    getRechargeBonusSnapshot,
    normalizeSettings,
    saveRechargeBonusSettings,
};
