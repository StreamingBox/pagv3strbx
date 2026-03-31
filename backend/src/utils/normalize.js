function normalizeOptionalValue(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;
    const low = s.toLowerCase();
    if (low === "-" || low === "null" || low === "undefined" || low === "n/a") return null;
    return s;
}

function normalizeProfileForAccount(v) {
    const s = normalizeOptionalValue(v);
    if (s === null) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function normalizeProfileForIdentity(v) {
    const s = normalizeOptionalValue(v);
    if (s === null) return 1;
    const n = Number(s);
    return Number.isFinite(n) ? n : 1;
}

module.exports = {
    normalizeOptionalValue,
    normalizeProfileForAccount,
    normalizeProfileForIdentity,
};
