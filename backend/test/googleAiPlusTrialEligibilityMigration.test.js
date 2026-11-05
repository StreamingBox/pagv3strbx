const assert = require("node:assert/strict");
const test = require("node:test");
const migration = require("../src/migrations/062_google_ai_plus_trial_eligibility");

const TRIAL_ELIGIBILITY = "**PRUEBA: Solo funciona en cuentas de Google que no tengan planes anteriores ni planes activos.**";

test("Google AI PLUS trial eligibility is appended once without replacing existing product conditions", async () => {
    const state = {
        platform: {
            id: 60,
            product_details: "Duración: 3 meses (90 días)\n**IMPORTANTE: saldo mínimo de $4.000 COP.**",
        },
        updates: 0,
    };
    const query = async (sql, params = []) => {
        if (sql.startsWith("SELECT id, product_details FROM platforms")) {
            return [[state.platform ? { ...state.platform } : undefined].filter(Boolean)];
        }
        if (sql.startsWith("UPDATE platforms SET product_details")) {
            state.platform.product_details = params[0];
            state.updates += 1;
            return [{}];
        }
        throw new Error(`Unexpected SQL in migration test: ${sql}`);
    };

    await migration.up({ query });
    await migration.up({ query });

    assert.equal(migration.id, "062_google_ai_plus_trial_eligibility");
    assert.match(state.platform.product_details, /^Duración: 3 meses/);
    assert.match(state.platform.product_details, /saldo mínimo de \$4\.000 COP/);
    assert.equal(state.platform.product_details.split(TRIAL_ELIGIBILITY).length - 1, 1);
    assert.equal(state.updates, 1);
});

test("Google AI PLUS trial eligibility migration is a no-op if the product is absent", async () => {
    let updates = 0;
    const query = async (sql) => {
        if (sql.startsWith("SELECT id, product_details FROM platforms")) return [[]];
        if (sql.startsWith("UPDATE platforms SET product_details")) updates += 1;
        return [{}];
    };

    await migration.up({ query });

    assert.equal(updates, 0);
});
