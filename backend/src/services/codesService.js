// BACKEND: pagv2strbx/src/services/codesService.js

const { fetchCodeFromGmail } = require("./gmailCodeService");
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
    // ✅ "slug" preferido, pero si viene vacío o raro, usamos name como fallback
    // Esto evita que falle si tu query no trae platforms.slug o lo trae con otro alias
    const raw =
        sub?.platformSlug ||
        sub?.platform_slug ||
        sub?.platformName ||
        sub?.platform_name ||
        sub?.name ||
        "";

    return String(raw || "");
}

async function requestCodeForOrder({ orderNumber, platformSlug, user }) {
    // ✅ Normaliza el slug que llega por URL / request
    const requestedSlug = toCodeSlug(platformSlug);

    // 1) Config plataforma
    let plat;

    // ✅ OVERRIDE SOLO PARA CHATGPT
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

    if (!plat || Number(plat.is_active) !== 1) {
        return { http: 404, body: { ok: false, message: "Plataforma no disponible" } };
    }

    // 2) pedido + cuenta vendida
    const sub = await getSubscriptionWithAccount(orderNumber);
    if (!sub) {
        return {
            http: 404,
            body: { ok: false, message: "Pedido no encontrado" },
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

    // 3) permisos
    const role = user?.role || "user";
    const isAdmin = String(role).toLowerCase() === "admin";
    const requestedByUserId = user?.id ?? user?.sub ?? null; // ✅ por si tu auth usa sub

    if (!isAdmin && Number(sub.userId) !== Number(requestedByUserId)) {
        return {
            http: 403,
            body: { ok: false, message: "No autorizado" },
            meta: { sub, plat, fingerprint, buyerEmail },
        };
    }

    // 4) plataforma del pedido (BLINDADA)
    // ✅ Antes dependías solo de sub.platformSlug; si viene mal, falla.
    // ✅ Ahora usamos slug/name y lo normalizamos con toCodeSlug.
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

    // 5) activo y no vencido
    const isActive = String(sub.status || "").toLowerCase() === "active";
    const notExpired = !sub.expires_at || new Date(sub.expires_at).getTime() > Date.now();
    if (!isActive || !notExpired) {
        return {
            http: 400,
            body: { ok: false, message: "Pedido/cuenta no activa o vencida" },
            meta: { sub, fingerprint, soldAccountEmail },
        };
    }

    // 6) regla 1 por pedido salvo cambio
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

    // 7) gmail
    const gmailResult = await fetchCodeFromGmail({
        toEmail: soldAccountEmail,
        gmailFromContains: plat.gmail_from,
        codeRegex: plat.code_regex,
        maxAgeMinutes: Number(plat.max_age_minutes) || 15,
    });

    if (!gmailResult.ok) {
        return {
            http: 404,
            body: {
                ok: false,
                status: gmailResult.status || "not_found",
                message: gmailResult.message || "No se encontró código",
            },
            meta: { sub, plat, fingerprint, soldAccountEmail, gmailResult },
        };
    }

    // 8) ok
    return {
        http: 200,
        body: {
            ok: true,
            orderNumber: Number(orderNumber),
            platform: requestedSlug,
            email: soldAccountEmail,
            code: gmailResult.code,
        },
        meta: { sub, plat, fingerprint, soldAccountEmail, gmailResult },
    };
}

module.exports = { requestCodeForOrder, normalizeSlug };
