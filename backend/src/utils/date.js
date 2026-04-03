function parseDateOnly(value) {
    if (!value) return null;
    const s = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return s;
}

function toSqlDateStart(dateOnly) {
    if (!dateOnly) return null;
    return `${String(dateOnly).slice(0, 10)} 00:00:00`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BOGOTA_TIME_ZONE = "America/Bogota";
const BOGOTA_UTC_OFFSET_HOURS = 5;

function parseDateTime(value) {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    }

    let s = String(value).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return new Date(`${s}T00:00:00Z`);
    }
    if (s.includes(" ") && !s.includes("T")) s = s.replace(" ", "T");

    const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(s);
    const d = new Date(hasTimezone ? s : `${s}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
}

function toSqlDateTime(value) {
    const d = parseDateTime(value);
    if (!d) return null;
    return d.toISOString().slice(0, 19).replace("T", " ");
}

function addDaysExact(value, days) {
    const base = parseDateTime(value) || new Date();
    const safeDays = Number(days || 0);
    return new Date(base.getTime() + (safeDays * MS_PER_DAY));
}

function formatDateOnlyBogota(value) {
    if (typeof value === "string") {
        const s = value.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    }
    const d = parseDateTime(value);
    if (!d) return "-";

    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: BOGOTA_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(d);

    const map = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}`;
}

function bogotaDateOnlyToUtcEndOfDay(dateOnly) {
    const s = parseDateOnly(dateOnly);
    if (!s) return null;

    const [year, month, day] = s.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day, 23 + BOGOTA_UTC_OFFSET_HOURS, 59, 59));
}

function formatStoredDateOnly(value) {
    if (!value) return "-";
    if (typeof value === "string") {
        const s = value.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    }

    const d = value instanceof Date ? value : parseDateTime(value);
    if (!d || Number.isNaN(d.getTime())) return "-";
    return d.toISOString().slice(0, 10);
}

function currentBogotaDateOnly() {
    return formatDateOnlyBogota(new Date());
}

function isStoredDateOnlyExpired(value, now = new Date()) {
    const expiresAt = formatStoredDateOnly(value);
    if (expiresAt === "-") return true;
    const today = formatDateOnlyBogota(now);
    return expiresAt < today;
}

function daysRemainingStoredDateOnly(value, now = new Date()) {
    const expiresAt = formatStoredDateOnly(value);
    if (expiresAt === "-") return null;
    const today = formatDateOnlyBogota(now);
    const diff = Date.parse(`${expiresAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
    return Math.max(0, Math.ceil(diff / MS_PER_DAY));
}

function isDateTimeExpired(value, now = new Date()) {
    const d = parseDateTime(value);
    if (!d) return true;
    return d.getTime() < now.getTime();
}

module.exports = {
    addDaysExact,
    bogotaDateOnlyToUtcEndOfDay,
    currentBogotaDateOnly,
    daysRemainingStoredDateOnly,
    formatDateOnlyBogota,
    formatStoredDateOnly,
    isDateTimeExpired,
    isStoredDateOnlyExpired,
    parseDateOnly,
    parseDateTime,
    toSqlDateStart,
    toSqlDateTime,
};
