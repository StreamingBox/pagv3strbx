function parsePositiveNumber(value) {
    if (value === undefined || value === null || value === "") return null;
    const raw = String(value).trim().replace(/\s/g, "");
    let normalized = raw;
    if (raw.includes(",")) {
        normalized = raw.replace(/\./g, "").replace(",", ".");
    } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
        normalized = raw.replace(/\./g, "");
    }
    const n = Number(normalized);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

function parsePositiveInt(value) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number.parseInt(String(value), 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

function normalizeCostMode(value) {
    const mode = String(value || "").trim().toLowerCase();
    if (["screen", "pantalla", "perfil", "unit", "unitario"].includes(mode)) return "screen";
    if (["account", "cuenta", "completa", "madre"].includes(mode)) return "account";
    return "";
}

function firstNonBlank(...values) {
    return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function resolveCostModel({
    costMode,
    costAmount,
    unitCost,
    screenCost,
    motherCostTotal,
    motherProfilesTotal,
}) {
    const mode = normalizeCostMode(costMode);
    const directCost = parsePositiveNumber(
        firstNonBlank(unitCost, screenCost, mode === "screen" ? costAmount : null)
    );

    if (directCost) {
        return {
            parentCostTotal: null,
            parentProfilesTotal: null,
            unitCost: Number(directCost.toFixed(2)),
        };
    }

    const total = parsePositiveNumber(
        firstNonBlank(motherCostTotal, mode === "account" ? costAmount : null)
    );
    const profiles = parsePositiveInt(motherProfilesTotal);
    if (!total || !profiles) {
        return { parentCostTotal: null, parentProfilesTotal: null, unitCost: null };
    }

    return {
        parentCostTotal: Number(total.toFixed(2)),
        parentProfilesTotal: profiles,
        unitCost: Number((total / profiles).toFixed(2)),
    };
}

function hasCostValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== "";
}

function validateCostModelInput(input = {}, costModel = resolveCostModel(input)) {
    const hasAmount = [
        input.costAmount,
        input.unitCost,
        input.screenCost,
        input.motherCostTotal,
    ].some(hasCostValue);
    const hasProfiles = hasCostValue(input.motherProfilesTotal);

    if (!hasAmount && !hasProfiles) return costModel;
    if (costModel.unitCost) return costModel;

    const err = new Error(
        normalizeCostMode(input.costMode) === "account" && !hasProfiles
            ? "Indica cuantas pantallas vendibles tiene la cuenta completa."
            : "El costo indicado no es valido."
    );
    err.status = 400;
    throw err;
}

module.exports = {
    resolveCostModel,
    validateCostModelInput,
};
