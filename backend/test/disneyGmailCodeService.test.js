const assert = require("node:assert/strict");
const test = require("node:test");
const imapConfig = require("../src/utils/imapConfig");

let mailboxMessages = [];
let searches = [];
test.beforeEach(() => {
    mailboxMessages = [];
    searches = [];
});
const connection = {
    async openBox() {},
    async end() {},
    async search(criteria, options) {
        searches.push({ criteria, options });
        const uidCriterion = criteria.find((criterion) => Array.isArray(criterion) && criterion[0] === "UID");
        if (uidCriterion) {
            return mailboxMessages.filter(({ uid }) => uidCriterion.slice(1).includes(uid)).map(({ uid, raw }) => ({
                attributes: { uid },
                parts: [{ which: "", body: raw }],
            }));
        }
        return mailboxMessages.map((message) => ({
            attributes: { uid: message.uid, date: message.date },
            parts: [{
                which: "HEADER.FIELDS (FROM)",
                body: { from: [message.from] },
            }],
        }));
    },
};

imapConfig.getImapConfig = () => ({ host: "imap.example.test" });
imapConfig.connectImapWithTlsFallback = async () => connection;
const { fetchDisneyCodeFromGmail } = require("../src/services/gmailCodeService");

function makeEmail({ uid, subject, body, html, date, from = "Disney+ <disneyplus@trx.mail2.disneyplus.com>", to = "Client <client@example.test>" }) {
    const dateHeader = date.toUTCString();
    const mimeBody = html && body == null
        ? ["Content-Type: text/html; charset=utf-8", "", html]
        : html
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
        from,
        raw: [
            `From: ${from}`,
            ...(to ? [`To: ${to}`] : []),
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
    assert.deepEqual(searches[1], { criteria: [["UID", 2, 1]], options: { bodies: [""], markSeen: false } });
    assert.equal(searches.length, 2);
});

test("an empty Disney search does not fall back to the entire inbox", async () => {
    const result = await fetchDisneyCodeFromGmail({
        toEmail: " Client@Example.Test ",
        purchasedAt: new Date(Date.now() - 40 * 86400_000),
    });

    assert.equal(result.status, "disney_code_not_found");
    assert.equal(searches.length, 1);
    assert.deepEqual(searches[0].criteria.slice(1), [
        ["TO", "client@example.test"],
        ["OR", ["FROM", "disneyplus.com"], ["FROM", "my.disney.com"]],
    ]);
});

test("Disney messages must match the assigned address, not a substring or display name", async () => {
    const now = Date.now();
    mailboxMessages = ["other-client@example.test", "client@example.test <different@example.test>", ""].map((to, index) => makeEmail({
        uid: index + 1,
        subject: "Your one-time passcode for Disney+",
        body: "123456",
        date: new Date(now - 1000),
        to,
    }));
    const result = await fetchDisneyCodeFromGmail({ toEmail: "client@example.test", purchasedAt: new Date(now - 2000) });

    assert.equal(result.status, "disney_code_not_found");
    assert.equal(result.code, undefined);
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

test("accepts the current MyDisney OTP sender with the legacy configured sender value", async () => {
    const now = Date.now();
    mailboxMessages = [makeEmail({
        uid: 8,
        from: "MyDisney <verify@my.disney.com>",
        subject: "Your one-time passcode for Disney+",
        html: "<html><body><h1>Here's your one-time passcode for Disney+</h1><p>It will expire in 15 minutes.</p><strong>482619</strong></body></html>",
        date: new Date(now - 60 * 1000),
    })];

    const result = await fetchDisneyCodeFromGmail({
        toEmail: "client@example.test",
        gmailFromContains: "disneyplus.com",
        purchasedAt: new Date(now - 3 * 60 * 1000),
    });

    assert.equal(result.ok, true);
    assert.equal(result.code, "482619");
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

test("extracts the visible code from an HTML email whose generated text includes tracking numbers", async () => {
    const now = Date.now();
    mailboxMessages = [makeEmail({
        uid: 7,
        subject: "Tu código de acceso único para Disney+",
        html: '<html><body><h1>Tu código de acceso único para Disney+</h1><p>Este código de acceso vencerá en 15 minutos.</p><table><tr><td style="font-size: 28px; letter-spacing: 4px">024681</td></tr></table><a href="https://links.example.test/123456/789012">Centro de ayuda</a></body></html>',
        date: new Date(now - 60 * 1000),
    })];

    const result = await fetchDisneyCodeFromGmail({
        toEmail: "client@example.test",
        gmailFromContains: "disneyplus.com",
        purchasedAt: new Date(now - 12 * 60 * 1000),
    });

    assert.equal(result.ok, true);
    assert.equal(result.code, "024681");
});
