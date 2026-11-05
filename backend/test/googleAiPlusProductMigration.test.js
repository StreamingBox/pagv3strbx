const assert = require("node:assert/strict");
const test = require("node:test");
const migration = require("../src/migrations/061_google_ai_plus");

test("Google AI PLUS creates an assisted quarterly COP offer at 8,000 and is idempotent", async () => {
    const state = { platform: null, price: null, inserts: { platform: 0, price: 0 } };
    const query = async (sql, params = []) => {
        if (sql.startsWith("SELECT id FROM durations")) return [[{ id: 90 }]];
        if (sql.startsWith("SELECT id FROM categories")) return [[{ id: 3 }]];
        if (sql.startsWith("SELECT id FROM platforms")) {
            return [[state.platform ? { id: state.platform.id } : undefined].filter(Boolean)];
        }
        if (sql.startsWith("INSERT INTO platforms")) {
            state.platform = { id: 1, name: params[0], slug: params[1], categoryId: params[2], details: params[3] };
            state.inserts.platform += 1;
            return [{ insertId: state.platform.id }];
        }
        if (sql.startsWith("UPDATE platforms")) {
            state.platform = { ...state.platform, name: params[0], categoryId: params[1], details: params[2] };
            return [{}];
        }
        if (sql.startsWith("SELECT id FROM platform_prices")) {
            return [[state.price ? { id: state.price.id } : undefined].filter(Boolean)];
        }
        if (sql.startsWith("INSERT INTO platform_prices")) {
            state.price = { id: 2, platformId: params[0], durationId: params[1], price: 8000 };
            state.inserts.price += 1;
            return [{ insertId: state.price.id }];
        }
        if (sql.startsWith("UPDATE platform_prices")) {
            state.price.price = 8000;
            return [{}];
        }
        throw new Error(`Unexpected SQL in migration test: ${sql}`);
    };

    await migration.up({ query });
    await migration.up({ query });

    assert.equal(migration.id, "061_google_ai_plus");
    assert.equal(state.platform.name, "Google AI PLUS");
    assert.equal(state.platform.slug, "google-ai-plus");
    assert.equal(state.platform.categoryId, 3);
    assert.match(state.platform.details, /400 GB/);
    assert.match(state.platform.details, /\*\*IMPORTANTE:.*\$4\.000 COP\.\*\*/);
    assert.equal(state.price.durationId, 90);
    assert.equal(state.price.price, 8000);
    assert.deepEqual(state.inserts, { platform: 1, price: 1 });
});

test("Google AI PLUS migration stops without an active quarterly duration", async () => {
    await assert.rejects(
        migration.up({ query: async () => [[]] }),
        /duración activa de 90 días/
    );
});
