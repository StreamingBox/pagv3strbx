const assert = require("node:assert/strict");
const test = require("node:test");
const { __test } = require("../src/server");

test("worker detects Netflix success without treating the informational reCAPTCHA footer as a challenge", () => {
    assert.equal(__test.detectPageFailure("Esta página está protegida por Google reCAPTCHA para comprobar que no eres un robot."), null);
    assert.equal(__test.detectPageFailure("Verifica que eres humano para continuar.")?.status, "captcha_required");
    assert.equal(__test.isSuccessText("¡Tu TV está lista para ver Netflix!"), true);
});

test("worker normalizes the TV code to digits", () => {
    assert.equal(__test.normalizeDigits("9875-3269"), "98753269");
});
