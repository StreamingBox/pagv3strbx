const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");
const { __test } = require("../src/server");

let browser;
before(async () => {
    const options = { headless: true };
    if (process.env.NETFLIX_TV_SETUP_BROWSER_PATH) options.executablePath = process.env.NETFLIX_TV_SETUP_BROWSER_PATH;
    browser = await chromium.launch(options);
});
after(async () => { await browser?.close(); });

async function fixture(t, html, url = "https://www.netflix.com/test/login") {
    const page = await browser.newPage();
    t.after(() => page.close());
    await page.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto(url);
    return page;
}

test("password login confirms a TV connection without retrieving an email code", async (t) => {
    const page = await fixture(t, `<form onsubmit="event.preventDefault(); document.body.innerHTML = '<h1>Tu TV ahora esta conectada</h1>'">
        <input name="password" type="password"><button type="submit">Continuar</button></form>`);
    const logs = [];
    t.mock.method(console, "log", (line) => logs.push(line));
    const result = await __test.submitAccountPassword(page, "fixture password ");
    assert.equal(result.status, "completed");
    assert.equal(JSON.stringify(result).includes("fixture password"), false);
    assert.equal(logs.join(" ").includes("fixture password"), false);
});

test("password login can advance to the email PIN screen", async (t) => {
    const page = await fixture(t, `<form onsubmit="event.preventDefault(); document.body.innerHTML = '<p>Ingresa el codigo enviado al correo</p><input name=code maxlength=4>'">
        <input name="password" type="password"><button type="submit">Continuar</button></form>`);
    assert.equal(await __test.submitAccountPassword(page, "fixture-password"), null);
    assert.equal(await __test.waitForLoginCodeScreen(page, 100), true);
});

test("a stale alert does not end the password request before Netflix responds", async (t) => {
    const page = await fixture(t, `<p role="alert">Algo salio mal. Reintentalo en unos minutos.</p>
        <form onsubmit="event.preventDefault(); setTimeout(() => document.body.innerHTML = '<h1>Tu TV ahora esta conectada</h1>', 5000)">
        <input name="password" type="password"><button type="submit">Continuar</button></form>`);
    assert.equal((await __test.submitAccountPassword(page, "fixture-password")).status, "completed");
});

test("incorrect passwords produce a failure instead of success", async (t) => {
    const page = await fixture(t, `<form onsubmit="event.preventDefault(); document.body.innerHTML = '<p role=alert>La contrasena es incorrecta.</p>'">
        <input name="password" type="password"><button type="submit">Continuar</button></form>`);
    assert.equal((await __test.submitAccountPassword(page, "fixture-password")).status, "account_password_rejected");
});

test("the eight-digit TV form is not mistaken for the email PIN screen", async (t) => {
    const page = await fixture(t, "<p>Codigo de tu TV</p>" + "<input type=tel maxlength=1>".repeat(8));
    assert.equal(await __test.waitForLoginCodeScreen(page, 100), false);
});

test("the TV code can use Netflix's dedicated button outside the form", async (t) => {
    const page = await fixture(t, '<form data-uia="witcher-code-form">'
        + '<input type="tel" maxlength="1">'.repeat(8) + '</form>'
        + `<button type="button" data-uia="witcher-code-submit"
            onclick="document.body.innerHTML='<h1>Inicia sesion</h1><input autocomplete=email>'">Ingresa el codigo para continuar</button>`);
    assert.equal(await __test.submitTvCode(page, '00895705'), null);
    assert.equal(await page.getByRole('heading').innerText(), 'Inicia sesion');
});

test("the TV step waits for the asynchronous form handlers before typing", async (t) => {
    const page = await browser.newPage();
    t.after(() => page.close());
    await page.route('**/*', async (route) => {
        if (new URL(route.request().url()).pathname === '/late-tv.js') {
            await new Promise((resolve) => setTimeout(resolve, 2500));
            return route.fulfill({ contentType: 'application/javascript', body: `
                const values = Array(8).fill('');
                document.querySelectorAll('input').forEach((input, index) => input.addEventListener('input', () => {
                    values[index] = input.value;
                    document.querySelector('button').disabled = values.join('') !== '00895705';
                }));` });
        }
        return route.fulfill({ contentType: 'text/html', body: '<form data-uia="witcher-code-form">'
            + '<input type="tel" maxlength="1">'.repeat(8) + '</form>'
            + `<button type="button" disabled data-uia="witcher-code-submit"
                onclick="document.body.innerHTML='<h1>Inicia sesion</h1><input autocomplete=email>'">Continuar</button>
                <script async src="/late-tv.js"></script>` });
    });
    assert.equal(await __test.submitTvCode(page, '00895705'), null);
    assert.equal(await page.getByRole('heading').innerText(), 'Inicia sesion');
});

test("the email step waits for asynchronous login handlers before typing", async (t) => {
    const page = await browser.newPage();
    t.after(() => page.close());
    await page.route('**/*', async (route) => {
        if (new URL(route.request().url()).pathname === '/late-email.js') {
            await new Promise((resolve) => setTimeout(resolve, 2500));
            return route.fulfill({ contentType: 'application/javascript', body: `
                let email = '';
                document.querySelector('input').addEventListener('input', (event) => email = event.target.value);
                window.doSubmit = () => document.body.innerHTML = email === 'fixture@example.test'
                    ? '<h1>Ingresa el codigo enviado al correo</h1><input name=code maxlength=4>'
                    : '<p>Algo salio mal</p>';` });
        }
        return route.fulfill({ contentType: 'text/html', body: `<form onsubmit="event.preventDefault(); window.doSubmit?.()">
            <input autocomplete="email" type="email"><button type="submit">Continuar</button></form>
            <script async src="/late-email.js"></script>` });
    });
    await page.goto('https://www.netflix.com/test/login', { waitUntil: 'domcontentloaded' });
    assert.equal(await __test.submitAccountEmail(page, 'fixture@example.test'), null);
    assert.equal(await __test.waitForLoginCodeScreen(page, 100), true);
});

test("an email PIN is submitted when Netflix requires the Continue button", async (t) => {
    const page = await fixture(t, `<p>Ingresa el codigo enviado al correo</p>
        <form onsubmit="event.preventDefault(); document.body.innerHTML = '<h1>Tu TV ahora esta conectada</h1>'">
        <input name="code" autocomplete="one-time-code" maxlength="4">
        <button type="submit">Continuar</button></form>`);
    assert.equal(await __test.fillLoginCode(page, "0482"), null);
    assert.equal(__test.isTvCompletion(await page.locator("body").innerText(), page.url()), true);
});

test("only a Netflix completion screen is accepted, not a generic navigation link", () => {
    assert.equal(__test.isTvCompletion("Ir a Netflix", "https://www.netflix.com/login"), false);
    assert.equal(__test.isTvCompletion("Listo", "https://www.netflix.com/tv/out/success"), true);
    assert.equal(__test.isTvCompletion("Tu TV ahora esta conectada", "https://other.example.test/success"), false);
});

test("the TV-ready heading on Netflix's login form is not a completed connection", async (t) => {
    const page = await fixture(t, `<h1>Tu TV esta lista para ver Netflix</h1>
        <form><input autocomplete="email"><input name="password" type="password">
        <button type="submit">Continuar</button></form>`, "https://www.netflix.com/co/login");
    assert.equal(await __test.isPageTvCompletion(page, await page.locator("body").innerText()), false);
    assert.equal(await __test.waitForTvCompletion(page, 100), false);
});

test("credentials are not entered on another origin", async (t) => {
    const page = await fixture(t, '<input name="password" type="password">', "https://other.example.test/login");
    assert.equal((await __test.submitAccountPassword(page, "fixture-password")).status, "untrusted_login_page");
    assert.equal(await page.locator("input").inputValue(), "");
});

test("Netflix's expand-action identifier does not mean the help menu is already open", async (t) => {
    const page = await fixture(t, `<button data-uia="help-menu-toggle-expanded"
        onclick="this.dataset.uia='help-menu-toggle-collapsed'; document.getElementById('menu').hidden=false">Obtener ayuda</button>
        <div id="menu" hidden><button data-uia="help-menu-item-0">Usar un codigo de inicio</button></div>`);
    const result = await __test.findLoginCodeAction(page, "test");
    assert.equal(result.helpExpanded, true);
    assert.equal(await result.loginCodeAction.innerText(), "Usar un codigo de inicio");
});

test("an open help menu is not closed when it has no code option", async (t) => {
    const page = await fixture(t, `<button data-uia="help-menu-toggle-collapsed"
        onclick="document.getElementById('menu').hidden=true">Obtener ayuda</button>
        <div id="menu"><button data-uia="help-menu-item-0">Olvide mi correo</button></div>`);
    const result = await __test.findLoginCodeAction(page, "test");
    assert.equal(result.loginCodeAction, null);
    assert.equal(await page.locator('#menu').isVisible(), true);
});

test("aria-expanded is authoritative when the help toggle also has a conflicting identifier", async (t) => {
    const page = await fixture(t, `<button aria-expanded="false" data-uia="help-menu-toggle-expanded"
        onclick="this.setAttribute('aria-expanded','true'); document.getElementById('menu').hidden=false">Obtener ayuda</button>
        <div id="menu" hidden><button role="menuitem">Use a sign-in code</button></div>`);
    const result = await __test.findLoginCodeAction(page, "test");
    assert.equal(result.helpExpanded, true);
    assert.ok(result.loginCodeAction);
});

test("an email-stage Netflix error does not trigger a password attempt", async (t) => {
    const page = await fixture(t, `<p role="alert"></p><form
        onsubmit="event.preventDefault();document.querySelector('[role=alert]').textContent='Algo salio mal. Reintentalo en unos minutos.'">
        <input type="email" autocomplete="email"><input name="password" type="password">
        <button type="submit">Continuar</button></form>`);
    const logs = [];
    t.mock.method(console, "log", (line) => logs.push(line));
    const result = await __test.submitAccountEmail(page, 'fixture@example.test');
    assert.equal(result.status, 'netflix_flow_error');
    assert.equal(result.diagnostics.steps.find((step) => step.key === 'account_email_filled').state, 'completed');
    assert.equal(logs.some((line) => line.includes('code_action_search_completed')), false);
    assert.equal(await page.locator('input[type=password]').inputValue(), '');
});
