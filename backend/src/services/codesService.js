// BACKEND: pagv2strbx/src/services/codesService.js

const { fetchCodeFromGmail } = require("./gmailCodeService");
const { fetchNetflixFlow } = require("./netflixFlowService");
const { credFingerprint } = require("../utils/credFingerprint");
const {
    getCodePlatformBySlug,
    getSubscriptionWithAccount,
    countDeliveredByFingerprint,
} = require("./codeQueries");

const { toCodeSlug } = require("../utils/platformSlugMap");
const { isStoredDateOnlyExpired } = require("../utils/date");

const CHATGPT_CODE_REGEX = "(?:Tu\\s+c[o\\u00f3]digo\\s+de\\s+ChatGPT\\s+es|Your\\s+ChatGPT\\s+code\\s+is|Introduce\\s+este\\s+c[o\\u00f3]digo\\s+de\\s+verificaci[o\\u00f3]n\\s+temporal\\s+para\\s+continuar:?|Enter\\s+this\\s+temporary\\s+verification\\s+code\\s+to\\s+continue:?|c[o\\u00f3]digo\\s+de\\s+verificaci[o\\u00f3]n(?:\\s+temporal)?)[^0-9]{0,120}([0-9]{6})";

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

function normalizePolicyKey(raw) {
    return String(raw || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[^a-z0-9 ]/g, "");
}

function resolvePolicyPlatform({ requestPlatformSlug, subPlatformIdentity }) {
    const requestKey = normalizePolicyKey(requestPlatformSlug);
    const subKey = normalizePolicyKey(subPlatformIdentity);
    const combined = `${requestKey} ${subKey}`.trim();

    if (combined.includes("chatgpt business") || combined.includes("chatgptbusiness")) {
        return "chatgpt-business";
    }
    if (combined.includes("chatgpt") || combined.includes("chat gpt")) {
        return "chatgpt";
    }
    if (combined.includes("spotify")) {
        return "spotify";
    }
    if (combined.includes("prime")) {
        return "prime";
    }
    if (combined.includes("netflix")) {
        return "netflix";
    }

    return toCodeSlug(requestPlatformSlug || subPlatformIdentity || "");
}

function getRequestLimitRule({ policyPlatform, action }) {
    const normalizedAction = String(action || "code").toLowerCase();

    if (policyPlatform === "chatgpt") {
        return {
            limited: true,
            maxRequests: 2,
            countOnlyDeliveredCodes: true,
            message: "ChatGPT permite máximo 2 solicitudes por pedido mientras la contraseña actual siga siendo la misma.",
        };
    }

    if (policyPlatform === "netflix" && normalizedAction === "code") {
        return {
            limited: true,
            maxRequests: 2,
            countOnlyDeliveredCodes: true,
            message: "Netflix permite máximo 2 códigos de inicio de sesión por pedido mientras la contraseña actual siga siendo la misma.",
        };
    }

    if (policyPlatform === "prime") {
        return {
            limited: true,
            maxRequests: 1,
            countOnlyDeliveredCodes: true,
            message: "Prime Video permite 1 solicitud por pedido mientras la contraseña actual siga siendo la misma.",
        };
    }

    return {
        limited: false,
        maxRequests: null,
        countOnlyDeliveredCodes: false,
        message: null,
    };
}

function normalizeCodeAction(action) {
    const value = String(action || "code").trim().toLowerCase();
    if (value === "temporary" || value === "approve") return value;
    return "code";
}

async function enforceNetflixActionRules({ orderNumber, requestedSlug, fingerprint, action }) {
    const normalizedAction = normalizeCodeAction(action);
    if (requestedSlug !== "netflix") return { blocked: false };

    const base = {
        orderId: orderNumber,
        platformSlugLower: requestedSlug,
        credentialFingerprint: fingerprint,
    };

    if (normalizedAction === "temporary") {
        const deliveredCount = await countDeliveredByFingerprint({
            ...base,
            requireCodeValue: true,
            messageLike: "OK:temporary%",
        });
        if (deliveredCount >= 1) {
            return {
                blocked: true,
                deliveredCount,
                limit: 1,
                message: "Netflix acceso temporal solo permite 1 código por pedido mientras la contraseña actual siga siendo la misma.",
            };
        }
        return { blocked: false };
    }

    const loginCodeCount = await countDeliveredByFingerprint({
        ...base,
        requireCodeValue: true,
        messageNotLike: "OK:temporary%",
    });
    const approvalCount = await countDeliveredByFingerprint({
        ...base,
        requireEmptyCode: true,
        messageLike: "OK:approve-confirmed%",
    });

    if (normalizedAction === "code" && approvalCount >= 1) {
        return {
            blocked: true,
            deliveredCount: approvalCount,
            limit: 1,
            message: "Netflix ya tiene una solicitud de inicio de sesión aprobada para este pedido. No se puede solicitar código de inicio.",
        };
    }
    if (normalizedAction === "approve" && loginCodeCount >= 1) {
        return {
            blocked: true,
            deliveredCount: loginCodeCount,
            limit: 1,
            message: "Netflix ya entregó código de inicio de sesión para este pedido. No se puede aprobar nueva solicitud de inicio.",
        };
    }
    if (normalizedAction === "code" && loginCodeCount >= 1) {
        return {
            blocked: true,
            deliveredCount: loginCodeCount,
            limit: 1,
            message: "Netflix permite 1 código de inicio de sesión por pedido mientras la contraseña actual siga siendo la misma.",
        };
    }
    if (normalizedAction === "approve" && approvalCount >= 1) {
        return {
            blocked: true,
            deliveredCount: approvalCount,
            limit: 1,
            message: "Netflix permite aprobar 1 nueva solicitud de inicio de sesión por pedido mientras la contraseña actual siga siendo la misma.",
        };
    }

    return { blocked: false };
}

async function withTimeout(promise, ms, timeoutMessage) {
    let timer = null;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    const err = new Error(timeoutMessage || "Operation timed out");
                    err.code = "ETIMEDOUT";
                    reject(err);
                }, ms);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function requestCodeForOrder({ orderNumber, platformSlug, user, action = "code" }) {
    const requestedSlug = toCodeSlug(platformSlug);
    const normalizedAction = normalizeCodeAction(action);

    let plat;
    if (requestedSlug === "chatgpt") {
        plat = {
            slug: "chatgpt",
            gmail_from: "tm.openai.com",
            code_regex: CHATGPT_CODE_REGEX,
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
        return { http: 404, body: { ok: false, status: "platform_unavailable", message: `Plataforma '${requestedSlug}' no disponible` } };
    }

    const sub = await getSubscriptionWithAccount(orderNumber);
    if (!sub) {
        console.error(`[requestCode] Pedido no encontrado: ${orderNumber}`);
        return {
            http: 404,
            body: { ok: false, status: "subscription_missing", message: `Suscripción #${orderNumber} no encontrada` },
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
            body: { ok: false, status: "unauthorized", message: "No autorizado" },
            meta: { sub, plat, fingerprint, buyerEmail },
        };
    }

    const rawFromSub = pickPlatformIdentityFromSub(sub);
    const expectedCodeSlug = toCodeSlug(rawFromSub);
    const policyPlatform = resolvePolicyPlatform({
        requestPlatformSlug: platformSlug,
        subPlatformIdentity: rawFromSub,
    });

    if (expectedCodeSlug !== requestedSlug) {
        return {
            http: 403,
            body: {
                ok: false,
                status: "platform_mismatch",
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
    const notExpired = !sub.expires_at || !isStoredDateOnlyExpired(sub.expires_at);
    if (!isActive || !notExpired) {
        return {
            http: 400,
            body: { ok: false, status: "subscription_inactive", message: "Pedido/cuenta no activa o vencida" },
            meta: { sub, fingerprint, soldAccountEmail },
        };
    }

    const netflixRule = await enforceNetflixActionRules({
        orderNumber,
        requestedSlug,
        fingerprint,
        action: normalizedAction,
    });
    if (netflixRule.blocked) {
        return {
            http: 429,
            body: {
                ok: false,
                status: "blocked",
                message: netflixRule.message,
                limit: netflixRule.limit,
                deliveredCount: netflixRule.deliveredCount,
                resetRule: "El contador se reinicia cuando cambia la contraseña o PIN de la cuenta.",
            },
            meta: { sub, plat, fingerprint, soldAccountEmail, policyPlatform, deliveredCount: netflixRule.deliveredCount },
        };
    }

    const limitRule = getRequestLimitRule({ policyPlatform, action: normalizedAction });
    if (limitRule.limited && requestedSlug !== "netflix") {
        const deliveredCount = await countDeliveredByFingerprint({
            orderId: orderNumber,
            platformSlugLower: requestedSlug,
            credentialFingerprint: fingerprint,
            requireCodeValue: limitRule.countOnlyDeliveredCodes,
        });

        if (deliveredCount >= limitRule.maxRequests) {
            return {
                http: 429,
                body: {
                    ok: false,
                    status: "blocked",
                    message: limitRule.message,
                    limit: limitRule.maxRequests,
                    deliveredCount,
                    resetRule: "El contador se reinicia cuando cambia la contraseña o PIN de la cuenta.",
                },
                meta: { sub, plat, fingerprint, soldAccountEmail, policyPlatform, deliveredCount },
            };
        }
    }

    // 7) Extraer código de gmail o netflix flow
    let fetchingResult;

    try {
        if (requestedSlug === "netflix") {
            fetchingResult = await withTimeout(
                fetchNetflixFlow({
                    toEmail: soldAccountEmail,
                    maxAgeMinutes: normalizedAction === "approve" ? 20 : 15,
                    action: normalizedAction,
                }),
                20000,
                "Tiempo de espera agotado consultando Netflix/Gmail."
            );
        } else {
            fetchingResult = await withTimeout(
                fetchCodeFromGmail({
                    toEmail: soldAccountEmail,
                    gmailFromContains: plat.gmail_from,
                    codeRegex: plat.code_regex,
                    maxAgeMinutes: Number(plat.max_age_minutes) || 15,
                }),
                20000,
                "Tiempo de espera agotado consultando Gmail."
            );
        }
    } catch (error) {
        console.error("[requestCode] fetch_failed", {
            orderNumber,
            requestedSlug,
            accountEmail: soldAccountEmail,
            message: error?.message || String(error),
        });
        return {
            http: 504,
            body: {
                ok: false,
                status: "fetch_timeout",
                message: "La busqueda del codigo tardó demasiado. Intenta nuevamente en unos segundos.",
            },
            meta: { sub, plat, fingerprint, soldAccountEmail, error: error?.message || String(error) },
        };
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
