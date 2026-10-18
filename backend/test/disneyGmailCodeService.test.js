const assert = require("node:assert/strict");
const test = require("node:test");
const imapConfig = require("../src/utils/imapConfig");

let mailboxMessages = [];
const connection = {
    async openBox() {},
    async end() {},
    async search(criteria) {
        const uidCriterion = criteria.find((criterion) => Array.isArray(criterion) && criterion[0] === "UID");
        if (uidCriterion) {
            const message = mailboxMessages.find((candidate) => candidate.uid === uidCriterion[1]);
            return message ? [{ parts: [{ which: "", body: message.raw }] }] : [];
        }
        return mailboxMessages.map((message) => ({
            attributes: { uid: message.uid, date: message.date },
            parts: [{
                which: "HEADER.FIELDS (FROM TO SUBJECT DATE)",
                body: {
                    from: ["Disney+ <disneyplus@trx.mail2.disneyplus.com>"],
                    to: ["Client <client@example.test>"],
                },
            }],
        }));
    },
};

imapConfig.getImapConfig = () => ({ host: "imap.example.test" });
imapConfig.connectImapWithTlsFallback = async () => connection;
const { fetchDisneyCodeFromGmail } = require("../src/services/gmailCodeService");

function makeEmail({ uid, subject, body, html, date }) {
    const dateHeader = date.toUTCString();
    const mimeBody = html
        ? [
            'Content-Type: multipart/alternative; boundary="disney-test-boundary"',
            "",
            "--disney-test-boundary",
            "Content-Type: text/plain; charset=utf-8",
            "",
            body,
            "--disney-test-boundary",
            "Content-Type: text/html; charset=utf-8",
            "",
            html,
            "--disney-test-boundary--",
        ]
        : ["Content-Type: text/plain; charset=utf-8", "", body];
    return {
        uid,
        date,
        raw: [
            "From: Disney+ <disneyplus@trx.mail2.disneyplus.com>",
            "To: Client <client@example.test>",
            `Subject: ${subject}`,
            `Date: ${dateHeader}`,
            "MIME-Version: 1.0",
            ...mimeBody,
        ].join("\r\n"),
    };
}

test("blocks the code if Disney has a new-login notice after purchase", async () => {
    const now = Date.now();
    const purchaseDate = new Date(now - 4 * 60 * 1000);
    mailboxMessages = [
        makeEmail({
            uid: 1,
            subject: "Tu código de acceso único para Disney+",
            body: "Tu código vence en 15 minutos.\r\n654321",
            date: new Date(now - 2 * 60 * 1000),
        }),
        makeEmail({
            uid: 2,
            subject: "Nuevo inicio de sesión",
            body: "Identificamos un nuevo inicio de sesión en Disney+. Tipo de dispositivo: Chrome Browser.",
            date: new Date(now - 60 * 1000),
        }),
    ];

    const result = await fetchDisneyCodeFromGmail({
        toEmail: "client@example.test",
        gmailFromContains: "disneyplus.com",
        purchasedAt: purchaseDate,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "device_already_entered");
});

test("returns only an official Disney OTP when no new-login notice exists", async () => {
    const now = Date.now();
    mailboxMessages = [makeEmail({
        uid: 3,
        subject: "Tu código de acceso único para Disney+",
        body: "Tu código vence en 15 minutos.\r\n654321",
        date: new Date(now - 60 * 1000),
    })];

    const result = await fetchDisneyCodeFromGmail({
        toEmail: "client@example.test",
        gmailFromContains: "disneyplus.com",
        purchasedAt: new Date(now - 3 * 60 * 1000),
    });

    assert.equal(result.ok, true);
    assert.equal(result.code, "654321");
});

test("extracts the OTP from the HTML alternative when the text part omits it", async () => {
    const now = Date.now();
    mailboxMessages = [makeEmail({
        uid: 4,
        subject: "Tu código de acceso único para Disney+",
        body: "Tu código de acceso vencerá en 15 minutos.",
        html: "<html><body><p>Tu código de acceso único para Disney+</p><strong>246810</strong></body></html>",
        date: new Date(now - 60 * 1000),
    })];

    const result = await fetchDisneyCodeFromGmail({
        toEmail: "client@example.test",
        gmailFromContains: "disneyplus.com",
        purchasedAt: new Date(now - 3 * 60 * 1000),
    });

    assert.equal(result.ok, true);
    assert.equal(result.code, "246810");
});

test("blocks a new-login notice found only in the HTML alternative", async () => {
    const now = Date.now();
    mailboxMessages = [
        makeEmail({
            uid: 5,
            subject: "Tu código de acceso único para Disney+",
            body: "Tu código vence en 15 minutos.",
            html: "<html><body><strong>135790</strong></body></html>",
            date: new Date(now - 2 * 60 * 1000),
        }),
        makeEmail({
            uid: 6,
            subject: "Nuevo inicio de sesión",
            body: "Revisa la actividad reciente de tu cuenta.",
            html: "<html><body><p>Identificamos un nuevo inicio de sesión en Disney+.</p></body></html>",
            date: new Date(now - 60 * 1000),
        }),
    ];

    const result = await fetchDisneyCodeFromGmail({
        toEmail: "client@example.test",
        gmailFromContains: "disneyplus.com",
        purchasedAt: new Date(now - 4 * 60 * 1000),
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "device_already_entered");
});
