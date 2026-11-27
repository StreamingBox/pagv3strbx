const assert = require("node:assert/strict");
const test = require("node:test");
const codeQueries = require("../src/services/codeQueries");
const gmailCodeService = require("../src/services/gmailCodeService");
const reservations = require("../src/services/codeRequestReservation.service");

let gmailCalls = [];

codeQueries.getCodePlatformBySlug = async () => ({
    slug: "appletv",
    gmail_from: "apple.com",
    is_active: 1,
});
codeQueries.getSubscriptionWithAccount = async () => ({
    subscriptionId: 902,
    userId: 77,
    status: "active",
    expires_at: "2099-12-31",
    userEmail: "buyer@example.test",
    platformSlug: "Apple TV",
    platformName: "Apple TV",
    platformAccountId: 89,
    accountEmail: "apple-account@example.test",
    accountPassword: "synthetic-password",
    accountPin: "",
});
codeQueries.getProviderForNetflixAccountEmail = async () => null;
codeQueries.countDeliveredByFingerprint = async () => 0;
codeQueries.countDisneyDeliveredForPurchase = async () => 0;
codeQueries.getLastCodeReset = async () => null;
reservations.reserveCodeRequest = async () => ({ id: 2 });
gmailCodeService.fetchAppleTvCodeFromGmail = async (args) => {
    gmailCalls.push(args);
    return { ok: true, code: "604218" };
};

const { requestCodeForOrder } = require("../src/services/codesService");

test("Apple TV order requests use the assigned account email and return its display name", async () => {
    gmailCalls = [];

    const result = await requestCodeForOrder({
        orderNumber: 902,
        platformSlug: "Apple TV",
        user: { id: 77, role: "user" },
    });

    assert.equal(result.http, 200);
    assert.equal(result.body.platform, "Apple TV");
    assert.equal(result.body.code, "604218");
    assert.deepEqual(gmailCalls, [{ toEmail: "apple-account@example.test" }]);
});
