const assert = require("node:assert/strict");
const test = require("node:test");
const { buildAccountDeliveryMessage, buildDeliveryMessage } = require("../src/utils/deliveryMessage");
const { isUniversalPlusProduct } = require("../src/utils/productDeliveryProfile");
const { automaticUnitCostForPlan } = require("../src/utils/profitCosts");
const migration = require("../src/migrations/060_universal_plus_pantalla");

test("Universal+ is recognized from its canonical name and slug", () => {
    assert.equal(isUniversalPlusProduct({ platformName: "Universal+ Pantalla" }), true);
    assert.equal(isUniversalPlusProduct({ platformSlug: "universal-plus-pantalla" }), true);
    assert.equal(isUniversalPlusProduct({ platformName: "Universal Studios" }), false);
});

test("Universal+ uses the actual COP provider cost only for COP plans", () => {
    const base = { platform_name: "Universal+ Pantalla", platform_slug: "universal-plus-pantalla" };
    assert.equal(automaticUnitCostForPlan({ ...base, currency: "COP" }), 3500);
    assert.equal(automaticUnitCostForPlan({ ...base, currency: "USD" }), 0);
});

test("Universal+ delivery includes email and supplier expiry but no password or credential link", () => {
    const message = buildDeliveryMessage({
        orderCode: "ORD-TEST",
        baseUrl: "https://strbx.com.co",
        results: [{
            subscriptionId: 1,
            plan: {
                platform_name: "Universal+ Pantalla",
                platform_slug: "universal-plus-pantalla",
                type: "correo",
                show_device_rule: 1,
            },
            purchasedPlatformName: "Universal+ Pantalla",
            purchasedPlatformSlug: "universal-plus-pantalla",
            account: { email: "access@example.test", password: "must-not-be-shown" },
            expiresAt: "2026-11-28",
            token: "must-not-be-used",
        }],
    });

    assert.match(message, /Universal\+ Pantalla/);
    assert.match(message, /access@example\.test/);
    assert.match(message, /2026-11-28/);
    assert.match(message, /un solo dispositivo/i);
    assert.doesNotMatch(message, /must-not-be-shown|must-not-be-used|Contraseña:|Enlace de credenciales/);
});

test("Universal+ account replacement delivery also omits credential links", () => {
    const message = buildAccountDeliveryMessage({
        orderCode: "ORD-TEST",
        subscriptionId: 1,
        platformName: "Universal+ Pantalla",
        platformSlug: "universal-plus-pantalla",
        account: { email: "access@example.test", password: "must-not-be-shown" },
        expiresAt: "2026-11-28",
        baseUrl: "https://strbx.com.co",
        token: "must-not-be-used",
    });

    assert.match(message, /access@example\.test/);
    assert.match(message, /2026-11-28/);
    assert.match(message, /un solo dispositivo/i);
    assert.doesNotMatch(message, /must-not-be-shown|must-not-be-used|Contraseña:|Enlace de credenciales/);
});

test("Universal+ migration creates one canonical COP offer and is safe to rerun", async () => {
    const state = { platform: null, price: null, nextId: 1, inserts: { platform: 0, price: 0 } };
    const query = async (sql, params = []) => {
        if (sql.startsWith("SELECT id FROM durations")) return [[{ id: 30 }]];
        if (sql.startsWith("SELECT id FROM platforms")) {
            return [[state.platform ? { id: state.platform.id } : undefined].filter(Boolean)];
        }
        if (sql.startsWith("INSERT INTO platforms")) {
            state.platform = { id: state.nextId++, name: params[0], slug: params[1] };
            state.inserts.platform += 1;
            return [{ insertId: state.platform.id }];
        }
        if (sql.startsWith("UPDATE platforms")) {
            state.platform = { ...state.platform, name: params[0] };
            return [{}];
        }
        if (sql.startsWith("SELECT id FROM platform_prices")) {
            return [[state.price ? { id: state.price.id } : undefined].filter(Boolean)];
        }
        if (sql.startsWith("INSERT INTO platform_prices")) {
            state.price = { id: state.nextId++, platformId: params[0], durationId: params[1], price: 8000 };
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

    assert.equal(state.platform.name, "Universal+ Pantalla");
    assert.equal(state.price.price, 8000);
    assert.deepEqual(state.inserts, { platform: 1, price: 1 });
});
