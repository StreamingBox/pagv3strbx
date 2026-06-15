const GEMINI_5TB_COST_COP = 7000;

function normalizeProductName(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function isEmailDeliveryPlan(plan) {
    const type = plan?.type ?? plan?.platform_type;
    return String(type || "").trim().toLowerCase() === "correo";
}

function planCurrency(plan) {
    return String(plan?.currency || "COP").trim().toUpperCase();
}

function normalizedPlanText(plan) {
    return normalizeProductName(`${plan?.platform_name || ""} ${plan?.platform_slug || ""}`);
}

function isNotionEmailPlan(plan) {
    return isEmailDeliveryPlan(plan) && normalizedPlanText(plan).includes("notion");
}

function isGemini5TbPlan(plan) {
    const normalized = normalizedPlanText(plan);
    return isEmailDeliveryPlan(plan)
        && planCurrency(plan) === "COP"
        && normalized.includes("gemini")
        && (normalized.includes("5 tb") || normalized.includes("almacenamiento"));
}

function automaticUnitCostForPlan(plan) {
    if (isGemini5TbPlan(plan)) return GEMINI_5TB_COST_COP;
    return 0;
}

function automaticProfitForEntry({ plan, salePrice, unitCost }) {
    if (!isNotionEmailPlan(plan) && !isGemini5TbPlan(plan)) return 0;

    const cost = Number(unitCost || automaticUnitCostForPlan(plan) || 0);
    return Number((Number(salePrice || 0) - cost).toFixed(2));
}

module.exports = {
    GEMINI_5TB_COST_COP,
    automaticProfitForEntry,
    automaticUnitCostForPlan,
    isGemini5TbPlan,
    isNotionEmailPlan,
    normalizeProductName,
};
