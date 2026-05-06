const USD_ALIASES = new Set(["USD", "USDT"]);

function normalizeCurrency(value, fallback = "") {
    const normalized = String(value || "").trim().toUpperCase();
    if (!normalized) return String(fallback || "").trim().toUpperCase();
    if (USD_ALIASES.has(normalized)) return "USD";
    return normalized;
}

function displayCurrency(value, fallback = "") {
    const normalized = normalizeCurrency(value, fallback);
    if (normalized === "USD") return "USDT";
    return normalized;
}

function sameCurrency(left, right) {
    return normalizeCurrency(left) === normalizeCurrency(right);
}

function currencyAliases(value, fallback = "") {
    const normalized = normalizeCurrency(value, fallback);
    if (normalized === "USD") return ["USD", "USDT"];
    return normalized ? [normalized] : [];
}

function allowedCurrencyValues() {
    return ["COP", "MXN", "USD", "USDT"];
}

module.exports = {
    normalizeCurrency,
    displayCurrency,
    sameCurrency,
    currencyAliases,
    allowedCurrencyValues,
};
