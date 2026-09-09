const {
    BOGOTA_TIME_ZONE,
    formatDateOnlyBogota,
    parseDateTime,
    toSqlDateTime,
} = require("./date");

const YOUTUBE_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
]);

function isEventLinkPlan(plan) {
    const value = plan?.is_event_link ?? plan?.isEventLink ?? plan?.event_link;
    return value === true || value === 1 || String(value || "").trim() === "1";
}

function normalizeEventLinkUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;

    try {
        const url = new URL(raw);
        if (url.protocol !== "https:" || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) {
            return null;
        }
        return url.toString();
    } catch {
        return null;
    }
}

// datetime-local has no timezone. The admin enters this value in Colombia,
// therefore it is deliberately interpreted as America/Bogota before storage.
function parseBogotaDateTimeInput(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;

    const [, year, month, day, hour, minute, second = "0"] = match;
    const result = new Date(Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour) + 5,
        Number(minute),
        Number(second)
    ));

    // Validate the fields before the UTC conversion. A Colombia evening can
    // legitimately become the following UTC calendar day.
    const calendarCheck = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
        calendarCheck.getUTCFullYear() !== Number(year)
        || calendarCheck.getUTCMonth() !== Number(month) - 1
        || calendarCheck.getUTCDate() !== Number(day)
    ) {
        return null;
    }
    return result;
}

function formatBogotaDateTime(value) {
    const date = parseDateTime(value);
    if (!date) return "-";
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: BOGOTA_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);
    const map = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute} (Colombia)`;
}

function eventLinkSnapshot(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        title: row.title,
        url: row.url,
        endsAt: row.ends_at,
        expiresAt: formatDateOnlyBogota(row.ends_at),
        unitCost: Number(row.unit_cost || 0),
        currency: String(row.currency || "COP").toUpperCase(),
        endsAtSql: toSqlDateTime(row.ends_at),
    };
}

module.exports = {
    eventLinkSnapshot,
    formatBogotaDateTime,
    isEventLinkPlan,
    normalizeEventLinkUrl,
    parseBogotaDateTimeInput,
};
