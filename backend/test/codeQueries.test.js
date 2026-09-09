const assert = require("node:assert/strict");
const test = require("node:test");
const pool = require("../src/db");
const { getDeliveryCountersByFingerprint } = require("../src/services/codeQueries");

test("approval counters include delivered Netflix approval links", async () => {
    const originalQuery = pool.query;
    const calls = [];
    pool.query = async (sql, params) => {
        calls.push({ sql, params });
        return [[{
            totalAfterReset: 1,
            loginCodes: 0,
            temporaryCodes: 0,
            approvals: 1,
        }]];
    };

    try {
        const counters = await getDeliveryCountersByFingerprint({
            orderId: 5735,
            platformSlugLower: "netflix",
            credentialFingerprint: "fingerprint",
        });

        assert.deepEqual(counters, {
            totalAfterReset: 1,
            loginCodes: 0,
            temporaryCodes: 0,
            approvals: 1,
        });
        assert.match(calls[0].sql, /action = 'approve'/);
        assert.match(calls[0].sql, /message LIKE 'OK:approve%'/);
    } finally {
        pool.query = originalQuery;
    }
});
