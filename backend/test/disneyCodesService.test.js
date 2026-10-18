const assert = require("node:assert/strict");
const test = require("node:test");
const codeQueries = require("../src/services/codeQueries");
const gmailCodeService = require("../src/services/gmailCodeService");
const reservations = require("../src/services/codeRequestReservation.service");

let deliveredCount = 0;
let reservationCalls = [];
let gmailCalls = 0;
let purchaseAgeMinutes = 2;

codeQueries.getCodePlatformBySlug = async () => ({
    slug: "disney",
    gmail_from: "disneyplus.com",
    is_active: 1,
});
codeQueries.getSubscriptionWithAccount = async () => ({
    subscriptionId: 901,
    userId: 77,
    status: "active",
    expires_at: "2099-12-31",
    userEmail: "buyer@example.test",
    platformSlug: "Disney+",
    platformName: "Disney+",
    platformAccountId: 88,
    accountEmail: "client@example.test",
    accountPassword: "synthetic-account-password",
    accountPin: "1234",
    purchaseOrderId: 5001,
    purchaseCreatedAt: new Date(Date.now() - purchaseAgeMinutes * 60 * 1000),
});
codeQueries.getProviderForNetflixAccountEmail = async () => null;
codeQueries.countDeliveredByFingerprint = async () => 0;
codeQueries.countDisneyDeliveredForPurchase = async () => deliveredCount;
codeQueries.getLastCodeReset = async () => null;
reservations.reserveCodeRequest = async (args) => {
    reservationCalls.push(args);
    return { id: 1 };
};
gmailCodeService.fetchDisneyCodeFromGmail = async () => {
    gmailCalls += 1;
    return { ok: true, code: "654321" };
};

const { requestCodeForOrder } = require("../src/services/codesService");

test("an admin cannot bypass a Disney code already delivered for the purchase", async () => {
    deliveredCount = 1;
    reservationCalls = [];
    gmailCalls = 0;

    const result = await requestCodeForOrder({
        orderNumber: 901,
        platformSlug: "disney",
        user: { id: 10, role: "admin" },
    });

    assert.equal(result.http, 429);
    assert.equal(result.body.status, "code_already_delivered");
    assert.equal(gmailCalls, 0);
    assert.equal(reservationCalls.length, 0);
});

test("the first Disney delivery reserves a purchase-scoped slot even for an admin", async () => {
    deliveredCount = 0;
    reservationCalls = [];
    gmailCalls = 0;

    const result = await requestCodeForOrder({
        orderNumber: 901,
        platformSlug: "disney",
        user: { id: 10, role: "admin" },
    });

    assert.equal(result.http, 200);
    assert.equal(result.body.code, "654321");
    assert.equal(gmailCalls, 1);
    assert.equal(reservationCalls.length, 1);
    assert.equal(reservationCalls[0].orderId, 901);
    assert.equal(reservationCalls[0].platformSlug, "disney");
    assert.equal(reservationCalls[0].resetMarker, 5001);
    assert.equal(reservationCalls[0].allowCompletedReuse, false);
});

test("allows a buyer to request the first Disney code twelve minutes after purchase", async () => {
    purchaseAgeMinutes = 12;
    deliveredCount = 0;
    reservationCalls = [];
    gmailCalls = 0;

    const result = await requestCodeForOrder({
        orderNumber: 901,
        platformSlug: "disney",
        user: { id: 77, role: "user" },
    });

    assert.equal(result.http, 200);
    assert.equal(gmailCalls, 1);
    assert.equal(reservationCalls.length, 1);
});

test("rejects Disney requests after fifteen minutes before opening the mailbox", async () => {
    purchaseAgeMinutes = 16;
    deliveredCount = 0;
    reservationCalls = [];
    gmailCalls = 0;

    const result = await requestCodeForOrder({
        orderNumber: 901,
        platformSlug: "disney",
        user: { id: 77, role: "user" },
    });

    assert.equal(result.http, 410);
    assert.equal(result.body.status, "purchase_window_expired");
    assert.match(result.body.message, /15 minutos/);
    assert.equal(gmailCalls, 0);
    assert.equal(reservationCalls.length, 0);
});
