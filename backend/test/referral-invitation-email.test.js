const test = require("node:test");
const assert = require("node:assert/strict");
const nodemailer = require("nodemailer");

test("referral invitation email uses the configured SMTP and escapes inviter content", async () => {
    const envKeys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_SECURE", "MAIL_FROM"];
    const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
    const originalCreateTransport = nodemailer.createTransport;
    let sent;
    nodemailer.createTransport = () => ({ sendMail: async message => { sent = message; return { messageId: "synthetic-message" }; } });
    Object.assign(process.env, {
        SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_USER: "synthetic@example.test",
        SMTP_PASS: "synthetic-test-secret", SMTP_SECURE: "false", MAIL_FROM: "Streaming Box <synthetic@example.test>",
    });
    try {
        const { sendReferralInvitationEmail } = require("../src/services/mailService");
        const result = await sendReferralInvitationEmail({
            to: "invitee@example.test", inviterName: "<img src=x onerror=alert(1)>",
            inviteUrl: "https://strbx.com.co/register#invite=" + "a".repeat(64),
            campaign: { rewardAmount: 10000, minimumTopup: 50000, attributionDays: 30 },
            expiresAt: new Date("2026-11-02T12:00:00Z"),
        });
        assert.deepEqual(result, { ok: true, delivery: "email" });
        assert.equal(sent.to, "invitee@example.test");
        assert.match(sent.text, /COP/);
        assert.match(sent.text, /50\.000/);
        assert.match(sent.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
        assert.doesNotMatch(sent.html, /<img src=x onerror=/);
        assert.match(sent.html, /#invite=[a-f0-9]{64}/);
    } finally {
        nodemailer.createTransport = originalCreateTransport;
        for (const key of envKeys) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    }
});
