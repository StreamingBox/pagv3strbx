const pool = require("../db");
const { credFingerprint } = require("../utils/credFingerprint");
const { isStoredDateOnlyExpired } = require("../utils/date");
const { toCodeSlug } = require("../utils/platformSlugMap");
const {
    getDeliveryCountersByFingerprint,
    getLastCodeReset,
    getSubscriptionWithAccount,
} = require("./codeQueries");

function normalizeOrderNumber(orderNumber) {
    const value = Number(orderNumber);
    if (!Number.isInteger(value) || value <= 0) return null;
    return value;
}

function getSubscriptionCodeSlug(sub) {
    return toCodeSlug(sub?.platformSlug || sub?.platformName || "");
}

function assertResettableSubscription(sub) {
    if (!sub) {
        return { ok: false, http: 404, message: "No se encontro el pedido." };
    }
    if (!sub.platformAccountId || !sub.accountEmail) {
        return { ok: false, http: 400, message: "Este pedido no tiene cuenta asignada." };
    }

    const isActive = String(sub.status || "").toLowerCase() === "active";
    const notExpired = !sub.expires_at || !isStoredDateOnlyExpired(sub.expires_at);
    if (!isActive || !notExpired) {
        return { ok: false, http: 400, message: "Solo se pueden reiniciar pedidos activos y vigentes." };
    }

    const slug = getSubscriptionCodeSlug(sub);
    if (!["chatgpt", "spotify", "netflix", "prime"].includes(slug)) {
        return { ok: false, http: 400, message: "La plataforma de este pedido no maneja solicitud automatica de codigo." };
    }

    return { ok: true, slug };
}

async function getCodeResetSnapshot(orderNumber) {
    const orderId = normalizeOrderNumber(orderNumber);
    if (!orderId) {
        return { ok: false, http: 400, message: "Pedido invalido." };
    }

    const sub = await getSubscriptionWithAccount(orderId);
    const validation = assertResettableSubscription(sub);
    if (!validation.ok) return validation;

    const platformSlug = validation.slug;
    const fingerprint = credFingerprint(sub.accountPassword, sub.accountPin);
    const [counters, lastReset] = await Promise.all([
        getDeliveryCountersByFingerprint({ orderId, platformSlugLower: platformSlug, credentialFingerprint: fingerprint }),
        getLastCodeReset({ orderId, platformSlugLower: platformSlug, credentialFingerprint: fingerprint }),
    ]);

    return {
        ok: true,
        order: {
            subscriptionId: sub.subscriptionId,
            orderCode: sub.orderCode || null,
            status: sub.status,
            expiresAt: sub.expires_at,
            buyerEmail: sub.userEmail,
            platformSlug,
            platformName: sub.platformName || sub.platformSlug,
            platformAccountId: sub.platformAccountId,
            accountEmail: sub.accountEmail,
            accountProfile: sub.accountProfile || null,
        },
        counts: {
            totalAfterReset: counters.totalAfterReset,
            loginCodes: counters.loginCodes,
            temporaryCodes: counters.temporaryCodes,
            approvals: counters.approvals,
        },
        lastReset,
    };
}

async function resetCodeCounter({ orderNumber, adminUserId, requesterIp, userAgent, note }) {
    const snapshot = await getCodeResetSnapshot(orderNumber);
    if (!snapshot.ok) return snapshot;

    const order = snapshot.order;
    const sub = await getSubscriptionWithAccount(order.subscriptionId);
    const fingerprint = credFingerprint(sub.accountPassword, sub.accountPin);
    const cleanNote = String(note || "").trim().slice(0, 240);
    const message = cleanNote
        ? `RESET:admin-code-counter - ${cleanNote}`
        : "RESET:admin-code-counter";

    await pool.query("INSERT INTO code_deliveries SET ?", {
        requested_by_user_id: adminUserId || null,
        order_id: Number(order.subscriptionId),
        platform_slug: order.platformSlug,
        order_email: order.accountEmail || order.buyerEmail || "",
        requester_ip: String(requesterIp || ""),
        user_agent: userAgent || null,
        platform_account_id: order.platformAccountId || null,
        credential_fingerprint: fingerprint,
        delivered_code: null,
        status: "reset",
        message,
    });

    const fresh = await getCodeResetSnapshot(order.subscriptionId);
    return {
        ok: true,
        message: "Contador reiniciado correctamente.",
        before: snapshot.counts,
        ...fresh,
    };
}

module.exports = {
    getCodeResetSnapshot,
    resetCodeCounter,
};
