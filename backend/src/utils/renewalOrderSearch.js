function escapeLikePrefix(value) {
    return `${value.replace(/[!%_]/g, "!$&")}%`;
}

function buildRenewalOrderSearch(query) {
    const term = String(query ?? "").trim().toUpperCase();
    if (!term) return null;

    const prefix = escapeLikePrefix(term);
    if (term.startsWith("ORD")) {
        return {
            sql: "o.order_code LIKE ? ESCAPE '!'",
            params: [prefix],
        };
    }

    if (/^\d+$/.test(term)) {
        const orderId = Number(term);
        if (Number.isSafeInteger(orderId)) {
            return {
                sql: "(o.id = ? OR o.order_code_suffix LIKE ? ESCAPE '!')",
                params: [orderId, prefix],
            };
        }
    }

    return {
        sql: "o.order_code_suffix LIKE ? ESCAPE '!'",
        params: [prefix],
    };
}

module.exports = { buildRenewalOrderSearch };
