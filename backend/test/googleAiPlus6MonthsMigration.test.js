const assert = require("node:assert/strict");
const test = require("node:test");
const migration = require("../src/migrations/066_google_ai_plus_6_months");

test("Google AI PLUS 6 months creates a separate assisted offer at 10,000 COP idempotently", async () => {
    const state = {
        durations: [],
        platforms: new Map([[
            "google-ai-plus",
            { id: 10, name: "Google AI PLUS", details: "Duración: 3 meses (90 días)" },
        ]]),
        price: null,
        inserts: { duration: 0, platform: 0, price: 0 },
    };

    const query = async (sql, params = []) => {
        if (sql.startsWith("SELECT id FROM categories")) return [[{ id: 3 }]];
        if (sql.startsWith("SELECT id FROM durations WHERE days = 180 AND is_active = 1")) {
            return [state.durations.filter((duration) => duration.is_active).map(({ id }) => ({ id })).slice(0, 1)];
        }
        if (sql.startsWith("SELECT id FROM durations WHERE days = 180 ORDER BY")) {
            return [state.durations.map(({ id }) => ({ id })).slice(0, 1)];
        }
        if (sql.startsWith("INSERT INTO durations")) {
            state.durations.push({ id: 180, name: "Semestral", days: 180, is_active: 1 });
            state.inserts.duration += 1;
            return [{ insertId: 180 }];
        }
        if (sql.startsWith("SELECT id FROM platforms")) {
            const platform = state.platforms.get(params[0]);
            return [platform ? [{ id: platform.id }] : []];
        }
        if (sql.startsWith("INSERT INTO platforms")) {
            const platform = { id: 61, name: params[0], slug: params[1], categoryId: params[2], type: "correo", details: params[3] };
            state.platforms.set(platform.slug, platform);
            state.inserts.platform += 1;
            return [{ insertId: platform.id }];
        }
        if (sql.startsWith("UPDATE platforms")) {
            const platform = [...state.platforms.values()].find(({ id }) => id === params[3]);
            Object.assign(platform, { name: params[0], categoryId: params[1], details: params[2] });
            return [{}];
        }
        if (sql.startsWith("SELECT id FROM platform_prices")) {
            return [state.price ? [{ id: state.price.id }] : []];
        }
        if (sql.startsWith("INSERT INTO platform_prices")) {
            state.price = { id: 667, platformId: params[0], durationId: params[1], price: 10000 };
            state.inserts.price += 1;
            return [{ insertId: state.price.id }];
        }
        if (sql.startsWith("UPDATE platform_prices")) {
            state.price.price = 10000;
            return [{}];
        }
        throw new Error(`Unexpected SQL in migration test: ${sql}`);
    };

    await migration.up({ query });
    await migration.up({ query });

    const quarterly = state.platforms.get("google-ai-plus");
    const semester = state.platforms.get("google-ai-plus-6-meses");
    assert.equal(migration.id, "066_google_ai_plus_6_months");
    assert.equal(quarterly.name, "Google AI PLUS");
    assert.equal(quarterly.details, "Duración: 3 meses (90 días)");
    assert.equal(semester.name, "Google AI PLUS 6 meses");
    assert.equal(semester.categoryId, 3);
    assert.equal(semester.type, "correo");
    assert.match(semester.details, /6 meses \(180 días\)/);
    assert.match(semester.details, /400 GB/);
    assert.match(semester.details, /WhatsApp/);
    assert.match(semester.details, /\*\*IMPORTANTE:.*\$4\.000 COP\.\*\*/);
    assert.match(semester.details, /\*\*PRUEBA:.*planes activos\.\*\*/);
    assert.match(semester.details, /\*\*Garantía de activación\*\*/);
    assert.equal(state.price.durationId, 180);
    assert.equal(state.price.price, 10000);
    assert.deepEqual(state.inserts, { duration: 1, platform: 1, price: 1 });
});

test("Google AI PLUS 6 months stops rather than reactivating a dormant 180-day duration", async () => {
    const calls = [];
    await assert.rejects(
        migration.up({
            query: async (sql) => {
                calls.push(sql);
                if (sql.startsWith("SELECT id FROM categories")) return [[{ id: 3 }]];
                if (sql.startsWith("SELECT id FROM durations WHERE days = 180 AND is_active = 1")) return [[]];
                if (sql.startsWith("SELECT id FROM durations WHERE days = 180 ORDER BY")) return [[{ id: 22 }]];
                throw new Error(`Unexpected SQL in migration test: ${sql}`);
            },
        }),
        /duración de 180 días inactiva/
    );
    assert.equal(calls.some((sql) => sql.startsWith("INSERT INTO durations")), false);
});
