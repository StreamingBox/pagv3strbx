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
        { account_id: 11, platform_id: 11, platform_name: "Netflix", account_email: "two@example.com", profile_number: 1, status: "assigned", has_active_subscription: 1 },
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

const provider = { id: 90, platform_id: 11, platform_name: "Netflix", account_email: "stock@example.com", provider_id: 4, provider_name: "StoreTools", status: "active", provider_active: 1 };
const profile = (number, extra = {}) => ({ account_id: number, platform_id: 11, platform_name: "Netflix", account_email: "stock@example.com", profile_number: number, status: "available", ...extra });

test("separates free, occupied, missing and replaced profiles without treating a replacement as a vacancy", () => {
    const [row] = buildAuditRows([
        profile(1),
        profile(2, { status: "assigned", has_active_subscription: 1 }),
        profile(3, { status: "sold", has_replacement_out: 1, has_legacy_active_assignment: 1 }),
        profile(5, { status: "down" }),
    ], rules, [provider]);
    assert.deepEqual(row.freeProfiles, [1]);
    assert.deepEqual(row.occupiedProfiles, [2]);
    assert.deepEqual(row.profiles.map((item) => item.state), ["free", "occupied", "replaced", "missing", "unavailable"]);
    assert.equal(row.providerId, 4);
    assert.equal(row.accountActive, true);
});

test("an inactive provider account is excluded even when inventory claims it has free profiles", () => {
    const [row] = buildAuditRows([profile(1)], rules, [{ ...provider, status: "inactive" }]);
    assert.equal(row.accountActive, false);
    assert.equal(row.excludedReason, "provider_inactive");
});

test("uses the latest provider record including deactivation and excludes expired accounts and disabled providers", () => {
    const records = [profile(1)];
    assert.equal(buildAuditRows(records, rules, [provider, { ...provider, id: 91, status: "inactive" }])[0].accountActive, false);
    assert.equal(buildAuditRows(records, rules, [{ ...provider, provider_expired: 1 }])[0].excludedReason, "provider_expired");
    assert.equal(buildAuditRows(records, rules, [{ ...provider, provider_active: 0 }])[0].accountActive, false);
});

test("matches provider and profile records across Netflix variants and trimmed email casing", () => {
    const international = { ...provider, platform_id: 18, platform_name: "Netflix Internacional", account_email: " STOCK@example.com " };
    const [row] = buildAuditRows([profile(1), profile(2, { platform_id: 18, platform_name: "Netflix Internacional" })], [...rules, { platformId: 18, expectedProfiles: 5 }], [international]);
    assert.equal(row.platformId, 18);
    assert.equal(row.providerName, "StoreTools");
    assert.deepEqual(row.freeProfiles, [1, 2]);
    assert.equal(row.expectedProfiles, 5);
});

test("a provider account without loaded inventory has missing profiles rather than sellable slots", () => {
    const [row] = buildAuditRows([], rules, [provider]);
    assert.deepEqual(row.freeProfiles, []);
    assert.deepEqual(row.missingProfiles, [1, 2, 3, 4, 5]);
    assert.equal(row.availability, "review");
});

test("free inventory cannot override a live subscription on the same profile, even on another record", () => {
    const [row] = buildAuditRows([profile(1), profile(1, { account_id: 19, status: "sold", has_active_subscription: 1 })], rules, [provider]);
    assert.deepEqual(row.freeProfiles, []);
    assert.deepEqual(row.occupiedProfiles, [1]);
});

test("duplicate free records, expired stock and lingering user assignments require review", () => {
    const [row] = buildAuditRows([profile(1), profile(1, { account_id: 19 }), profile(2, { profile_expired: 1 }), profile(3, { assigned_to_user_id: 7 })], rules, [provider]);
    assert.deepEqual(row.freeProfiles, []);
    assert.deepEqual(row.profiles.slice(0, 3).map((item) => item.state), ["review", "review", "review"]);
});

test("an explicitly reloaded replacement profile can be free again", () => {
    const [row] = buildAuditRows([profile(1, { has_replacement_out: 1 })], rules, [provider]);
    assert.deepEqual(row.freeProfiles, [1]);
});

test("historical replaced records do not make a current profile a duplicate", () => {
    const [row] = buildAuditRows([profile(1), profile(1, { account_id: 19, status: "sold", has_replacement_out: 1 })], rules, [provider]);
    assert.deepEqual(row.freeProfiles, [1]);
    assert.deepEqual(row.duplicateProfiles, []);
});

test("auditing Netflix Internacional still reads profiles stored under Netflix", () => {
    const international = { ...provider, platform_id: 18, platform_name: "Netflix Internacional" };
    const [row] = buildAuditRows([profile(1)], [{ platformId: 18, expectedProfiles: 5 }], [international]);
    assert.equal(row.platformId, 18);
    assert.deepEqual(row.freeProfiles, [1]);
});

test("groups Netflix, Netflix Internacional and Promo profiles into one account", () => {
    const international = (number) => profile(number, { platform_id: 18, platform_name: "Netflix Internacional" });
    const promo = (number) => profile(number, { platform_id: 19, platform_name: "Promo" });
    const promoProvider = { ...provider, platform_id: 19, platform_name: "Promo" };
    const [row] = buildAuditRows([
        profile(1),
        international(2),
        promo(3),
        international(4),
        promo(5),
    ], [{ platformId: 19, expectedProfiles: 5 }], [promoProvider]);

    assert.deepEqual(row.freeProfiles, [1, 2, 3, 4, 5]);
    assert.deepEqual(row.coveredProfiles, [1, 2, 3, 4, 5]);
    assert.deepEqual(row.accountIds, [1, 2, 3, 4, 5]);
    assert.equal(row.expectedProfiles, 5);
});

test("an active delivery without a profile number prevents advertising ambiguous free slots", () => {
    const [row] = buildAuditRows([profile(1), profile(null, { account_id: 19, status: "assigned", has_active_subscription: 1 })], rules, [provider]);
    assert.deepEqual(row.freeProfiles, []);
    assert.equal(row.profiles[0].state, "review");
    assert.ok(row.reviewReasons.includes("asignacion vigente sin perfil identificado"));
});
