function parseApiDate(value) {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    let s = String(value).trim();
    if (!s || s === "0000-00-00 00:00:00" || s === "0000-00-00") return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00Z`);
    if (s.includes(" ") && !s.includes("T")) s = s.replace(" ", "T");

    const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(s);
    const d = new Date(hasTimezone ? s : `${s}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
}

function formatBogotaDate(value) {
    if (typeof value === "string") {
        const s = value.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    }
    const d = parseApiDate(value);
    if (!d) return "—";

    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(d);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function currentBogotaDateOnly(now = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);
}

function normalizeDateOnly(value) {
    if (!value) return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        return value.trim();
    }
    const formatted = formatBogotaDate(value);
    return formatted === "—" ? "" : formatted;
}

function daysUntilDateOnly(value, now = new Date()) {
    const dateOnly = normalizeDateOnly(value);
    if (!dateOnly) return null;
    const today = currentBogotaDateOnly(now);
    const diff = Date.parse(`${dateOnly}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
    return Math.round(diff / MS_PER_DAY);
}

function formatDateOnlyDisplay(value, options = {}) {
    const dateOnly = normalizeDateOnly(value);
    if (!dateOnly) return "—";
    return new Intl.DateTimeFormat("es-CO", {
        timeZone: "UTC",
        day: options.day || "numeric",
        month: options.month || "short",
        year: options.year || "numeric",
    }).format(new Date(`${dateOnly}T00:00:00Z`));
}

export { currentBogotaDateOnly, daysUntilDateOnly, formatBogotaDate, formatDateOnlyDisplay, normalizeDateOnly, parseApiDate };
