const test = require("node:test");
const assert = require("node:assert/strict");

const {
    appendReplacementCredentialsMessage,
    buildReplacementCredentialsMessage,
} = require("../src/utils/supportReplacementMessage");

test("replacement support message includes the delivered account and existing credential link", () => {
    const message = buildReplacementCredentialsMessage({
        subscriptionId: 4708,
        platformName: "Netflix",
        account: {
            email: "new-account@example.com",
            password: "NewPassword1",
            pin: "1234",
            profile_number: 3,
        },
        expiresAt: "2026-08-03",
        token: "safe-token",
        baseUrl: "https://strbx.com.co/",
    });

    assert.match(message, /Correo: new-account@example.com/);
    assert.match(message, /Contraseña: NewPassword1/);
    assert.match(message, /Perfil: 3/);
    assert.match(message, /Pin: 1234/);
    assert.match(message, /Expira: 2026-08-03/);
    assert.match(message, /https:\/\/strbx.com.co\/s\/safe-token/);
});

test("replacement credentials are appended after the agent response", () => {
    const message = appendReplacementCredentialsMessage(
        "Reemplazamos tu cuenta.",
        "Nuevas credenciales de tu cuenta:\nCorreo: new-account@example.com"
    );

    assert.equal(
        message,
        "Reemplazamos tu cuenta.\n\nNuevas credenciales de tu cuenta:\nCorreo: new-account@example.com"
    );
});
