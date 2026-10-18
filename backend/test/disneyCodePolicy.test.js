const assert = require("node:assert/strict");
const test = require("node:test");
const {
    checkDisneyPurchaseWindow,
    extractDisneyOtpCode,
    isDisneyLoginNotice,
    isDisneyOtpSubject,
    isDisneySender,
} = require("../src/services/disneyCodePolicy");

test("accepts Disney sender subdomains but rejects lookalike domains", () => {
    assert.equal(isDisneySender("Disney+ <disneyplus@trx.mail2.disneyplus.com>"), true);
    assert.equal(isDisneySender("Disney <alerts@disneyplus.com>"), true);
    assert.equal(isDisneySender("Disney <alerts@disneyplus.com.attacker.test>"), false);
    assert.equal(isDisneySender("Disney <alerts@notdisneyplus.com>"), false);
});

test("recognizes the Spanish and Swedish Disney one-time-code subjects", () => {
    assert.equal(isDisneyOtpSubject("Tu código de acceso único para Disney+"), true);
    assert.equal(isDisneyOtpSubject("Din engångskod till Disney+"), true);
});

test("blocks the new-login alert while never classifying a Disney OTP as a login notice", () => {
    assert.equal(isDisneyLoginNotice({
        subject: "Nuevo inicio de sesión",
        text: "Identificamos un nuevo inicio de sesión en Disney+. Tipo de dispositivo: Chrome Browser.",
    }), true);
    assert.equal(isDisneyLoginNotice({
        subject: "Tu código de acceso único para Disney+",
        text: "Usa este código para verificar tu cuenta e iniciar sesión.",
    }), false);
});

test("extracts only one six-digit code from an official Disney OTP email", () => {
    assert.equal(extractDisneyOtpCode({
        subject: "Tu código de acceso único para Disney+",
        text: "Tu código de acceso vencerá en 15 minutos.\n654321",
    }), "654321");
    assert.equal(extractDisneyOtpCode({
        subject: "Nuevo inicio de sesión",
        text: "El identificador de actividad es 654321.",
    }), "");
    assert.equal(extractDisneyOtpCode({
        subject: "Tu código de acceso único para Disney+",
        text: "654321 y 123456",
    }), "");
});

test("checks both MIME alternatives for the code and login notices", () => {
    const subject = "Tu código de acceso único para Disney+";
    assert.equal(extractDisneyOtpCode({
        subject,
        text: "Tu código vence en 15 minutos.",
        html: "<html><body><p>Tu código de acceso:</p><strong>246810</strong></body></html>",
    }), "246810");
    assert.equal(isDisneyLoginNotice({
        subject: "Actividad de tu cuenta Disney+",
        text: "Revisa la actividad reciente de tu cuenta.",
        html: "<html><body><p>Identificamos un nuevo inicio de sesión en Disney+.</p></body></html>",
    }), true);
});

test("enforces the ten-minute purchase window and fails closed on missing/future dates", () => {
    const now = Date.UTC(2026, 9, 17, 12, 0, 0);
    assert.deepEqual(checkDisneyPurchaseWindow(new Date(now - 10 * 60 * 1000), now), {
        allowed: true,
        status: "within_window",
    });
    assert.equal(checkDisneyPurchaseWindow(new Date(now - 10 * 60 * 1000 - 1), now).status, "purchase_window_expired");
    assert.equal(checkDisneyPurchaseWindow(null, now).status, "purchase_time_unavailable");
    assert.equal(checkDisneyPurchaseWindow(new Date(now + 1000), now).status, "purchase_time_unavailable");
});
