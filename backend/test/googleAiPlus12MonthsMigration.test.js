const assert = require("node:assert/strict");
const test = require("node:test");
const migration = require("../src/migrations/063_google_ai_plus_12_months");

test("Google AI PLUS 12 months creates an assisted annual COP offer at 15,000 idempotently", async () => {
    const state = { platform: null, price: null, inserts: { platform: 0, price: 0 } };
    const query = async (sql, params = []) => {
        if (sql.startsWith("SELECT id FROM durations")) return [[{ id: 3 }]];
        if (sql.startsWith("SELECT id FROM categories")) return [[{ id: 3 }]];
        if (sql.startsWith("SELECT id FROM platforms")) {
            return [[state.platform ? { id: state.platform.id } : undefined].filter(Boolean)];
        }
        if (sql.startsWith("INSERT INTO platforms")) {
            state.platform = { id: 61, name: params[0], slug: params[1], categoryId: params[2], type: "correo", details: params[3] };
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
            state.price = { id: 667, platformId: params[0], durationId: params[1], price: 15000 };
            state.inserts.price += 1;
            return [{ insertId: state.price.id }];
        }
        if (sql.startsWith("UPDATE platform_prices")) {
            state.price.price = 15000;
            return [{}];
        }
        throw new Error(`Unexpected SQL in migration test: ${sql}`);
    };

    await migration.up({ query });
    await migration.up({ query });

    assert.equal(migration.id, "063_google_ai_plus_12_months");
    assert.equal(state.platform.name, "Google AI PLUS 12 meses");
    assert.equal(state.platform.slug, "google-ai-plus-12-meses");
    assert.equal(state.platform.categoryId, 3);
    assert.equal(state.platform.type, "correo");
    assert.match(state.platform.details, /12 meses \(365 días\)/);
    assert.match(state.platform.details, /400 GB/);
    assert.match(state.platform.details, /WhatsApp/);
    assert.match(state.platform.details, /\*\*IMPORTANTE:.*\$4\.000 COP\.\*\*/);
    assert.match(state.platform.details, /\*\*PRUEBA:.*planes activos\.\*\*/);
    assert.equal(state.price.durationId, 3);
    assert.equal(state.price.price, 15000);
    assert.deepEqual(state.inserts, { platform: 1, price: 1 });
});

test("Google AI PLUS 12 months migration stops if no active 365-day duration exists", async () => {
    await assert.rejects(
        migration.up({ query: async () => [[]] }),
        /duración anual activa de 365 días/
    );
});
