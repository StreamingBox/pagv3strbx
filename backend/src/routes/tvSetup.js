const express = require("express");

const requireAuth = require("../middleware/requireAuth");
const { getSubscriptionWithAccount } = require("../services/codeQueries");
const { createCodeLogger } = require("../services/codeDeliveryLogger");
const { finishCodeRequestReservation } = require("../services/codeRequestReservation.service");
const { requestCodeForOrder } = require("../services/codesService");
const { runNetflixTvSetup } = require("../services/netflixTvSetupService");
const { toCodeSlug } = require("../utils/platformSlugMap");
const { isStoredDateOnlyExpired } = require("../utils/date");

const router = express.Router();
const activeRuns = new Set();
const LOGIN_CODE_MAX_ATTEMPTS = 6;
const LOGIN_CODE_RETRY_DELAY_MS = 2500;
const RETRYABLE_LOGIN_CODE_STATUSES = new Set([
    "mailbox_empty",
    "sender_mismatch",
    "netflix_flow_miss",
    "expired",
    "regex_mismatch",
    "not_found",
]);

function normalizeTvCode(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
    return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
}

function parseSubscriptionId(value) {
    const raw = String(value || "").trim().replace(/^#/, "");
    if (!/^\d+$/.test(raw)) return null;

    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isAdmin(user) {
    return String(user?.role || "").trim().toLowerCase() === "admin";
}

function buildValidatedData(subscription, tvCode) {
    return {
        ok: true,
        status: "validated",
        orderNumber: Number(subscription.subscriptionId),
        tvCode,
        platform: "netflix",
        platformName: subscription.platformName || "Netflix",
        accountEmail: subscription.accountEmail,
        profile: subscription.accountProfile ?? null,
        expiresAt: subscription.expires_at || null,
        netflixTvUrl: "https://www.netflix.com/tv2",
        automation: true,
        loginCodeAction: "code",
        sharesLoginCodeCounter: true,
    };
}

async function loadValidatedSubscription({ req, tvCode, subscriptionId }) {
    const subscription = await getSubscriptionWithAccount(subscriptionId);
    if (!subscription) {
        return {
            http: 404,
            body: {
                ok: false,
                status: "subscription_missing",
                message: `Pedido #${subscriptionId} no encontrado.`,
            },
        };
    }

    if (!isAdmin(req.user) && Number(subscription.userId) !== Number(req.user?.id)) {
        return {
            http: 403,
            body: { ok: false, status: "unauthorized", message: "Ese pedido no pertenece a tu cuenta." },
        };
    }

    if (toCodeSlug(subscription.platformSlug) !== "netflix") {
        return {
            http: 400,
            body: { ok: false, status: "platform_mismatch", message: "Este flujo solo está disponible para pedidos de Netflix." },
        };
    }

    if (!subscription.platformAccountId || !subscription.accountEmail) {
        return {
            http: 400,
            body: { ok: false, status: "no_account", message: "Este pedido aún no tiene una cuenta asignada." },
        };
    }

    const active = String(subscription.status || "").trim().toLowerCase() === "active";
    const notExpired = !subscription.expires_at || !isStoredDateOnlyExpired(subscription.expires_at);
    if (!active || !notExpired) {
        return {
            http: 400,
            body: { ok: false, status: "subscription_inactive", message: "El pedido de Netflix no está activo o ya venció." },
        };
    }

    return { subscription, body: buildValidatedData(subscription, tvCode) };
}

async function requestLoginCodeOnce(req, orderNumber) {
    const { saveLog } = createCodeLogger({
        req,
        orderNumber,
        platformSlug: "netflix",
        action: "code",
    });

    let result = null;
    try {
        result = await requestCodeForOrder({
            orderNumber,
            platformSlug: "netflix",
            user: req.user,
            action: "code",
        });

        if (!result?.meta?.sub) {
            await saveLog({ status: "subscription_missing", message: "Suscripción no encontrada" });
            return { ok: false, status: "subscription_missing", message: "Suscripción no encontrada." };
        }

        const sub = result.meta.sub;
        const buyerEmail = String(sub.userEmail || "").toLowerCase();
        const soldAccountEmail = String(sub.accountEmail || "").toLowerCase();
        const baseLog = {
            platform_slug: "netflix",
            order_email: soldAccountEmail || buyerEmail || "",
            platform_account_id: sub.platformAccountId || null,
            credential_fingerprint: result.meta.fingerprint || null,
        };

        if (result.http !== 200) {
            await saveLog({
                ...baseLog,
                status: result.body?.status || "error",
                message: result.body?.message || "Error",
            });
            await finishCodeRequestReservation(result.meta?.reservation, "failed");
            return {
                ok: false,
                status: result.body?.status || "login_code_unavailable",
                message: result.body?.message || "No se pudo consultar el código de Inicio.",
            };
        }

        const code = String(result.body?.code || "").replace(/\D/g, "");
        if (!/^\d{4}$/.test(code)) {
            await saveLog({
                ...baseLog,
                status: "invalid_code",
                message: "El proveedor no devolvió un código de Inicio de 4 dígitos.",
            });
            await finishCodeRequestReservation(result.meta?.reservation, "failed");
            return { ok: false, status: "invalid_login_code", message: "El proveedor no devolvió un código de Inicio válido." };
        }
        await saveLog({
            ...baseLog,
            delivered_code: code,
            status: "delivered",
            message: "OK:code-tv-setup",
        });
        await finishCodeRequestReservation(result.meta?.reservation, "completed");
        return { ok: true, code };
    } catch (error) {
        await saveLog({ status: "error", message: error?.message || "Error interno" });
        await finishCodeRequestReservation(result?.meta?.reservation, "failed");
        console.error("[tv-setup] login code error", error);
        return { ok: false, status: "login_code_unavailable", message: "No se pudo consultar el código de Inicio." };
    }
}

async function requestLoginCodeForSetup(req, orderNumber) {
    let latest = null;

    // Gmail/IMAP puede tardar unos segundos en reflejar el correo que Netflix
    // acaba de enviar. Reintentamos solo ante ausencia de correo o de código.
    for (let attempt = 1; attempt <= LOGIN_CODE_MAX_ATTEMPTS; attempt += 1) {
        latest = await requestLoginCodeOnce(req, orderNumber);
        if (latest?.ok || !RETRYABLE_LOGIN_CODE_STATUSES.has(latest?.status)) return latest;
        if (attempt < LOGIN_CODE_MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, LOGIN_CODE_RETRY_DELAY_MS));
    }

    return latest || {
        ok: false,
        status: "login_code_unavailable",
        message: "No se pudo consultar el código de Inicio.",
    };
}

function automationHttpStatus(status) {
    if (["invalid_tv_code", "tv_code_input_missing", "tv_code_submit_missing", "tv_code_submit_disabled", "account_email_missing", "email_input_missing", "continue_button_missing", "email_flow_not_advanced", "password_required", "login_code_input_missing", "invalid_login_code", "login_code_rejected"].includes(status)) return 400;
    if (["browser_unavailable", "login_code_unavailable", "provider_config_error", "imap_error", "imap_auth_error"].includes(status)) return 503;
    if (status === "automation_timeout") return 504;
    if (status === "captcha_required") return 422;
    return 502;
}

/**
 * POST /tv-setup/validate
 * Validates the TV code and account before starting the automated browser flow.
 */
router.post("/tv-setup/validate", requireAuth, async (req, res) => {
    const tvCode = normalizeTvCode(req.body?.tvCode);
    const subscriptionId = parseSubscriptionId(req.body?.orderNumber);

    if (!/^\d{4}-\d{4}$/.test(tvCode)) {
        return res.status(400).json({
            ok: false,
            status: "invalid_tv_code",
            message: "Ingresa el código del TV con 8 dígitos, por ejemplo 9875-3269.",
        });
    }

    if (!subscriptionId) {
        return res.status(400).json({
            ok: false,
            status: "invalid_order",
            message: "Ingresa un número de pedido válido.",
        });
    }

    try {
        const loaded = await loadValidatedSubscription({ req, tvCode, subscriptionId });
        if (!loaded.subscription) return res.status(loaded.http).json(loaded.body);
        return res.json(loaded.body);
    } catch (error) {
        console.error("[tv-setup] validation error", error);
        return res.status(500).json({
            ok: false,
            status: "internal_error",
            message: "No fue posible validar el pedido. Intenta nuevamente.",
        });
    }
});

/**
 * POST /tv-setup/run
 * Completes Netflix TV2, the account email challenge and the Inicio code
 * inside a short-lived server-side browser session.
 */
router.post("/tv-setup/run", requireAuth, async (req, res) => {
    const tvCode = normalizeTvCode(req.body?.tvCode);
    const subscriptionId = parseSubscriptionId(req.body?.orderNumber);

    if (!/^\d{4}-\d{4}$/.test(tvCode) || !subscriptionId) {
        return res.status(400).json({
            ok: false,
            status: "invalid_input",
            message: "Ingresa un código de TV de 8 dígitos y un pedido válido.",
        });
    }

    if (activeRuns.has(subscriptionId)) {
        return res.status(409).json({
            ok: false,
            status: "automation_in_progress",
            message: "Ya hay una conexión de TV en proceso para este pedido.",
        });
    }

    try {
        const loaded = await loadValidatedSubscription({ req, tvCode, subscriptionId });
        if (!loaded.subscription) return res.status(loaded.http).json(loaded.body);

        activeRuns.add(subscriptionId);
        const flow = await runNetflixTvSetup({
            tvCode,
            accountEmail: loaded.subscription.accountEmail,
            requestLoginCode: () => requestLoginCodeForSetup(req, subscriptionId),
        });

        if (!flow.ok) {
            return res.status(automationHttpStatus(flow.status)).json({
                ok: false,
                status: flow.status,
                message: flow.message,
            });
        }

        return res.json({
            ...loaded.body,
            ok: true,
            status: "completed",
            automation: true,
            finalUrl: flow.finalUrl || null,
        });
    } catch (error) {
        console.error("[tv-setup] run error", error);
        return res.status(500).json({
            ok: false,
            status: "internal_error",
            message: "No fue posible completar la conexión automática.",
        });
    } finally {
        activeRuns.delete(subscriptionId);
    }
});

if (process.env.NODE_ENV !== "production") {
    router.get("/tv-setup/_ping", (req, res) => res.json({ ok: true, mounted: true }));
}

module.exports = router;
