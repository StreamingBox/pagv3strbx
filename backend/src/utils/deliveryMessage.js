const { formatDateOnlyBogota } = require("./date");
const {
    isChatGPTPersonalProduct,
    isDisneyCodeTvProduct,
    isIptvProduct,
    isMicrosoftOfficeProduct,
    normalizeProductName,
} = require("./productDeliveryProfile");
const { formatBogotaDateTime, isEventLinkPlan } = require("./eventLinks");

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

function isSpotifyProduct({ platformName, platformSlug } = {}) {
    const normalized = normalizeProductName(platformSlug || platformName);
    return normalized.includes("spotify");
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
    const firstNonBlank = (...values) => values.find((value) => String(value ?? "").trim()) || "";
    const username = firstNonBlank(
        account.username,
        account.user,
        account.email,
        account.account_email,
        account.accountEmail,
    );
    const password = firstNonBlank(
        account.password,
        account.pass,
        account.account_password,
        account.accountPassword,
    );
    const accessUrl = firstNonBlank(
        account.access_url,
        account.accessUrl,
        account.url,
        account.accessURL,
    );
    return [
        "Usuario: " + (username || "-"),
        "Contrase\u00f1a: " + (password || "-"),
        "URL: " + (accessUrl || "-"),
    ].join("\n");
}

function buildDisneyCodeTvCredentialsMessage(account = {}, expiresAt) {
    const email = account.email || account.account_email || account.accountEmail || "-";
    const lines = [`📧 Correo: ${email}`];
    const profile = account.profile_number;
    const pin = account.pin;

    if (profile !== null && profile !== undefined && String(profile).trim() !== "") {
        lines.push(`👤 Perfil: ${profile}`);
    }
    if (pin !== null && pin !== undefined && String(pin).trim() !== "") {
        lines.push(`🔢 Pin: ${pin}`);
    }
    if (expiresAt) {
        lines.push(`📅 Expira: ${formatDateOnlyBogota(expiresAt)}`);
    }

    return lines.join("\n");
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

function buildDisneyCodeTvNotice() {
    return [
        "📺 ACTIVACIÓN EN TV",
        "Ya tienes la cuenta. Primero escríbenos por WhatsApp para confirmar que recibiste el acceso.",
        "Después inicia sesión en tu TV y envíanos el código que aparezca. Así podremos confirmar el ingreso y ayudarte rápidamente.",
        `📱 WhatsApp: ${salesContactPhone()}`,
    ].join("\n");
}

function buildMicrosoftOfficeCredentialsMessage(account = {}, expiresAt) {
    const lines = [];
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

    if (expiresAt) {
        lines.push(`📅 Expira: ${formatDateOnlyBogota(expiresAt)}`);
    }

    return lines.join("\n");
}

function buildMicrosoftOfficeNotice() {
    return [
        "📘 MANUAL DE INGRESO - MICROSOFT 365",
        "1. Ingresa a https://m365.cloud.microsoft/apps.",
        "2. Coloca el correo y la contraseña entregados.",
        "3. Presiona el botón «Instalar aplicaciones».",
        "4. Selecciona «Aplicaciones de Microsoft 365» y descarga el programa.",
        "⚠️ Antes de instalarlo, asegúrate de no tener una versión anterior de Microsoft Office o Microsoft 365. Si la tienes, desinstálala para evitar problemas de compatibilidad.",
        "5. Cuando termine la instalación, abre Microsoft 365 e inicia sesión con las credenciales entregadas.",
    ].join("\n");
}

const PLATFORM_36_ACCOUNT_NOTICE = [
    "\u26a0\ufe0f ACCIONES IMPORTANTES AL RECIBIR TU CUENTA",
    "",
    "\ud83d\udd10 Por seguridad, cambia inmediatamente el 2FA o reempl\u00e1zalo por tu correo personal en cuanto recibas la cuenta.",
    "",
    "\u2705 Si la cuenta es nueva, el cambio normalmente se realiza sin inconvenientes. Durante el proceso puede que no recibas c\u00f3digos en el Gmail original; esto puede ser normal.",
    "",
    "\ud83d\udc49 Haz este cambio de inmediato para proteger el acceso y evitar bloqueos o inconvenientes.",
    "",
    "\ud83d\udeab IMPORTANTE: despu\u00e9s de cambiar la contrase\u00f1a y el 2FA, no los modifiques nuevamente. La garant\u00eda no cubre cambios posteriores realizados por el cliente, ya que usamos c\u00f3digos OTP de Gmail y no tenemos acceso para recuperar el correo.",
    "",
    "\ud83d\udccc El reporte de un 2FA correcto como si fuera inv\u00e1lido para solicitar otra cuenta se considerar\u00e1 un uso indebido y puede anular la garant\u00eda."
].join("\n");

function platformIdOf({ platformId, purchasedPlatformId, platform, plan } = {}) {
    return Number(
        platformId
        ?? purchasedPlatformId
        ?? platform?.id
        ?? platform?.platform_id
        ?? plan?.platform_id
        ?? plan?.platformId
    ) || null;
}

function appendPlatform36Notice(lines, platformId) {
    if (Number(platformId) === 36) {
        lines.push("");
        lines.push(PLATFORM_36_ACCOUNT_NOTICE);
    }
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
    platformId,
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

    if (isDisneyCodeTvProduct({ platformName, platformSlug })) {
        lines.push(buildDisneyCodeTvCredentialsMessage(safeAccount, expiresAt));
        lines.push("");
        lines.push(buildDisneyCodeTvNotice());
        return lines.join("\n").trim();
    }

    if (isMicrosoftOfficeProduct({ platformName, platformSlug })) {
        lines.push(buildMicrosoftOfficeCredentialsMessage(safeAccount, expiresAt));
        lines.push("");
        lines.push(buildMicrosoftOfficeNotice());
        return lines.join("\n").trim();
    }

    if (isChatGPTPersonalProduct({ platformName, platformSlug }) || isIptvProduct({ platformName, platformSlug })) {
        lines.push(
            isIptvProduct({ platformName, platformSlug })
                ? buildIptvCredentialsMessage(safeAccount)
                : buildChatGPTPersonalCredentialsMessage(safeAccount)
        );
        appendPlatform36Notice(lines, platformId);
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

    if (url && !isSpotifyProduct({ platformName, platformSlug })) {
        lines.push("");
        lines.push(`🔗⚠️ Debido a que en ocasiones se bloquea o cambia la clave, en este enlace ${url} puedes consultar la contraseña hasta tu último día contratado. 💻🔑:`);
    }

    appendPlatform36Notice(lines, platformId);
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
    const isDisneyCodeTvResult = (result) => {
        const plan = result?.plan || {};
        return isDisneyCodeTvProduct({
            platformName: result?.purchasedPlatformName || result?.platformName || plan.platform_name,
            platformSlug: result?.purchasedPlatformSlug || result?.platformSlug || plan.platform_slug,
        });
    };
    const isMicrosoftOfficeResult = (result) => {
        const plan = result?.plan || {};
        return isMicrosoftOfficeProduct({
            platformName: result?.purchasedPlatformName || result?.platformName || plan.platform_name,
            platformSlug: result?.purchasedPlatformSlug || result?.platformSlug || plan.platform_slug,
        });
    };
    const isSpotifyResult = (result) => {
        const plan = result?.plan || {};
        return isSpotifyProduct({
            platformName: result?.purchasedPlatformName || result?.platformName || plan.platform_name,
            platformSlug: result?.purchasedPlatformSlug || result?.platformSlug || plan.platform_slug,
        });
    };
    const isEventLinkResult = (result) => isEventLinkPlan(result?.plan || {})
        || Boolean(result?.eventLink?.url || result?.event_link_url);

    const hasDeviceUsageRuleItems = safeResults.some((result) => {
        const plan = result?.plan || {};
        return !isChatGPTPersonalResult(result)
            && !isIptvResult(result)
            && !isDisneyCodeTvResult(result)
            && !isMicrosoftOfficeResult(result)
            && !isSpotifyResult(result)
            && !isEventLinkResult(result)
            && !isEmailDelivery(plan)
            && shouldShowDeviceUsageRule(plan);
    });
    const lines = [];
    let platform36NoticeAdded = false;
    let disneyCodeTvNoticeAdded = false;
    let microsoftOfficeNoticeAdded = false;
    const markOrderPlatform36Notice = (platformId) => {
        if (Number(platformId) === 36) {
            platform36NoticeAdded = true;
        }
    };

    lines.push(`🧾 Orden: ${orderCode || "-"}`);
    lines.push(`📦 Pedido múltiple (${safeResults.length} items)`);
    lines.push("");

    for (const result of safeResults) {
        const plan = result?.plan || {};
        const account = result?.account || {};
        const url = credentialUrl(baseUrl, result?.token || "");
        const platformName = result?.purchasedPlatformName || result?.platformName || plan.platform_name || "Producto";
        const platformId = platformIdOf({
            platformId: result?.platformId,
            purchasedPlatformId: result?.purchasedPlatformId,
            plan,
        });
        const eventLink = result?.eventLink || {
            title: result?.event_link_title,
            url: result?.event_link_url,
            endsAt: result?.event_link_ends_at,
        };

        if (isEventLinkResult(result)) {
            lines.push(`🆔 ID: ${result?.subscriptionId || "-"} | 🖥️ ${platformName}`);
            lines.push(`⚽ Partido: ${eventLink?.title || "Transmision en vivo"}`);
            lines.push(`▶️ Enlace YouTube: ${eventLink?.url || "-"}`);
            lines.push(`⏱️ Disponible hasta: ${formatBogotaDateTime(eventLink?.endsAt)}.`);
            lines.push("");
            continue;
        }

        if (isDisneyCodeTvResult(result)) {
            lines.push(`🆔 ID: ${result?.subscriptionId || "-"} | 🖥️ ${platformName}`);
            lines.push(buildDisneyCodeTvCredentialsMessage(account, result?.expiresAt));
            disneyCodeTvNoticeAdded = true;
            lines.push("");
            continue;
        }

        if (isMicrosoftOfficeResult(result)) {
            lines.push(`🆔 ID: ${result?.subscriptionId || "-"} | 🖥️ ${platformName}`);
            lines.push(buildMicrosoftOfficeCredentialsMessage(account, result?.expiresAt));
            microsoftOfficeNoticeAdded = true;
            lines.push("");
            continue;
        }

        if (isChatGPTPersonalResult(result) || isIptvResult(result)) {
            lines.push(`\u{1F194} ID: ${result?.subscriptionId || "-"} | \u{1F5A5}\uFE0F ${platformName}`);
            lines.push(
                isIptvResult(result)
                    ? buildIptvCredentialsMessage(account)
                    : buildChatGPTPersonalCredentialsMessage(account)
            );
            markOrderPlatform36Notice(platformId);
            lines.push("");
            continue;
        }

        if (isEmailDelivery(plan) && isAssistedActivationProduct(platformName)) {
            const activationService = activationServiceName(platformName);
            lines.push(`🖥️ ${platformName}`);
            lines.push(`📌 Nota de activación: comunícate al WhatsApp ${salesContactPhone()} para que te ayuden con la activación.`);
            lines.push("");
            lines.push(`Hola, necesito ayuda para activar ${activationService}. Orden: ${orderCode || "-"}. Producto: ${platformName}.`);
            markOrderPlatform36Notice(platformId);
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
        if (!isSpotifyResult(result)) {
            lines.push(`🔗⚠️ Debido a que en ocasiones se bloquea o cambia la clave, en este enlace ${url} puedes consultar la contraseña hasta tu último día contratado. 💻🔑:`);
        }
        markOrderPlatform36Notice(platformId);
        lines.push("");
    }

    // Las instrucciones de ChatGPT van una sola vez, despues de todas las cuentas.
    if (platform36NoticeAdded) {
        appendPlatform36Notice(lines, 36);
    }

    if (disneyCodeTvNoticeAdded) {
        lines.push(buildDisneyCodeTvNotice());
    }

    if (microsoftOfficeNoticeAdded) {
        lines.push(buildMicrosoftOfficeNotice());
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
    buildDisneyCodeTvCredentialsMessage,
    buildDisneyCodeTvNotice,
    buildIptvCredentialsMessage,
    buildMicrosoftOfficeCredentialsMessage,
    buildMicrosoftOfficeNotice,
    PLATFORM_36_ACCOUNT_NOTICE,
    platformIdOf,
    isAssistedActivationProduct,
    isChatGPTPersonalProduct,
    isDisneyCodeTvProduct,
    isIptvProduct,
    isMicrosoftOfficeProduct,
    isSpotifyProduct,
    salesContactPhone,
};
