const assert = require("node:assert/strict");
const test = require("node:test");
const {
    buildAccountDeliveryMessage,
    buildDeliveryMessage,
} = require("../src/utils/deliveryMessage");

function buildSingleItemMessage({ platformName, platformId, type = "normal", account = {}, showDeviceRule }) {
    return buildDeliveryMessage({
        orderCode: "ORD-TEST",
        baseUrl: "https://strbx.com.co",
        results: [{
            subscriptionId: 123,
            plan: {
                type,
                ...(platformId === undefined ? {} : { platform_id: platformId }),
                platform_name: platformName,
                ...(showDeviceRule === undefined ? {} : { show_device_rule: showDeviceRule }),
            },
            purchasedPlatformName: platformName,
            ...(platformId === undefined ? {} : { purchasedPlatformId: platformId }),
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
        assert.match(message, /Hola, necesito ayuda para activar Canva/);
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
    for (const platformName of ["Prime Video Completa", "Netflix", "Disney Estándar"]) {
        const message = buildSingleItemMessage({ platformName });
        assert.match(message, /Regla de uso: 1 pantalla = 1 dispositivo/);
    }
});

test("Notion correo uses assisted activation without expiration or credential link", () => {
    const message = buildSingleItemMessage({
        platformName: "Notion a correo",
        type: "correo",
        account: {},
    });

    assert.match(message, /Nota de activación/);
    assert.match(message, /WhatsApp 3152485340/);
    assert.match(message, /Orden: ORD-TEST/);
    assert.doesNotMatch(message, /Expira:/);
    assert.doesNotMatch(message, /Enlace de credenciales/);
});

test("Gemini link product uses assisted activation without expiration or credential link", () => {
    const message = buildSingleItemMessage({
        platformName: "Link Gemini con 5 TB de almacenamiento",
        type: "correo",
        account: {},
    });

    assert.match(message, /Nota de activación/);
    assert.match(message, /WhatsApp 3152485340/);
    assert.match(message, /necesito ayuda para activar Link Gemini con 5 TB de almacenamiento/);
    assert.doesNotMatch(message, /Expira:/);
    assert.doesNotMatch(message, /Enlace de credenciales/);
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

test("Spotify omits the credential link and one-device usage rule", () => {
    const message = buildSingleItemMessage({ platformName: "Spotify 3 meses" });

    assert.match(message, /Spotify 3 meses/);
    assert.match(message, /Correo: cliente@example\.com/);
    assert.match(message, /Expira: 2026-06-30/);
    assert.doesNotMatch(message, /strbx\.com\.co\/s\/TOKEN123/);
    assert.doesNotMatch(message, /Regla de uso: 1 pantalla = 1 dispositivo/);
});

test("Spotify replacement omits the credential link", () => {
    const message = buildAccountDeliveryMessage({
        intro: "Tu cuenta ha sido reemplazada por:",
        orderCode: "ORD-REEMPLAZO-SPOTIFY",
        subscriptionId: 457,
        platformName: "Spotify 1 Mes",
        account: {
            email: "cliente@example.com",
            password: "secret",
            profile_number: 1,
        },
        expiresAt: "2026-07-31",
        token: "TOKEN123",
        baseUrl: "https://strbx.com.co",
    });

    assert.match(message, /Orden: ORD-REEMPLAZO-SPOTIFY/);
    assert.match(message, /Expira: 2026-07-31/);
    assert.doesNotMatch(message, /strbx\.com\.co\/s\/TOKEN123/);
});

test("ChatGPT Cuenta Personal delivers only email, password, and optional 2FA", () => {
    const message = buildSingleItemMessage({
        platformName: "ChatGPT Cuenta Personal",
        account: { two_factor_secret: "2fa-secreto" },
    });
    assert.match(message, /Orden: ORD-TEST/);
    assert.match(message, /Pedido m/);
    assert.match(message, /ID: 123 .*ChatGPT Cuenta Personal/);
    assert.match(message, /Correo: cliente@example\.com/);
    assert.match(message, /Contrase.*secret/);
    assert.match(message, /2FA: 2fa-secreto/);
    assert.match(message, /Consulta 2FA: https:\/\/2fa\.live\//);
    assert.doesNotMatch(message, /Perfil:|Pin:|Expira:|Regla de uso|strbx\.com\.co\/s\//);
});

test("ChatGPT Cuenta Personal omits 2FA when it was left empty", () => {
    const message = buildSingleItemMessage({
        platformName: "ChatGPT Cuenta Personal",
        account: { two_factor_secret: "" },
    });
    assert.match(message, /Orden: ORD-TEST/);
    assert.match(message, /ID: 123 .*ChatGPT Cuenta Personal/);
    assert.match(message, /Correo: cliente@example\.com/);
    assert.match(message, /Contrase.*secret/);
    assert.doesNotMatch(message, /2FA/);
    assert.doesNotMatch(message, /2fa\.live/);
});

test("platform 36 appends the account security notice to every delivery", () => {
    const message = buildSingleItemMessage({
        platformId: 36,
        platformName: "ChatGPT Cuenta Personal - Sin garantia",
        account: { two_factor_secret: "2fa-secreto" },
    });

    assert.match(message, /ACCIONES IMPORTANTES AL RECIBIR TU CUENTA/);
    assert.match(message, /cambia inmediatamente el 2FA/);
    assert.match(message, /garant/);
});

test("platform 36 notice appears once in a multi-item order", () => {
    const message = buildDeliveryMessage({
        orderCode: "ORD-MULTIPLE-36",
        baseUrl: "https://strbx.com.co",
        results: Array.from({ length: 5 }, (_, index) => ({
            subscriptionId: 5800 + index,
            purchasedPlatformId: 36,
            purchasedPlatformName: "ChatGPT Cuenta Personal - Sin garantia",
            plan: {
                platform_id: 36,
                platform_name: "ChatGPT Cuenta Personal - Sin garantia",
            },
            account: {
                email: `cliente${index}@example.com`,
                password: "secret",
                two_factor_secret: "2fa-secreto",
            },
            expiresAt: "2026-08-31",
        })),
    });

    assert.equal((message.match(/ACCIONES IMPORTANTES AL RECIBIR TU CUENTA/g) || []).length, 1);
    assert.equal((message.match(/🆔 ID:/g) || []).length, 5);
});

test("platform 36 notice is appended after every account in a multi-item order", () => {
    const message = buildDeliveryMessage({
        orderCode: "ORD-ORDER-36",
        baseUrl: "https://strbx.com.co",
        results: [
            {
                subscriptionId: 6001,
                purchasedPlatformId: 36,
                purchasedPlatformName: "ChatGPT Cuenta Personal - Sin garantia",
                plan: { platform_id: 36, platform_name: "ChatGPT Cuenta Personal - Sin garantia" },
                account: { email: "first@example.com", password: "first-secret" },
            },
            {
                subscriptionId: 6002,
                purchasedPlatformId: 36,
                purchasedPlatformName: "ChatGPT Cuenta Personal - Sin garantia",
                plan: { platform_id: 36, platform_name: "ChatGPT Cuenta Personal - Sin garantia" },
                account: { email: "second@example.com", password: "second-secret" },
            },
        ],
    });

    const firstAccount = message.indexOf("first@example.com");
    const secondAccount = message.indexOf("second@example.com");
    const notice = message.indexOf("ACCIONES IMPORTANTES AL RECIBIR TU CUENTA");
    assert.ok(firstAccount >= 0);
    assert.ok(secondAccount > firstAccount);
    assert.ok(notice > secondAccount);
});

test("the platform 36 notice is not added to other platforms", () => {
    const message = buildSingleItemMessage({
        platformId: 35,
        platformName: "Netflix",
    });

    assert.doesNotMatch(message, /ACCIONES IMPORTANTES AL RECIBIR TU CUENTA/);
});

test("ChatGPT Cuenta Personal replacement keeps the delivery header without contract details", () => {
    const message = buildAccountDeliveryMessage({
        intro: "Tu cuenta ha sido reemplazada por:",
        orderCode: "ORD-REEMPLAZO",
        subscriptionId: 456,
        platformName: "ChatGPT Cuenta Personal",
        account: {
            email: "cliente@example.com",
            password: "secret",
            two_factor_secret: "2fa-secreto",
        },
        expiresAt: "2026-07-31",
        token: "TOKEN123",
        baseUrl: "https://strbx.com.co",
    });

    assert.match(message, /^Tu cuenta ha sido reemplazada por:/);
    assert.match(message, /Orden: ORD-REEMPLAZO/);
    assert.match(message, /ID: 456 .*ChatGPT Cuenta Personal/);
    assert.match(message, /2FA: 2fa-secreto/);
    assert.match(message, /Consulta 2FA: https:\/\/2fa\.live\//);
    assert.doesNotMatch(message, /Perfil:|Pin:|Expira:|strbx\.com\.co\/s\//);
});

test("IPTV delivers only username, password, and URL after the standard header", () => {
    const message = buildSingleItemMessage({
        platformName: "IPTV 3 MESES",
        account: {
            email: "PMVZ5mXZyh",
            password: "aNsftq3BV3",
            access_url: "http://red4tv.lat",
            profile_number: 3,
            pin: "1234",
        },
    });

    assert.match(message, /Orden: ORD-TEST/);
    assert.match(message, /Pedido m/);
    assert.match(message, /ID: 123 .*IPTV 3 MESES/);
    assert.match(message, /Usuario: PMVZ5mXZyh/);
    assert.match(message, new RegExp("Contrase\\u00f1a: aNsftq3BV3"));
    assert.doesNotMatch(message, new RegExp("Contrase\\u00c3\\u00b1a"));
    assert.match(message, /URL: http:\/\/red4tv\.lat/);
    assert.doesNotMatch(message, /Correo:|Perfil:|Pin:|Expira:|Regla de uso|strbx\.com\.co\/s\//);
});

test("IPTV replacement keeps the delivery header without contract or link details", () => {
    const message = buildAccountDeliveryMessage({
        intro: "Tu cuenta ha sido reemplazada por:",
        orderCode: "ORD-REEMPLAZO-IPTV",
        subscriptionId: 789,
        platformName: "IPTV",
        account: {
            email: "PMVZ5mXZyh",
            password: "aNsftq3BV3",
            access_url: "http://red4tv.lat",
        },
        expiresAt: "2026-07-31",
        token: "TOKEN123",
        baseUrl: "https://strbx.com.co",
    });

    assert.match(message, /^Tu cuenta ha sido reemplazada por:/);
    assert.match(message, /Orden: ORD-REEMPLAZO-IPTV/);
    assert.match(message, /ID: 789 .*IPTV/);
    assert.match(message, /Usuario: PMVZ5mXZyh/);
    assert.match(message, /URL: http:\/\/red4tv\.lat/);
    assert.doesNotMatch(message, /Correo:|Perfil:|Pin:|Expira:|strbx\.com\.co\/s\//);
});

test("Disney Premium solo TV por codigo hides password, link, and generic usage rule", () => {
    const message = buildSingleItemMessage({
        platformName: "Disney Premium Solo TV por código",
        account: {
            email: "disney@example.com",
            password: "no-debe-mostrarse",
            profile_number: 1,
            pin: "2468",
        },
    });

    assert.match(message, /Disney Premium Solo TV por código/);
    assert.match(message, /Correo: disney@example\.com/);
    assert.match(message, /Perfil: 1/);
    assert.match(message, /Pin: 2468/);
    assert.match(message, /Expira: 2026-06-30/);
    assert.match(message, /ACTIVACIÓN EN TV/);
    assert.match(message, /envíanos el código/);
    assert.doesNotMatch(message, /no-debe-mostrarse/);
    assert.doesNotMatch(message, /Contrase/);
    assert.doesNotMatch(message, /strbx\.com\.co\/s\/TOKEN123/);
    assert.doesNotMatch(message, /Debido a que/);
    assert.doesNotMatch(message, /Regla de uso/);
});

test("Disney Premium solo TV por codigo adds activation note once for multiple items", () => {
    const message = buildDeliveryMessage({
        orderCode: "ORD-DISNEY-TV",
        baseUrl: "https://strbx.com.co",
        results: [1, 2].map((subscriptionId) => ({
            subscriptionId,
            purchasedPlatformName: "Disney Premium Solo TV por código",
            plan: { platform_name: "Disney Premium Solo TV por código" },
            account: { email: `cliente${subscriptionId}@example.com`, password: "secret" },
            expiresAt: "2026-09-01",
            token: "TOKEN123",
        })),
    });

    assert.equal((message.match(/ACTIVACIÓN EN TV/g) || []).length, 1);
    assert.equal((message.match(/Contrase/g) || []).length, 0);
    assert.equal((message.match(/strbx\.com\.co\/s\//g) || []).length, 0);
});

test("Microsoft Office 365 includes the installation manual without the generic account tail", () => {
    const message = buildSingleItemMessage({
        platformName: "Microsoft Office 365",
        account: {
            email: "office@example.com",
            password: "office-secret",
            profile_number: 1,
            pin: "1234",
        },
    });

    assert.match(message, /Correo: office@example\.com/);
    assert.match(message, /Contrase.*office-secret/);
    assert.match(message, /https:\/\/m365\.cloud\.microsoft\/apps/);
    assert.match(message, /Instalar aplicaciones/);
    assert.match(message, /Aplicaciones de Microsoft 365/);
    assert.match(message, /desinstálala/);
    assert.doesNotMatch(message, /Debido a que en ocasiones/);
    assert.doesNotMatch(message, /Regla de uso/);
    assert.doesNotMatch(message, /strbx\.com\.co\/s\/TOKEN123/);
});

test("Microsoft Office 365 installation manual appears once for multiple items", () => {
    const message = buildDeliveryMessage({
        orderCode: "ORD-OFFICE-MULTIPLE",
        baseUrl: "https://strbx.com.co",
        results: [1, 2].map((subscriptionId) => ({
            subscriptionId,
            purchasedPlatformName: "Microsoft Office 365",
            plan: { platform_name: "Microsoft Office 365" },
            account: { email: `office${subscriptionId}@example.com`, password: "secret" },
            expiresAt: "2026-09-01",
            token: "TOKEN123",
        })),
    });

    assert.equal((message.match(/MANUAL DE INGRESO - MICROSOFT 365/g) || []).length, 1);
    assert.equal((message.match(/https:\/\/m365\.cloud\.microsoft\/apps/g) || []).length, 1);
    assert.equal((message.match(/Debido a que en ocasiones/g) || []).length, 0);
    assert.equal((message.match(/Regla de uso/g) || []).length, 0);
});
