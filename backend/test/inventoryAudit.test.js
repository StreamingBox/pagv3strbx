const assert = require("node:assert/strict");
const test = require("node:test");
const { buildAuditRows, normalizeAuditRules } = require("../src/services/inventoryAudit.service");

const rules = [{ platformId: 11, expectedProfiles: 5 }];

test("normalizes profile references and removes repeated platforms", () => {
    assert.deepEqual(normalizeAuditRules([
        { platformId: 11, expectedProfiles: 5 },
        { platform_id: 11, expected_profiles: 7 },
    ]), [{ platformId: 11, expectedProfiles: 7 }]);
});

test("marks a complete account when every expected profile is available or has a current subscription", () => {
    const rows = buildAuditRows([
        { account_id: 1, platform_id: 11, platform_name: "Netflix", account_email: "one@example.com", profile_number: 1, status: "available" },
        { account_id: 2, platform_id: 11, platform_name: "Netflix", account_email: "one@example.com", profile_number: 2, status: "assigned", has_active_subscription: 1 },
        { account_id: 3, platform_id: 11, platform_name: "Netflix", account_email: "one@example.com", profile_number: 3, status: "sold", has_active_subscription: 1 },
        { account_id: 4, platform_id: 11, platform_name: "Netflix", account_email: "one@example.com", profile_number: 4, status: "available" },
        { account_id: 5, platform_id: 11, platform_name: "Netflix", account_email: "one@example.com", profile_number: 5, status: "available" },
    ], rules);
    assert.equal(rows[0].classification, "complete");
    assert.deepEqual(rows[0].missingProfiles, []);
    assert.deepEqual(rows[0].coveredProfiles, [1, 2, 3, 4, 5]);
});

test("reports missing, duplicate and invalid profiles as an exception", () => {
    const rows = buildAuditRows([
        { account_id: 10, platform_id: 11, platform_name: "Netflix", account_email: "two@example.com", profile_number: 1, status: "available" },
        { account_id: 11, platform_id: 11, platform_name: "Netflix", account_email: "two@example.com", profile_number: 1, status: "assigned" },
        { account_id: 12, platform_id: 11, platform_name: "Netflix", account_email: "two@example.com", profile_number: 6, status: "available" },
        { account_id: 13, platform_id: 11, platform_name: "Netflix", account_email: "two@example.com", profile_number: 2, status: "inactive" },
    ], rules);
    assert.equal(rows[0].classification, "exception");
    assert.deepEqual(rows[0].duplicateProfiles, [1]);
    assert.deepEqual(rows[0].invalidProfiles, [6]);
    assert.deepEqual(rows[0].missingProfiles, [3, 4, 5]);
    assert.deepEqual(rows[0].uncoveredProfiles, [2]);
});

test("does not count an assigned profile without a current subscription or legacy assignment", () => {
    const rows = buildAuditRows([
        { account_id: 30, platform_id: 11, platform_name: "Netflix", account_email: "legacy@example.com", profile_number: 1, status: "assigned" },
        { account_id: 31, platform_id: 11, platform_name: "Netflix", account_email: "legacy@example.com", profile_number: 2, status: "available" },
        { account_id: 32, platform_id: 11, platform_name: "Netflix", account_email: "legacy@example.com", profile_number: null, status: "" },
    ], rules);
    assert.equal(rows[0].classification, "exception");
    assert.deepEqual(rows[0].coveredProfiles, [2]);
    assert.deepEqual(rows[0].uncoveredProfiles, [1]);
    assert.deepEqual(rows[0].unprofiledRecords, [32]);
});

test("keeps master-down accounts visible but excludes them from exceptions", () => {
    const rows = buildAuditRows([
        { account_id: 20, platform_id: 11, platform_name: "Netflix", account_email: "down@example.com", profile_number: 1, status: "inactive", master_status: "inactive", master_note: "Cuenta caida" },
    ], rules);
    assert.equal(rows[0].classification, "excluded_down");
    assert.equal(rows[0].masterMarkedDown, true);
    assert.deepEqual(rows[0].reviewReasons, ["cuenta maestra marcada como caida"]);
});
