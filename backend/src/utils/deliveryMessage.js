const { formatDateOnlyBogota } = require("./date");
const {
    isChatGPTPersonalProduct,
    isIptvProduct,
    normalizeProductName,
} = require("./productDeliveryProfile");

function credentialUrl(baseUrl, token) {
    const cleanBaseUrl = String(baseUrl || "").replace(/\/+$/, "");
    return `${cleanBaseUrl}/s/${token}`;
}

function isEmailDelivery(plan) {
    return String(plan?.type || "").trim().toLowerCase() === "correo";
}

function shouldShowDeviceUsageRule(plan) {
    const value = plan?.show_device_rule ?? plan?.showDeviceRule;
    if (value === undefined || value === null || value === "") return true;
    if (value === false) return false;
    const normalized = String(value).trim().toLowerCase();
    return normalized !== "0" && normalized !== "false";
}

function isAssistedActivationProduct(platformName) {
    const normalized = normalizeProductName(platformName);
    return (
        (normalized.includes("canva") && normalized.includes("correo")) ||
        normalized.includes("notion") ||
        normalized.includes("gemini")
    );
}

function buildChatGPTPersonalCredentialsMessage(account = {}) {
    const twoFactor = account.two_factor_secret
        ?? account.twoFactorSecret
        ?? account.two_factor
        ?? account.twoFactor
        ?? account["2FA"];
    const lines = [
        "Correo: " + (account.email || "-"),
        "Contraseña: " + (account.password || "-"),
    ];
    if (String(twoFactor || "").trim()) {
        lines.push("2FA: " + String(twoFactor).trim());
        lines.push("Consulta 2FA: https://2fa.live/");
    }
    return lines.join("\n");
}

function buildIptvCredentialsMessage(account = {}) {
    const username = account.username
        ?? account.user
        ?? account.email;
    const accessUrl = account.access_url
        ?? account.accessUrl
        ?? account.url;
    return [
        "Usuario: " + (username || "-"),
        "ContraseÃ±a: " + (account.password || "-"),
        "URL: " + (accessUrl || "-"),
    ].join("\n");
}

function activationServiceName(platformName) {
    const cleanName = String(platformName || "")
        .replace(/\s+a\s+correo\s*$/i, "")
        .trim();
    const withoutDuration = cleanName
        .replace(/\b(mensual|anual|semanal|trimestral|semestral|bimestral|\d+\s*(dias|días|meses?|años?|anos?))\b/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();

    return withoutDuration || cleanName || "el producto";
}

function salesContactPhone() {
    return String(process.env.SALES_CONTACT_PHONE || "3152485340").trim();
}

function buildAccountDeliveryMessage({
    intro = "",
    orderCode,
    itemCount = 1,
    subscriptionId,
    platformName,
    account,
    expiresAt,
    token,
    baseUrl,
    platformSlug,
}) {
    const safeAccount = account || {};
    const lines = [];
    const url = token ? credentialUrl(baseUrl, token) : "";

    if (String(intro || "").trim()) {
        lines.push(String(intro).trim());
        lines.push("");
    }

    lines.push(`🧾 Orden: ${orderCode || "-"}`);
    lines.push(`📦 Pedido múltiple (${Number(itemCount) || 1} items)`);
    lines.push("");
    lines.push(`🆔 ID: ${subscriptionId || "-"} | 🖥️ ${platformName || "Producto"}`);

    if (isChatGPTPersonalProduct({ platformName, platformSlug }) || isIptvProduct({ platformName, platformSlug })) {
        lines.push(
            isIptvProduct({ platformName, platformSlug })
                ? buildIptvCredentialsMessage(safeAccount)
                : buildChatGPTPersonalCredentialsMessage(safeAccount)
        );
        return lines.join("\n").trim();
    }

    if (safeAccount.email) {
        lines.push(`📧 Correo: ${safeAccount.email}`);
    }

    if (safeAccount.password) {
        lines.push(`🔑 Contraseña: ${safeAccount.password}`);
    }

    const profile = safeAccount.profile_number;
    if (profile !== null && profile !== undefined && String(profile).trim() !== "") {
        lines.push(`👤 Perfil: ${profile}`);
    }

    const pin = safeAccount.pin;
    if (pin !== null && pin !== undefined && String(pin).trim() !== "") {
        lines.push(`🔢 Pin: ${pin}`);
    }

    if (expiresAt) {
        lines.push(`📅 Expira: ${formatDateOnlyBogota(expiresAt)}`);
    }

    if (url) {
        lines.push("");
        lines.push(`🔗⚠️ Debido a que en ocasiones se bloquea o cambia la clave, en este enlace ${url} puedes consultar la contraseña hasta tu último día contratado. 💻🔑:`);
    }

    return lines.join("\n").trim();
}

function buildDeliveryMessage({ orderCode, results, baseUrl }) {
    const safeResults = Array.isArray(results) ? results : [];
    const isChatGPTPersonalResult = (result) => {
        const plan = result?.plan || {};
        return isChatGPTPersonalProduct({
            platformName: result?.purchasedPlatformName || result?.platformName || plan.platform_name,
            platformSlug: result?.purchasedPlatformSlug || result?.platformSlug || plan.platform_slug,
        });
    };
    const isIptvResult = (result) => {
        const plan = result?.plan || {};
        return isIptvProduct({
            platformName: result?.purchasedPlatformName || result?.platformName || plan.platform_name,
            platformSlug: result?.purchasedPlatformSlug || result?.platformSlug || plan.platform_slug,
        });
    };

    const hasDeviceUsageRuleItems = safeResults.some((result) => {
        const plan = result?.plan || {};
        return !isChatGPTPersonalResult(result)
            && !isIptvResult(result)
            && !isEmailDelivery(plan)
            && shouldShowDeviceUsageRule(plan);
    });
    const lines = [];

    lines.push(`🧾 Orden: ${orderCode || "-"}`);
    lines.push(`📦 Pedido múltiple (${safeResults.length} items)`);
    lines.push("");

    for (const result of safeResults) {
        const plan = result?.plan || {};
        const account = result?.account || {};
        const url = credentialUrl(baseUrl, result?.token || "");
        const platformName = result?.purchasedPlatformName || result?.platformName || plan.platform_name || "Producto";

        if (isChatGPTPersonalResult(result) || isIptvResult(result)) {
            lines.push(`\u{1F194} ID: ${result?.subscriptionId || "-"} | \u{1F5A5}\uFE0F ${platformName}`);
            lines.push(
                isIptvResult(result)
                    ? buildIptvCredentialsMessage(account)
                    : buildChatGPTPersonalCredentialsMessage(account)
            );
            lines.push("");
            continue;
        }

        if (isEmailDelivery(plan) && isAssistedActivationProduct(platformName)) {
            const activationService = activationServiceName(platformName);
            lines.push(`🖥️ ${platformName}`);
            lines.push(`📌 Nota de activación: comunícate al WhatsApp ${salesContactPhone()} para que te ayuden con la activación.`);
            lines.push("");
            lines.push(`Hola, necesito ayuda para activar ${activationService}. Orden: ${orderCode || "-"}. Producto: ${platformName}.`);
            lines.push("");
            continue;
        }

        if (isEmailDelivery(plan)) {
            lines.push(`🖥️ ${platformName}`);
            lines.push(`📅 Expira: ${formatDateOnlyBogota(result?.expiresAt)}`);
            lines.push(`🔗 Enlace de credenciales: ${url}`);
            lines.push("");
            continue;
        }

        lines.push(`🆔 ID: ${result?.subscriptionId || "-"} | 🖥️ ${platformName}`);

        if (account.email) {
            lines.push(`📧 Correo: ${account.email}`);
        }

        if (account.password) {
            lines.push(`🔑 Contraseña: ${account.password}`);
        }

        const profile = account.profile_number;
        if (profile !== null && profile !== undefined && String(profile).trim() !== "") {
            lines.push(`👤 Perfil: ${profile}`);
        }

        const pin = account.pin;
        if (pin !== null && pin !== undefined && String(pin).trim() !== "") {
            lines.push(`🔢 Pin: ${pin}`);
        }

        lines.push(`📅 Expira: ${formatDateOnlyBogota(result?.expiresAt)}`);
        lines.push(`🔗⚠️ Debido a que en ocasiones se bloquea o cambia la clave, en este enlace ${url} puedes consultar la contraseña hasta tu último día contratado. 💻🔑:`);
        lines.push("");
    }

    if (hasDeviceUsageRuleItems) {
        lines.push("📌 Regla de uso: 1 pantalla = 1 dispositivo.");
        lines.push("La cuenta debe usarse únicamente en un solo equipo. No está permitido alternarla entre TV, celular u otros dispositivos, ni compartir el acceso. Si se detecta incumplimiento de esta regla, se procederá con la expulsión de la cuenta y se perderá la garantía del servicio.");
    }

    return lines.join("\n").trim();
}

module.exports = {
    activationServiceName,
    buildAccountDeliveryMessage,
    buildChatGPTPersonalCredentialsMessage,
    buildDeliveryMessage,
    buildIptvCredentialsMessage,
    isAssistedActivationProduct,
    isChatGPTPersonalProduct,
    isIptvProduct,
    salesContactPhone,
};
