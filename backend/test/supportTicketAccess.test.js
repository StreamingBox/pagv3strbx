const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const routeSource = fs.readFileSync(path.join(__dirname, "../src/routes/supportTickets.js"), "utf8");
const { getSupportSubscriptionLookup } = require("../src/services/supportTicketAccess.service");

test("admins can create a support ticket for any existing subscription", () => {
    assert.deepEqual(getSupportSubscriptionLookup({ id: 10, role: "admin" }, 6715), {
        isAdmin: true,
        where: "s.id = ?",
        params: [6715],
    });
    assert.match(routeSource, /getSupportSubscriptionLookup\(req\.user, subscriptionId\)/);
    assert.match(routeSource, /const ticketOwnerId = Number\(subscription\.user_id\)/);
    assert.match(routeSource, /\[result\.insertId, userId, observation\]/);
});

test("regular users can only create support tickets for their own subscriptions", () => {
    assert.deepEqual(getSupportSubscriptionLookup({ id: 10, role: "user" }, 6715), {
        isAdmin: false,
        where: "s.id = ? AND s.user_id = ?",
        params: [6715, 10],
    });
});
