const test = require("node:test");
const assert = require("node:assert/strict");
const {
    getNewsletterMailConfig,
    getTestRecipient,
    sendNewsletterTestEmail,
} = require("../src/services/newsletterMail.service");

const smtpEnv = {
    SMTP_HOST: "smtp.example.test",
    SMTP_PORT: "587",
    SMTP_USER: "mailer@example.test",
    SMTP_PASS: "fake-test-password",
    NEWSLETTER_MAIL_FROM: "Newsletter <novedades@example.test>",
    NEWSLETTER_TEST_TO: "qa@example.test",
};

test("Newsletter reuses general SMTP and only overrides its From alias", () => {
    const config = getNewsletterMailConfig(smtpEnv);
    assert.equal(config.from, "Newsletter <novedades@example.test>");
    assert.equal(config.transport.host, "smtp.example.test");
    assert.equal(config.transport.auth.user, "mailer@example.test");
    assert.equal(config.transport.auth.pass, "fake-test-password");
    assert.equal(config.transport.port, 587);
});

test("Newsletter can use alias credentials with the existing SMTP host and port", () => {
    const config = getNewsletterMailConfig({
        ...smtpEnv,
        NEWSLETTER_SMTP_USER: "novedades@example.test",
        NEWSLETTER_SMTP_PASS: "fake-newsletter-password",
    });
    assert.equal(config.transport.host, "smtp.example.test");
    assert.equal(config.transport.port, 587);
    assert.equal(config.transport.auth.user, "novedades@example.test");
    assert.equal(config.transport.auth.pass, "fake-newsletter-password");
});

test("partial Newsletter SMTP credentials fail instead of mixing accounts", () => {
    assert.throws(() => getNewsletterMailConfig({
        ...smtpEnv,
        NEWSLETTER_SMTP_USER: "novedades@example.test",
    }), /NEWSLETTER_SMTP_USER y NEWSLETTER_SMTP_PASS/);
});

test("Newsletter test recipient must be exactly one email", () => {
    assert.equal(getTestRecipient(smtpEnv), "qa@example.test");
    assert.throws(() => getTestRecipient({ NEWSLETTER_TEST_TO: "a@example.test,b@example.test" }), /una sola dirección/);
    assert.throws(() => getTestRecipient({ NEWSLETTER_TEST_TO: "" }), /una sola dirección/);
});

test("test sender delivers one branded preview to the configured recipient and closes transport", async () => {
    let sentMessage;
    let transportClosed = false;
    const result = await sendNewsletterTestEmail({
        env: smtpEnv,
        createTransport: (transportConfig) => {
            assert.equal(transportConfig.host, "smtp.example.test");
            return {
                async sendMail(message) {
                    sentMessage = message;
                    return { messageId: "fake-message-id" };
                },
                close() {
                    transportClosed = true;
                },
            };
        },
    });

    assert.deepEqual(result, { ok: true });
    assert.equal(sentMessage.to, "qa@example.test");
    assert.equal(sentMessage.from, "Newsletter <novedades@example.test>");
    assert.match(sentMessage.subject, /^\[PRUEBA\]/);
    assert.match(sentMessage.html, /favicon\.svg/);
    assert.match(sentMessage.html, /\+\$6\.000/);
    assert.equal("bcc" in sentMessage, false);
    assert.equal("cc" in sentMessage, false);
    assert.equal(transportClosed, true);
});
