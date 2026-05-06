export function displayCurrency(value, fallback = "") {
    const normalized = String(value || fallback || "").trim().toUpperCase();
    if (normalized === "USD") return "USDT";
    return normalized || String(value || fallback || "").trim();
}

