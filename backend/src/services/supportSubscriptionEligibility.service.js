const { isStoredDateOnlyExpired } = require("../utils/date");

function supportEligibilityError(message, code) {
    const error = new Error(message);
    error.status = 409;
    error.code = code;
    return error;
}

function assertActiveSupportSubscription(subscription, options = {}) {
    const status = String(subscription?.status || "").trim().toLowerCase();
    if (status !== "active") {
        throw supportEligibilityError(
            options.inactiveMessage || "El pedido ya no esta activo.",
            "SUBSCRIPTION_INACTIVE"
        );
    }

    const expiresAt = subscription?.effective_expires_at ?? subscription?.expires_at;
    if (!expiresAt || isStoredDateOnlyExpired(expiresAt)) {
        throw supportEligibilityError(
            options.expiredMessage || "El pedido ya esta vencido.",
            "SUBSCRIPTION_EXPIRED"
        );
    }
}

module.exports = { assertActiveSupportSubscription };
