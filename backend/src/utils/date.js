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

module.exports = { parseDateOnly, toSqlDateStart };
