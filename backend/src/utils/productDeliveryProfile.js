function normalizeProductName(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function compactProductName({ platformName, platformSlug } = {}) {
    return normalizeProductName(`${platformSlug || ""} ${platformName || ""}`)
        .replace(/\s+/g, "");
}

function isChatGPTPersonalProduct(product = {}) {
    const compact = compactProductName(product);
    return compact.includes("chatgpt")
        && compact.includes("personal")
        && !compact.includes("business");
}

function isIptvProduct(product = {}) {
    return compactProductName(product).includes("iptv");
}

function isDisneyCodeTvProduct(product = {}) {
    const compact = compactProductName(product);
    return compact.includes("disneypremium")
        && compact.includes("solotv")
        && compact.includes("codigo");
}

function isMicrosoftOfficeProduct(product = {}) {
    const compact = compactProductName(product);
    return compact.includes("microsoft") && compact.includes("office");
}

module.exports = {
    isChatGPTPersonalProduct,
    isDisneyCodeTvProduct,
    isIptvProduct,
    isMicrosoftOfficeProduct,
    normalizeProductName,
};
