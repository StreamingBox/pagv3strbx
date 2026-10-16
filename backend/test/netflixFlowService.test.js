const assert = require("node:assert/strict");
const test = require("node:test");
const axios = require("axios");
const { __test } = require("../src/services/netflixFlowService");

test("Netflix approval only succeeds after the final confirmation page", async () => {
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config) => ({
        data: "<h1>Todo listo</h1><p>Ya puedes disfrutar de Netflix en tu JVC - Smart TV.</p>",
        status: 200,
        statusText: "OK",
        headers: {},
        config,
        request: { res: { responseUrl: "https://www.netflix.com/ilum?code=abc123" } },
    });

    try {
        const result = await __test.scrapeApproveLink(
            "https://www.netflix.com/ilum?code=abc123",
            "JVC - Smart TV"
        );

        assert.deepEqual(result, {
            ok: true,
            type: "approval",
            deviceName: "JVC - Smart TV",
        });
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("Netflix approval does not report success for an unconfirmed page", async () => {
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config) => ({
        data: '<div id="appMountPoint"></div>',
        status: 200,
        statusText: "OK",
        headers: {},
        config,
        request: { res: { responseUrl: "https://www.netflix.com/ilum?code=abc123" } },
    });

    try {
        const result = await __test.scrapeApproveLink(
            "https://www.netflix.com/ilum?code=abc123",
            "JVC - Smart TV"
        );

        assert.equal(result.ok, false);
        assert.equal(result.status, "not_confirmed");
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

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

test("Netflix approval parser does not expire a fresh page because of generic help text", () => {
    const html = `
        <h1>Aprueba la nueva solicitud de inicio de sesión</h1>
        <p>Si no reconoces la solicitud, ignora este email o solicita uno nuevo.</p>
        <a href="https://www.netflix.com/ilum?code=abc123">Aprobar</a>
    `;

    assert.equal(__test.pageLooksExpired(html), false);
    assert.equal(__test.pageNeedsApproval(html), true);
});

test("Netflix approval parser still detects an explicitly expired approval link", () => {
    const html = "<p>El enlace de aprobación de Netflix ya no es válido.</p>";

    assert.equal(__test.pageLooksExpired(html), true);
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

test("Netflix approval parser never selects a reject ilum link", () => {
    const html = `
        <a href="https://www.netflix.com/ilum?code=reject123&action=reject">Rechazar</a>
        <a href="https://www.netflix.com/ilum?code=approve123">Aprobar</a>
    `;

    assert.equal(
        __test.findNetflixButtonLink(html, ["aprobar", "approve"], ["netflix.com/ilum", "/ilum"]),
        "https://www.netflix.com/ilum?code=approve123"
    );
    assert.equal(
        __test.getSafeNetflixApprovalUrl("https://www.netflix.com/ilum?code=reject123&action=reject"),
        ""
    );
});

test("Netflix approval action only accepts an exact secure Netflix ilum URL", () => {
    const valid = "https://www.netflix.com/ilum?code=abc123";

    assert.equal(__test.getSafeNetflixApprovalUrl(valid), valid);
    assert.equal(__test.getSafeNetflixApprovalUrl("http://www.netflix.com/ilum?code=abc123"), "");
    assert.equal(__test.getSafeNetflixApprovalUrl("https://www.netflix.com.evil.example/ilum?code=abc123"), "");
    assert.equal(__test.getSafeNetflixApprovalUrl("https://www.netflix.com/account/approve?code=abc123"), "");
    assert.equal(__test.getSafeNetflixApprovalUrl("https://www.netflix.com/ilum"), "");
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

test("Netflix flow detects when a login-code email is requested as temporary access", () => {
    assert.equal(
        __test.detectNetflixActionMismatch("Netflix: Tu codigo de inicio de sesion", "temporary"),
        "code"
    );
});

test("Netflix flow detects when an approval email is requested as a login code", () => {
    assert.equal(
        __test.detectNetflixActionMismatch("Netflix: Nueva solicitud de inicio de sesion", "code"),
        "approve"
    );
});

test("Netflix flow keeps approval emails classified as approval when requested", () => {
    assert.equal(
        __test.detectNetflixActionMismatch("Netflix: Nueva solicitud de inicio de sesion", "approve"),
        ""
    );
    assert.equal(
        __test.detectNetflixSubjectAction("Netflix: Nueva solicitud de inicio de sesion"),
        "approve"
    );
});
