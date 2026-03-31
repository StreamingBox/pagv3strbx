function escapeCsv(value) {
    if (value === null || value === undefined) return "";
    const s = String(value);
    const needsQuotes = s.includes(",") || s.includes("\n") || s.includes('"');
    const escaped = s.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
}

module.exports = { escapeCsv };
