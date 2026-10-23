const GEMINI_PROMO_LAST_DAY = "2026-10-26";
const DAY_MS = 24 * 60 * 60 * 1000;

function bogotaDateParts(date) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return {
        year: Number(values.year),
        month: Number(values.month),
        day: Number(values.day),
    };
}

export function isGemini5Tb(item) {
    const identity = `${item?.platformName || ""} ${item?.platformSlug || ""}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    return identity.includes("gemini") && (/5\s*tb/.test(identity) || identity.includes("almacenamiento"));
}

export function getGeminiPromoDaysRemaining(now = new Date()) {
    const end = bogotaDateParts(new Date(`${GEMINI_PROMO_LAST_DAY}T12:00:00-05:00`));
    const today = bogotaDateParts(now);
    const endDay = Date.UTC(end.year, end.month - 1, end.day);
    const todayDay = Date.UTC(today.year, today.month - 1, today.day);
    const days = Math.round((endDay - todayDay) / DAY_MS);
    return days < 0 ? null : days;
}

export function sortCatalogItems(catalog) {
    return [...catalog].sort((a, b) => {
        const aGemini = isGemini5Tb(a);
        const bGemini = isGemini5Tb(b);
        if (aGemini !== bGemini) return aGemini ? -1 : 1;

        const aStock = Number(a.stock || 0);
        const bStock = Number(b.stock || 0);
        const aHasStock = a.platformType === "correo" || aStock > 0;
        const bHasStock = b.platformType === "correo" || bStock > 0;
        if (aHasStock !== bHasStock) return aHasStock ? -1 : 1;

        const getCategoryPriority = (item) => {
            const category = String(item.categoryName || "").toLowerCase();
            if (category.includes("video")) return 1;
            if (category.includes("ia") || category.includes("inteligencia")) return 2;
            if (category.includes("productividad")) return 3;
            return 4;
        };
        const categoryDifference = getCategoryPriority(a) - getCategoryPriority(b);
        if (categoryDifference) return categoryDifference;
        return String(a.platformName || "").localeCompare(String(b.platformName || ""));
    });
}
