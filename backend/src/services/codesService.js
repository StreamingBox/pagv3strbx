// BACKEND: pagv2strbx/src/services/codesService.js

const { fetchCodeFromGmail } = require("./gmailCodeService");
const { fetchNetflixFlow } = require("./netflixFlowService");
const { credFingerprint } = require("../utils/credFingerprint");
const {
    getCodePlatformBySlug,
    getSubscriptionWithAccount,
    getLastDelivered,
} = require("./codeQueries");

const { toCodeSlug } = require("../utils/platformSlugMap");

function normalizeSlug(slug) {
    return String(slug || "").trim().toLowerCase();
}

function pickPlatformIdentityFromSub(sub) {
    const raw =
        sub?.platformSlug ||
        sub?.platform_slug ||
        sub?.platformName ||
        sub?.platform_name ||
        sub?.name ||
        "";

    return String(raw || "");
}

async function requestCodeForOrder({ orderNumber, platformSlug, user, action = "code" }) {
    const requestedSlug = toCodeSlug(platformSlug);

    let plat;
    if (requestedSlug === "chatgpt") {
        plat = {
            slug: "chatgpt",
            gmail_from: "tm.openai.com",
            code_regex: "Tu código de ChatGPT es\\s*([0-9]{6})",
            max_age_minutes: 15,
            is_active: 1,
        };
    } else {
        plat = await getCodePlatformBySlug(requestedSlug);
    }

    // ✅ Fallback hardcoded para Netflix si no existe en BD
    if (!plat && requestedSlug === "netflix") {
        plat = { slug: "netflix", gmail_from: "netflix.com", is_active: 1, max_age_minutes: 15 };
    }

    if (!plat || Number(plat.is_active) !== 1) {
        console.error(`[requestCode] Plataforma no encontrada o inactiva: ${requestedSlug}`);
        return { http: 404, body: { ok: false, message: `Plataforma '${requestedSlug}' no disponible` } };
    }

    const sub = await getSubscriptionWithAccount(orderNumber);
    if (!sub) {
        console.error(`[requestCode] Pedido no encontrado: ${orderNumber}`);
        return {
            http: 404,
            body: { ok: false, message: `Pedido #${orderNumber} no encontrado` },
            meta: { sub: null, plat },
        };
    }

    const buyerEmail = String(sub.userEmail || "").toLowerCase();
    const soldAccountEmail = String(sub.accountEmail || "").toLowerCase();

    if (!sub.platformAccountId || !soldAccountEmail) {
        return {
            http: 400,
            body: {
                ok: false,
                status: "no_account",
                message: "Este pedido aún no tiene cuenta asignada.",
            },
            meta: { sub, plat, buyerEmail, soldAccountEmail },
        };
    }

    const fingerprint = credFingerprint(sub.accountPassword, sub.accountPin);

    const role = user?.role || "user";
    const isAdmin = String(role).toLowerCase() === "admin";
    const requestedByUserId = user?.id ?? user?.sub ?? null;

    if (!isAdmin && Number(sub.userId) !== Number(requestedByUserId)) {
        return {
            http: 403,
            body: { ok: false, message: "No autorizado" },
            meta: { sub, plat, fingerprint, buyerEmail },
        };
    }

    const rawFromSub = pickPlatformIdentityFromSub(sub);
    const expectedCodeSlug = toCodeSlug(rawFromSub);

    if (expectedCodeSlug !== requestedSlug) {
        return {
            http: 403,
            body: {
                ok: false,
                message: "Plataforma no coincide con el pedido",
                debug: {
                    requestedSlug,
                    expectedCodeSlug,
                    rawFromSub,
                    sub_platformSlug: sub.platformSlug,
                    sub_platformName: sub.platformName,
                },
            },
            meta: { sub, plat, fingerprint, soldAccountEmail },
        };
    }

    const isActive = String(sub.status || "").toLowerCase() === "active";
    const notExpired = !sub.expires_at || new Date(sub.expires_at).getTime() > Date.now();
    if (!isActive || !notExpired) {
        return {
            http: 400,
            body: { ok: false, message: "Pedido/cuenta no activa o vencida" },
            meta: { sub, fingerprint, soldAccountEmail },
        };
    }

    // ChatGPT permite solicitudes ilimitadas (no tiene bloqueo por pedido)
    if (requestedSlug !== "chatgpt") {
        const last = await getLastDelivered(orderNumber, requestedSlug);
        if (last && String(last.credential_fingerprint || "") === String(fingerprint)) {
            return {
                http: 409,
                body: {
                    ok: false,
                    status: "blocked",
                    message:
                        "Solo se puede solicitar 1 código por pedido. Si cambias la clave/pin podrás solicitar nuevamente.",
                },
                meta: { sub, plat, fingerprint, soldAccountEmail },
            };
        }
    }

    // 7) Extraer código de gmail o netflix flow
    let fetchingResult;

    if (requestedSlug === "netflix") {
        fetchingResult = await fetchNetflixFlow({
            toEmail: soldAccountEmail,
            maxAgeMinutes: Number(plat.max_age_minutes) || 15,
            action,
        });
    } else {
        fetchingResult = await fetchCodeFromGmail({
            toEmail: soldAccountEmail,
            gmailFromContains: plat.gmail_from,
            codeRegex: plat.code_regex,
            maxAgeMinutes: Number(plat.max_age_minutes) || 15,
        });
    }

    if (!fetchingResult.ok) {
        return {
            http: 404,
            body: {
                ok: false,
                status: fetchingResult.status || "not_found",
                message: fetchingResult.message || "No se encontró código",
            },
            meta: { sub, plat, fingerprint, soldAccountEmail, gmailResult: fetchingResult },
        };
    }

    // 8) ok (puede ser código puro o aprobación)
    const responseBody = {
        ok: true,
        orderNumber: Number(orderNumber),
        platform: requestedSlug,
        email: soldAccountEmail,
        type: fetchingResult.type || "code",
    };

    if (fetchingResult.type === "approval") {
        responseBody.deviceName = fetchingResult.deviceName;
    } else {
        responseBody.code = fetchingResult.code;
    }

    return {
        http: 200,
        body: responseBody,
        meta: { sub, plat, fingerprint, soldAccountEmail, gmailResult: fetchingResult },
    };
}

module.exports = { requestCodeForOrder, normalizeSlug };
