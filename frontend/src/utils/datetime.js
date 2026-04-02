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

export { formatBogotaDate, parseApiDate };
