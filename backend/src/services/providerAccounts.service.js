const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(value) {
    const date = String(value || "").trim();
    if (!DATE_ONLY_RE.test(date)) return null;

    const [year, month, day] = date.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
        parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day
    ) {
        return null;
    }

    return parsed;
}

function isDateOnly(value) {
    return Boolean(parseDateOnly(value));
}

function addCalendarDays(value, days = 30) {
    const parsed = parseDateOnly(value);
    if (!parsed || !Number.isInteger(days)) return null;

    parsed.setUTCDate(parsed.getUTCDate() + days);
    return parsed.toISOString().slice(0, 10);
}

function normalizeCurrency(value) {
    const currency = String(value || "").trim().toUpperCase();
    return ["COP", "USD"].includes(currency) ? currency : null;
}

module.exports = {
    addCalendarDays,
    isDateOnly,
    normalizeCurrency,
};
