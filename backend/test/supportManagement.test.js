const assert = require("node:assert/strict");
const test = require("node:test");

const {
    MANAGEMENT_EXTENSION_THRESHOLD_MINUTES,
    getManagementMinutes,
    shouldGrantManagementExtension,
} = require("../src/services/supportManagement.service");

test("management time is measured from the first review event", () => {
    const minutes = getManagementMinutes({
        createdAt: "2026-08-11T10:00:00.000Z",
        firstInProgressAt: "2026-08-11T12:00:00.000Z",
        closedAt: "2026-08-11T17:01:00.000Z",
    });

    assert.equal(minutes, 301);
});

test("exactly five hours does not grant an extra day", () => {
    assert.equal(MANAGEMENT_EXTENSION_THRESHOLD_MINUTES, 300);
    assert.equal(shouldGrantManagementExtension({ managementMinutes: 300 }), false);
});

test("more than five hours grants one day only once", () => {
    assert.equal(shouldGrantManagementExtension({ managementMinutes: 301 }), true);
    assert.equal(shouldGrantManagementExtension({ managementMinutes: 301, alreadyGranted: true }), false);
});

