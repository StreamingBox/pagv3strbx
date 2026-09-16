const express = require("express");

const requireAuth = require("../middleware/requireAuth");
const { getSubscriptionWithAccount } = require("../services/codeQueries");
const { toCodeSlug } = require("../utils/platformSlugMap");
const { isStoredDateOnlyExpired } = require("../utils/date");

const router = express.Router();

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

/**
 * POST /tv-setup/validate
 * Validates the TV code and returns only the data needed to continue in Netflix.
 * The login code itself is requested later through /codes/netflix/request so the
 * existing Netflix limits, provider selection and delivery log remain canonical.
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
        const subscription = await getSubscriptionWithAccount(subscriptionId);
        if (!subscription) {
            return res.status(404).json({
                ok: false,
                status: "subscription_missing",
                message: `Pedido #${subscriptionId} no encontrado.`,
            });
        }

        if (!isAdmin(req.user) && Number(subscription.userId) !== Number(req.user?.id)) {
            return res.status(403).json({
                ok: false,
                status: "unauthorized",
                message: "Ese pedido no pertenece a tu cuenta.",
            });
        }

        if (toCodeSlug(subscription.platformSlug) !== "netflix") {
            return res.status(400).json({
                ok: false,
                status: "platform_mismatch",
                message: "Este flujo solo está disponible para pedidos de Netflix.",
            });
        }

        if (!subscription.platformAccountId || !subscription.accountEmail) {
            return res.status(400).json({
                ok: false,
                status: "no_account",
                message: "Este pedido aún no tiene una cuenta asignada.",
            });
        }

        const active = String(subscription.status || "").trim().toLowerCase() === "active";
        const notExpired = !subscription.expires_at || !isStoredDateOnlyExpired(subscription.expires_at);
        if (!active || !notExpired) {
            return res.status(400).json({
                ok: false,
                status: "subscription_inactive",
                message: "El pedido de Netflix no está activo o ya venció.",
            });
        }

        return res.json({
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
            loginCodeAction: "code",
            sharesLoginCodeCounter: true,
        });
    } catch (error) {
        console.error("[tv-setup] validation error", error);
        return res.status(500).json({
            ok: false,
            status: "internal_error",
            message: "No fue posible validar el pedido. Intenta nuevamente.",
        });
    }
});

if (process.env.NODE_ENV !== "production") {
    router.get("/tv-setup/_ping", (req, res) => res.json({ ok: true, mounted: true }));
}

module.exports = router;
