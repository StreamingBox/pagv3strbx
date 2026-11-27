const assert = require("node:assert/strict");
const test = require("node:test");
const imapConfig = require("../src/utils/imapConfig");

const mailboxMessages = new Map();
const connection = {
    async openBox() {},
    async end() {},
    async search(criteria) {
        const uidCriterion = criteria.find((criterion) => Array.isArray(criterion) && criterion[0] === "UID");
        if (uidCriterion) {
            const message = [...mailboxMessages.values()].flat().find((candidate) => candidate.uid === uidCriterion[1]);
            return message ? [{ parts: [{ which: "", body: message.raw }] }] : [];
        }
        const toCriterion = criteria.find((criterion) => Array.isArray(criterion) && criterion[0] === "TO");
        const messages = toCriterion
            ? mailboxMessages.get(String(toCriterion[1]).toLowerCase()) || []
            : [...mailboxMessages.values()].flat();
        return messages.map((message) => ({
            attributes: { uid: message.uid, date: message.date },
            parts: [{
                which: "HEADER.FIELDS (FROM TO SUBJECT DATE)",
                body: {
                    from: [message.from],
                    to: [`Client <${message.toEmail}>`],
                },
            }],
        }));
    },
};

imapConfig.getImapConfig = () => ({ host: "imap.example.test" });
imapConfig.connectImapWithTlsFallback = async () => connection;
const { fetchAppleTvCodeFromGmail } = require("../src/services/gmailCodeService");

function makeEmail({ uid, subject, body, html, date, toEmail = "client@example.test", from = "Apple <noreply@apple.com>" }) {
    const mimeBody = html && body == null
        ? ["Content-Type: text/html; charset=utf-8", "", html]
        : html
            ? [
                'Content-Type: multipart/alternative; boundary="apple-test-boundary"',
                "",
                "--apple-test-boundary",
                "Content-Type: text/plain; charset=utf-8",
                "",
                body,
                "--apple-test-boundary",
                "Content-Type: text/html; charset=utf-8",
                "",
                html,
                "--apple-test-boundary--",
            ]
            : ["Content-Type: text/plain; charset=utf-8", "", body];

    return {
        uid,
        date,
        toEmail,
        from,
        raw: [
            `From: ${from}`,
            `To: Client <${toEmail}>`,
            `Subject: ${subject}`,
            `Date: ${date.toUTCString()}`,
            "MIME-Version: 1.0",
            ...mimeBody,
        ].join("\r\n"),
    };
}

test("does not search the mailbox without an assigned account email", { concurrency: false }, async () => {
    const result = await fetchAppleTvCodeFromGmail({ toEmail: "" });

    assert.equal(result.ok, false);
    assert.equal(result.status, "no_account");
});

test("extracts the Apple TV sign-in code from a recent official email", { concurrency: false }, async () => {
    const toEmail = "first@example.test";
    mailboxMessages.set(toEmail, [makeEmail({
        uid: 1,
        subject: "Your sign-in code for Apple TV",
        body: "Your sign-in code for Apple TV\n677009\nThis code expires in 30 minutes.",
        toEmail,
        date: new Date(Date.now() - 60_000),
    })]);

    const result = await fetchAppleTvCodeFromGmail({ toEmail });

    assert.equal(result.ok, true);
    assert.equal(result.code, "677009");
});

test("extracts the Apple TV code from the HTML body when the text alternative omits it", { concurrency: false }, async () => {
    const toEmail = "second@example.test";
    mailboxMessages.set(toEmail, [makeEmail({
        uid: 5,
        subject: "Your sign-in code for Apple TV",
        body: "Your sign-in code for Apple TV. This code expires in 30 minutes.",
        html: "<html><body><h1>Your sign-in code for Apple TV</h1><strong>6</strong><strong>1</strong><strong>4</strong><strong>2</strong><strong>8</strong><strong>0</strong><p>This code expires in 30 minutes.</p></body></html>",
        toEmail,
        date: new Date(Date.now() - 60_000),
    })]);

    const result = await fetchAppleTvCodeFromGmail({ toEmail });

    assert.equal(result.ok, true);
    assert.equal(result.code, "614280");
});

test("rejects an Apple email that is not an Apple TV sign-in code", { concurrency: false }, async () => {
    const toEmail = "third@example.test";
    mailboxMessages.set(toEmail, [makeEmail({
        uid: 2,
        subject: "Your Apple ID receipt",
        body: "Receipt number 112233",
        toEmail,
        date: new Date(Date.now() - 60_000),
    })]);

    const result = await fetchAppleTvCodeFromGmail({ toEmail });

    assert.equal(result.ok, false);
    assert.equal(result.status, "apple_tv_code_not_found");
});

test("does not match an account email that is only a substring of another recipient", { concurrency: false }, async () => {
    mailboxMessages.clear();
    const targetEmail = "first@example.test";
    mailboxMessages.set("lookalike", [makeEmail({
        uid: 6,
        subject: "Your sign-in code for Apple TV",
        body: "Your sign-in code for Apple TV\n112233",
        toEmail: "notfirst@example.test",
        date: new Date(Date.now() - 60_000),
    })]);

    const result = await fetchAppleTvCodeFromGmail({ toEmail: targetEmail });

    assert.equal(result.ok, false);
    assert.equal(result.status, "apple_tv_code_not_found");
});

test("does not extract a code from a sender impersonating Apple", { concurrency: false }, async () => {
    const toEmail = "fourth@example.test";
    mailboxMessages.set(toEmail, [makeEmail({
        uid: 3,
        from: "Apple <noreply@apple.com.attacker.test>",
        subject: "Your sign-in code for Apple TV",
        body: "Your sign-in code for Apple TV\n112233",
        toEmail,
        date: new Date(Date.now() - 60_000),
    })]);

    const result = await fetchAppleTvCodeFromGmail({ toEmail });

    assert.equal(result.ok, false);
    assert.equal(result.status, "sender_mismatch");
});

test("rejects an Apple TV code email older than its thirty-minute validity", { concurrency: false }, async () => {
    const toEmail = "fifth@example.test";
    mailboxMessages.set(toEmail, [makeEmail({
        uid: 4,
        subject: "Your sign-in code for Apple TV",
        body: "Your sign-in code for Apple TV\n112233",
        toEmail,
        date: new Date(Date.now() - 31 * 60_000),
    })]);

    const result = await fetchAppleTvCodeFromGmail({ toEmail });

    assert.equal(result.ok, false);
    assert.equal(result.status, "expired");
});
