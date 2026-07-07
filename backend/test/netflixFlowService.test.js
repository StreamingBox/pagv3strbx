const assert = require("node:assert/strict");
const test = require("node:test");
const { __test } = require("../src/services/netflixFlowService");

test("Netflix approval parser detects pending approval pages", () => {
    const html = `
        <main>
            <h1>Aprueba la nueva solicitud de inicio de sesion</h1>
            <p>Si reconoces el siguiente dispositivo, haz clic en Aprobar.</p>
            <form method="post" action="/account/approve">
                <input type="hidden" name="token" value="abc123">
                <button type="submit" name="choice" value="approve">Aprobar</button>
                <button type="submit" name="choice" value="reject">Rechazar</button>
            </form>
        </main>
    `;

    assert.equal(__test.pageNeedsApproval(html), true);
    assert.equal(__test.pageLooksApproved(html), false);

    const submission = __test.buildApprovalFormSubmission(html, "https://www.netflix.com/security/request");
    assert.equal(submission.method, "POST");
    assert.equal(submission.url, "https://www.netflix.com/account/approve");
    assert.equal(submission.params.get("token"), "abc123");
    assert.equal(submission.params.get("choice"), "approve");
});

test("Netflix approval parser recognizes confirmed approval text", () => {
    const html = "<h1>Solicitud aprobada</h1><p>Vuelve a tu dispositivo para continuar.</p>";

    assert.equal(__test.pageLooksApproved(html), true);
    assert.equal(__test.pageNeedsApproval(html), false);
});

test("Netflix approval parser follows approval links and ignores reject links", () => {
    const html = `
        <a href="/account/reject">Rechazar</a>
        <a href="/account/approve?token=abc123">Aprobar</a>
    `;

    assert.equal(
        __test.findApprovalActionLink(html, "https://www.netflix.com/security/request"),
        "https://www.netflix.com/account/approve?token=abc123"
    );
});

test("Netflix approval parser extracts the device name before the date line", () => {
    const text = [
        "Hola, Profile One:",
        "Si reconoces el siguiente dispositivo, haz clic en Aprobar.",
        "JVC - Smart TV",
        "6 de julio, 7:51 p. m. COT",
        "Aprobar",
        "Rechazar",
    ].join("\n");

    assert.equal(__test.extractApprovalDeviceName(text), "JVC - Smart TV");
});
