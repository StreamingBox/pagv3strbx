const { formatDateOnlyBogota } = require("./date");

function buildCredentialUrl(baseUrl, token) {
    const cleanBaseUrl = String(baseUrl || "").replace(/\/+$/, "");
    return token ? `${cleanBaseUrl}/s/${token}` : "";
}

function buildReplacementCredentialsMessage({
    subscriptionId,
    platformName,
    account,
    expiresAt,
    token,
    baseUrl,
}) {
    const safeAccount = account || {};
    const lines = [
        "Nuevas credenciales de tu cuenta:",
        `ID: ${subscriptionId || "-"} | ${platformName || "Cuenta reemplazada"}`,
    ];

    if (safeAccount.email) lines.push(`Correo: ${safeAccount.email}`);
    if (safeAccount.password) lines.push(`Contraseña: ${safeAccount.password}`);
    if (safeAccount.profile_number !== null && safeAccount.profile_number !== undefined && String(safeAccount.profile_number).trim() !== "") {
        lines.push(`Perfil: ${safeAccount.profile_number}`);
    }
    if (safeAccount.pin !== null && safeAccount.pin !== undefined && String(safeAccount.pin).trim() !== "") {
        lines.push(`Pin: ${safeAccount.pin}`);
    }
    if (expiresAt) lines.push(`Expira: ${formatDateOnlyBogota(expiresAt)}`);

    const credentialUrl = buildCredentialUrl(baseUrl, token);
    if (credentialUrl) lines.push(`Enlace de credenciales: ${credentialUrl}`);

    return lines.join("\n");
}

function appendReplacementCredentialsMessage(resolutionMessage, replacementMessage) {
    const base = String(resolutionMessage || "").trim();
    const credentials = String(replacementMessage || "").trim();
    if (!base) return credentials;
    if (!credentials) return base;
    return `${base}\n\n${credentials}`;
}

module.exports = {
    appendReplacementCredentialsMessage,
    buildReplacementCredentialsMessage,
};
