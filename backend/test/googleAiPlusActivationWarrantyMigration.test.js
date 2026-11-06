const assert = require("node:assert/strict");
const test = require("node:test");
const migration = require("../src/migrations/064_google_ai_plus_activation_warranty");

const WARRANTY = "**Garantía de activación**";

test("activation warranty is added to both plans once without replacing conditions", async () => {
    const platforms = [
        {
            id: 60,
            slug: "google-ai-plus",
            product_details: "Duración: 3 meses (90 días)\n**IMPORTANTE: saldo mínimo de $4.000 COP.**\n**PRUEBA: Solo cuentas sin planes anteriores ni activos.**",
        },
        {
            id: 61,
            slug: "google-ai-plus-12-meses",
            product_details: "Duración: 12 meses (365 días)\n**IMPORTANTE: saldo mínimo de $4.000 COP.**\n**PRUEBA: Solo cuentas sin planes anteriores ni activos.**",
        },
    ];
    const updates = [];
    const query = async (sql, params = []) => {
        if (sql.startsWith("SELECT id, product_details FROM platforms")) return [platforms.map((row) => ({ ...row }))];
        if (sql.startsWith("UPDATE platforms SET product_details")) {
            updates.push(params[1]);
            platforms.find((row) => row.id === params[1]).product_details = params[0];
            return [{}];
        }
        throw new Error(`Unexpected SQL in migration test: ${sql}`);
    };

    await migration.up({ query });
    await migration.up({ query });

    assert.equal(migration.id, "064_google_ai_plus_activation_warranty");
    for (const platform of platforms) {
        assert.match(platform.product_details, /Duración:/);
        assert.match(platform.product_details, /saldo mínimo de \$4\.000 COP/);
        assert.match(platform.product_details, /PRUEBA:/);
        assert.equal(platform.product_details.split(WARRANTY).length - 1, 1);
    }
    assert.deepEqual(updates, [60, 61]);
});

test("activation warranty migration is a no-op when neither plan exists", async () => {
    let updates = 0;
    const query = async (sql) => {
        if (sql.startsWith("SELECT id, product_details FROM platforms")) return [[]];
        if (sql.startsWith("UPDATE platforms SET product_details")) updates += 1;
        return [{}];
    };

    await migration.up({ query });

    assert.equal(updates, 0);
});
