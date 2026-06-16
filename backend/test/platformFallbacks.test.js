const test = require("node:test");
const assert = require("node:assert/strict");

const {
    findAvailableAccountForPlatform,
    getCandidatePlatformsForPlatform,
} = require("../src/services/platformFallbacks.service");

test("replacement candidates preserve historical delivered platforms after fallback removal", async () => {
    const conn = {
        async query(sql) {
            assert.match(sql, /FROM platform_fallbacks/);
            return [[
                { fallback_platform_id: 30 },
                { fallback_platform_id: 20 },
            ]];
        },
    };

    const candidates = await getCandidatePlatformsForPlatform(conn, 10, [20, 10, null]);

    assert.deepEqual(candidates, [
        { platformId: 10, source: "requested" },
        { platformId: 20, source: "historical" },
        { platformId: 30, source: "fallback" },
    ]);
});

test("support replacement can select stock from a removed historical equivalence", async () => {
    const queries = [];
    const conn = {
        async query(sql, params) {
            queries.push({ sql, params });
            if (/FROM platform_fallbacks/.test(sql)) return [[]];

            assert.match(sql, /pa\.platform_id IN \(\?,\?\)/);
            assert.deepEqual(params, [900, 0, 10, 20]);
            return [[{
                id: 900,
                platform_id: 20,
                email: "prime@example.com",
                password: "secret",
                delivered_platform_name: "Prime Video",
                delivered_platform_slug: "prime-video",
            }]];
        },
    };

    const result = await findAvailableAccountForPlatform(conn, 10, {
        accountId: 900,
        additionalPlatformIds: [20],
    });

    assert.equal(queries.length, 2);
    assert.equal(result.account.id, 900);
    assert.equal(result.deliveredPlatformId, 20);
    assert.equal(result.usedFallback, true);
});

test("regular checkout still prioritizes direct stock before active fallbacks", async () => {
    const conn = {
        async query(sql, params) {
            if (/FROM platform_fallbacks/.test(sql)) {
                return [[{ fallback_platform_id: 20 }]];
            }

            assert.match(sql, /ORDER BY FIELD\(pa\.platform_id, \?,\?\), RAND\(\), pa\.id ASC/);
            assert.deepEqual(params, [0, 10, 20, 10, 20]);
            return [[{
                id: 901,
                platform_id: 10,
                email: "direct@example.com",
                password: "secret",
                delivered_platform_name: "Plan original",
                delivered_platform_slug: "plan-original",
            }]];
        },
    };

    const result = await findAvailableAccountForPlatform(conn, 10);

    assert.equal(result.account.id, 901);
    assert.equal(result.deliveredPlatformId, 10);
    assert.equal(result.usedFallback, false);
});
