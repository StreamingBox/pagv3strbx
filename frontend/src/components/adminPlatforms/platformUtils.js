export function slugify(text) {
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Mismo algoritmo que usa el backend para nombrar el archivo del logo
// ts = timestamp opcional para cache-busting
export const logoSrc = (slug, ts) => {
    const safe = slugify(slug);
    return ts ? `/platform-logos/${safe}.png?t=${ts}` : `/platform-logos/${safe}.png`;
};

export const inputStyle = {
    appearance: "none", height: 42, padding: "0 14px",
    background: "var(--bg0)", color: "var(--text)",
    border: "1px solid var(--stroke)", borderRadius: 10,
    fontSize: 14, fontWeight: 500, outline: "none", width: "100%",
    fontFamily: "var(--font)", transition: "border-color 0.2s",
};

export const selStyle = { ...inputStyle, cursor: "pointer", paddingRight: 30 };
export const DEFAULT_PROMO_COLOR = "#22D3EE";

export function normalizePromoColor(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!match) return DEFAULT_PROMO_COLOR;
    const hex = match[1];
    return `#${hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex}`.toUpperCase();
}

export function deviceRuleEnabled(value) {
    if (value === undefined || value === null || value === "") return true;
    if (value === false) return false;
    return String(value).trim().toLowerCase() !== "0" && String(value).trim().toLowerCase() !== "false";
}
