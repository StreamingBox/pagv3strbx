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

test("Netflix approval parser recognizes the current all-set approval page", () => {
    const html = "<h1>¡Todo listo!</h1><p>Ya puedes disfrutar de Netflix en tu JVC - Smart TV.</p>";

    assert.equal(__test.pageLooksApproved(html), true);
    assert.equal(__test.pageNeedsApproval(html), false);
});

test("Netflix approval parser does not treat the ilum React shell as approved", () => {
    const html = `
        <div id="appMountPoint"><div></div></div>
        <script>
            window.netflix = window.netflix || {};
            netflix.reactContext = {"template":"./ui/stagingMagicLink/app","models":{"serverDefs":{"data":{"originalUrl":"/ilum?code=abc123"}}}};
        </script>
    `;

    assert.equal(__test.pageLooksApproved(html), false);
    assert.equal(__test.pageNeedsApproval(html), false);
    assert.equal(__test.pageLooksInvalidApproval(html, "https://www.netflix.com/ilum?code=abc123"), false);
});

test("Netflix approval parser treats NotFound redirects as invalid approval links", () => {
    const html = "<h1>Lost your way?</h1><p>Sorry, we can't find that page.</p><p>Error Code NSES-404</p>";

    assert.equal(__test.pageLooksInvalidApproval(html, "https://www.netflix.com/NotFound?prev=..."), true);
    assert.equal(__test.pageLooksApproved(html), false);
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

test("Netflix approval parser accepts the current ilum approval link format", () => {
    const html = `
        <a href="https://www.netflix.com/denysignin">Rechazar</a>
        <a href="https://www.netflix.com/ilum?code=6sHzU5Kj">Aprobar</a>
    `;
    const text = [
        "Aprobar [https://www.netflix.com/ilum?code=6sHzU5Kj]",
        "Rechazar [https://www.netflix.com/denysignin]",
    ].join("\n");

    assert.equal(
        __test.findApprovalActionLink(html, "https://www.netflix.com/security/request"),
        "https://www.netflix.com/ilum?code=6sHzU5Kj"
    );
    assert.equal(
        __test.findNetflixTextActionLink(text, ["aprobar", "approve"]),
        "https://www.netflix.com/ilum?code=6sHzU5Kj"
    );
    assert.equal(__test.isNetflixDirectApprovalUrl("https://www.netflix.com/ilum?code=6sHzU5Kj"), true);
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
