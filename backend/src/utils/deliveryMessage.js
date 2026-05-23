const { formatDateOnlyBogota } = require("./date");

function credentialUrl(baseUrl, token) {
    const cleanBaseUrl = String(baseUrl || "").replace(/\/+$/, "");
    return `${cleanBaseUrl}/s/${token}`;
}

function buildDeliveryMessage({ orderCode, results, baseUrl }) {
    const safeResults = Array.isArray(results) ? results : [];
    const lines = [];

    lines.push(`🧾 Orden: ${orderCode || "-"}`);
    lines.push(`📦 Pedido múltiple (${safeResults.length} items)`);
    lines.push("");

    for (const result of safeResults) {
        const plan = result?.plan || {};
        const account = result?.account || {};
        const url = credentialUrl(baseUrl, result?.token || "");
        const platformName = result?.purchasedPlatformName || result?.platformName || plan.platform_name || "Producto";

        if (plan.type === "correo") {
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

    if (safeResults.length) {
        lines.push("📌 Regla de uso: 1 pantalla = 1 dispositivo.");
        lines.push("La cuenta debe usarse únicamente en un solo equipo. No está permitido alternarla entre TV, celular u otros dispositivos, ni compartir el acceso. Si se detecta incumplimiento de esta regla, se procederá con la expulsión de la cuenta y se perderá la garantía del servicio.");
    }

    return lines.join("\n").trim();
}

module.exports = { buildDeliveryMessage };
