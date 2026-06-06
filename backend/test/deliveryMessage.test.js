const assert = require("node:assert/strict");
const test = require("node:test");
const { buildDeliveryMessage } = require("../src/utils/deliveryMessage");

function buildSingleItemMessage({ platformName, type = "normal", account = {}, showDeviceRule }) {
    return buildDeliveryMessage({
        orderCode: "ORD-TEST",
        baseUrl: "https://strbx.com.co",
        results: [{
            subscriptionId: 123,
            plan: {
                type,
                platform_name: platformName,
                ...(showDeviceRule === undefined ? {} : { show_device_rule: showDeviceRule }),
            },
            purchasedPlatformName: platformName,
            account: {
                email: "cliente@example.com",
                password: "secret",
                profile_number: 2,
                pin: "1234",
                ...account,
            },
            expiresAt: "2026-06-30",
            token: "TOKEN123",
        }],
    });
}

test("Canva correo uses WhatsApp activation instructions without credential link or usage rule", () => {
    const previousPhone = process.env.SALES_CONTACT_PHONE;
    process.env.SALES_CONTACT_PHONE = "3152485340";

    try {
        const message = buildSingleItemMessage({
            platformName: "Canva Mensual a correo",
            type: "correo",
            account: {},
        });

        assert.match(message, /Canva Mensual a correo/);
        assert.match(message, /WhatsApp 3152485340/);
        assert.match(message, /Hola, quiero activar mi correo de Canva/);
        assert.doesNotMatch(message, /Expira:/);
        assert.doesNotMatch(message, /Enlace de credenciales/);
        assert.doesNotMatch(message, /Regla de uso/);
    } finally {
        if (previousPhone === undefined) delete process.env.SALES_CONTACT_PHONE;
        else process.env.SALES_CONTACT_PHONE = previousPhone;
    }
});

test("non-Canva correo products keep the generic credential link message", () => {
    const message = buildSingleItemMessage({
        platformName: "Chat Gpt a correo - Garantia Activacion",
        type: "correo",
        account: {},
    });

    assert.match(message, /Chat Gpt a correo - Garantia Activacion/);
    assert.match(message, /Expira: 2026-06-30/);
    assert.match(message, /Enlace de credenciales: https:\/\/strbx\.com\.co\/s\/TOKEN123/);
    assert.doesNotMatch(message, /Regla de uso/);
});

test("credential products include the one-device usage rule", () => {
    for (const platformName of ["Prime Video Completa", "Microsoft Office 365", "Netflix", "Disney Estándar"]) {
        const message = buildSingleItemMessage({ platformName });
        assert.match(message, /Regla de uso: 1 pantalla = 1 dispositivo/);
    }
});

test("regular credential products keep credentials and the one-device usage rule", () => {
    const message = buildSingleItemMessage({ platformName: "Netflix" });

    assert.match(message, /Netflix/);
    assert.match(message, /Correo: cliente@example\.com/);
    assert.match(message, /Regla de uso: 1 pantalla = 1 dispositivo/);
});

test("credential products can disable the one-device usage rule", () => {
    const message = buildSingleItemMessage({ platformName: "Disney Estándar", showDeviceRule: 0 });

    assert.match(message, /Disney Estándar/);
    assert.match(message, /Correo: cliente@example\.com/);
    assert.doesNotMatch(message, /Regla de uso/);
});
