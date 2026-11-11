const assert = require("node:assert/strict");
const test = require("node:test");

const {
    assertUserCanPurchasePlatforms,
    getRestrictedPlatformIds,
} = require("../src/services/userPlatformRestrictions.service");
const { renewSubscription } = require("../src/services/renewal.service");
const migration = require("../src/migrations/065_user_platform_purchase_restrictions");

test("loads only restriction IDs for the authenticated user", async () => {
    const calls = [];
    const queryable = {
        async query(sql, params) {
            calls.push({ sql, params });
            return [[{ platform_id: 12 }, { platform_id: 15 }]];
        },
    };

    const ids = await getRestrictedPlatformIds(queryable, "42");

    assert.deepEqual([...ids], [12, 15]);
    assert.deepEqual(calls, [{
        sql: "SELECT platform_id FROM user_platform_purchase_restrictions WHERE user_id = ?",
        params: [42],
    }]);
});

test("checkout restriction rejects blocked platforms but allows other platforms", async () => {
    const queryable = {
        async query() {
            return [[{ platform_id: 12 }]];
        },
    };

    await assert.rejects(
        assertUserCanPurchasePlatforms(queryable, 42, [5, 12]),
        (error) => error.status === 409 && error.code === "USER_PLATFORM_UNAVAILABLE"
    );
    await assert.doesNotReject(assertUserCanPurchasePlatforms(queryable, 42, [5]));
});

test("restriction migration creates a durable indexed user-platform mapping", async () => {
    let statement = "";
    await migration.up({ query: async (sql) => { statement = sql; } });

    assert.match(statement, /CREATE TABLE IF NOT EXISTS user_platform_purchase_restrictions/);
    assert.match(statement, /PRIMARY KEY \(user_id, platform_id\)/);
    assert.match(statement, /INDEX idx_user_platform_purchase_restrictions_platform \(platform_id\)/);
});

test("customer renewal is rejected for a restricted platform before any writes", async () => {
    const queries = [];
    const conn = {
        async query(sql) {
            queries.push(sql);
            if (sql.includes("SELECT s.id, s.user_id")) {
                return [[{
                    id: 31,
                    user_id: 42,
                    platform_id: 12,
                    strbx_provider_reported: 0,
                }]];
            }
            if (sql.includes("COUNT(*) AS renewal_count")) return [[{ renewal_count: 0 }]];
            if (sql.includes("user_platform_purchase_restrictions")) return [[{ platform_id: 12 }]];
            throw new Error("Renewal must stop before writing data");
        },
    };

    await assert.rejects(
        renewSubscription({
            conn,
            subscriptionId: 31,
            actorUserId: 42,
            actorRole: "user",
            customerInitiated: true,
        }),
        (error) => error.status === 409 && error.code === "USER_PLATFORM_UNAVAILABLE"
    );
    assert.equal(queries.length, 3);
});
