const assert = require("node:assert/strict");
const test = require("node:test");

const {
    assertActiveSupportSubscription,
} = require("../src/services/supportSubscriptionEligibility.service");

test("active subscriptions can be escalated to support review", () => {
    assert.doesNotThrow(() => assertActiveSupportSubscription({
        status: "active",
        expires_at: "2099-12-31",
    }));
});

test("inactive subscriptions cannot be escalated to support review", () => {
    assert.throws(
        () => assertActiveSupportSubscription({
            status: "expired",
            expires_at: "2099-12-31",
        }, { inactiveMessage: "El pedido ya no esta activo." }),
        (error) => error.status === 409
            && error.code === "SUBSCRIPTION_INACTIVE"
            && error.message === "El pedido ya no esta activo."
    );
});

test("expired active subscriptions cannot be escalated to support review", () => {
    assert.throws(
        () => assertActiveSupportSubscription({
            status: "active",
            effective_expires_at: "2000-01-01",
        }, { expiredMessage: "El pedido ya vencio." }),
        (error) => error.status === 409
            && error.code === "SUBSCRIPTION_EXPIRED"
            && error.message === "El pedido ya vencio."
    );
});
