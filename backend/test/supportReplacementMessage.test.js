const test = require("node:test");
const assert = require("node:assert/strict");

const {
    appendReplacementCredentialsMessage,
    buildReplacementCredentialsMessage,
} = require("../src/utils/supportReplacementMessage");

test("replacement support message uses the full delivery format", () => {
    const message = buildReplacementCredentialsMessage({
        orderCode: "ORD-MRBEMA3D-HZYGJF",
        subscriptionId: 4750,
        platformName: "Max",
        account: {
            email: "medrano364uz@jeffpremium.com",
            password: "miskiye534",
            pin: "3833",
            profile_number: 2,
        },
        expiresAt: "2026-08-06",
        token: "UBV8slY3Ai",
        baseUrl: "https://strbx.com.co/",
    });

    assert.equal(
        message,
        [
            "Tu cuenta ha sido reemplazada por:",
            "",
            "🧾 Orden: ORD-MRBEMA3D-HZYGJF",
            "📦 Pedido múltiple (1 items)",
            "",
            "🆔 ID: 4750 | 🖥️ Max",
            "📧 Correo: medrano364uz@jeffpremium.com",
            "🔑 Contraseña: miskiye534",
            "👤 Perfil: 2",
            "🔢 Pin: 3833",
            "📅 Expira: 2026-08-06",
            "",
            "🔗⚠️ Debido a que en ocasiones se bloquea o cambia la clave, en este enlace https://strbx.com.co/s/UBV8slY3Ai puedes consultar la contraseña hasta tu último día contratado. 💻🔑:",
        ].join("\n")
    );
});

test("default replacement intro is not duplicated before the delivery block", () => {
    const message = appendReplacementCredentialsMessage(
        "Tu cuenta ha sido reemplazada por:",
        "Tu cuenta ha sido reemplazada por:\n\n🧾 Orden: ORD-TEST"
    );

    assert.equal(message, "Tu cuenta ha sido reemplazada por:\n\n🧾 Orden: ORD-TEST");
});

test("custom agent responses are kept before replacement credentials", () => {
    const message = appendReplacementCredentialsMessage(
        "Ya revisamos tu caso y realizamos el cambio.",
        "Tu cuenta ha sido reemplazada por:\n\n🧾 Orden: ORD-TEST"
    );

    assert.equal(
        message,
        "Ya revisamos tu caso y realizamos el cambio.\n\nTu cuenta ha sido reemplazada por:\n\n🧾 Orden: ORD-TEST"
    );
});
