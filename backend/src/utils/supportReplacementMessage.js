const { buildAccountDeliveryMessage } = require("./deliveryMessage");

function buildCredentialUrl(baseUrl, token) {
    const cleanBaseUrl = String(baseUrl || "").replace(/\/+$/, "");
    return token ? `${cleanBaseUrl}/s/${token}` : "";
}

function buildReplacementCredentialsMessage({
    orderCode,
    subscriptionId,
    platformName,
    account,
    expiresAt,
    token,
    baseUrl,
}) {
    return buildAccountDeliveryMessage({
        intro: "Tu cuenta ha sido reemplazada por:",
        orderCode,
        itemCount: 1,
        subscriptionId,
        platformName: platformName || "Cuenta reemplazada",
        account,
        expiresAt,
        token,
        baseUrl,
    });
}

function appendReplacementCredentialsMessage(resolutionMessage, replacementMessage) {
    const base = String(resolutionMessage || "").trim();
    const credentials = String(replacementMessage || "").trim();
    const normalizedBase = base
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    if (!base) return credentials;
    if (!credentials) return base;
    if (
        normalizedBase === "tu cuenta ha sido reemplazada por:" ||
        normalizedBase.startsWith("nuevas credenciales de tu cuenta:") ||
        normalizedBase.startsWith("reemplazamos tu cuenta.")
    ) {
        return credentials;
    }

    return `${base}\n\n${credentials}`;
}

module.exports = {
    appendReplacementCredentialsMessage,
    buildCredentialUrl,
    buildReplacementCredentialsMessage,
};
