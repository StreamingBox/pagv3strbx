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
            assert.match(sql, /NOT \(\s*EXISTS \([\s\S]*provider_reported_at IS NOT NULL/);
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

test("checkout prioritizes flagged accounts within each platform but keeps direct stock before fallbacks", async () => {
    const conn = {
        async query(sql, params) {
            if (/FROM platform_fallbacks/.test(sql)) {
                return [[{ fallback_platform_id: 20 }]];
            }

            assert.match(sql, /ORDER BY FIELD\(pa\.platform_id, \?,\?\), pa\.sale_priority DESC, RAND\(\), pa\.id ASC/);
            assert.match(sql, /NOT \(\s*EXISTS \([\s\S]*provider_reported_at IS NOT NULL/);
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

    const result = await findAvailableAccountForPlatform(conn, 10, { prioritizeSale: true });

    assert.equal(result.account.id, 901);
    assert.equal(result.deliveredPlatformId, 10);
    assert.equal(result.usedFallback, false);
});

test("replacement and support stock do not opt into sale priority", async () => {
    let selectionSql = "";
    const conn = {
        async query(sql) {
            if (/FROM platform_fallbacks/.test(sql)) return [[]];
            selectionSql = sql;
            return [[{
                id: 902,
                platform_id: 10,
                email: "ordinary@example.test",
                password: "placeholder",
                delivered_platform_name: "Plan original",
                delivered_platform_slug: "plan-original",
            }]];
        },
    };

    await findAvailableAccountForPlatform(conn, 10);

    assert.match(selectionSql, /ORDER BY FIELD\(pa\.platform_id, \?\), RAND\(\), pa\.id ASC/);
    assert.doesNotMatch(selectionSql, /pa\.sale_priority/);
});

test("support replacement excludes accounts marked inactive in master accounts", async () => {
    const conn = {
        async query(sql, params) {
            if (/FROM platform_fallbacks/.test(sql)) {
                return [[]];
            }

            assert.match(sql, /FROM master_accounts ma/);
            assert.match(sql, /LOWER\(TRIM\(COALESCE\(pa\.email/);
            assert.deepEqual(params, [901, 0, 10, "failed@example.com"]);
            return [[]];
        },
    };

    const result = await findAvailableAccountForPlatform(conn, 10, {
        accountId: 901,
        excludeAccountId: 0,
        excludeAccountEmail: "failed@example.com",
        excludeInactiveMasterAccounts: true,
    });

    assert.equal(result, null);
});
