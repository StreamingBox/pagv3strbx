function buildRenewalSubscriptionSearch(query) {
    const term = String(query ?? "").trim();
    if (!term) return null;

    if (!/^\d+$/.test(term)) {
        return { sql: "1 = 0", params: [] };
    }

    return {
        sql: "s.id = ?",
        params: [term],
    };
}

module.exports = { buildRenewalSubscriptionSearch };
