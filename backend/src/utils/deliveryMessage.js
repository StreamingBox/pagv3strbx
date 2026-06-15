const { formatDateOnlyBogota } = require("./date");

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

function normalizeProductName(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function isAssistedActivationProduct(platformName) {
    const normalized = normalizeProductName(platformName);
    return (
        (normalized.includes("canva") && normalized.includes("correo")) ||
        normalized.includes("notion") ||
        normalized.includes("gemini")
    );
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

function buildDeliveryMessage({ orderCode, results, baseUrl }) {
    const safeResults = Array.isArray(results) ? results : [];
    const hasDeviceUsageRuleItems = safeResults.some((result) => {
        const plan = result?.plan || {};
        return !isEmailDelivery(plan) && shouldShowDeviceUsageRule(plan);
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
    buildDeliveryMessage,
    isAssistedActivationProduct,
    salesContactPhone,
};
