const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

const {
    getLiveonixProviderConfigForProvider,
} = require("../src/config/liveonixProvider");
const {
    fetchCodeFromLiveonixProvider,
    __test: liveonixTest,
} = require("../src/services/liveonixProviderCodeService");

test("LiveOnix solo se habilita con la cuenta marcada y sus credenciales", () => {
    const disabled = getLiveonixProviderConfigForProvider("strbx", {
        LIVEONIX_PROVIDER_USERNAME: "user",
        LIVEONIX_PROVIDER_PASSWORD: "pass",
    });
    const enabled = getLiveonixProviderConfigForProvider("LiveOnix", {
        LIVEONIX_PROVIDER_USERNAME: "user",
        LIVEONIX_PROVIDER_PASSWORD: "pass",
    });

    assert.equal(disabled.requested, false);
    assert.equal(disabled.enabled, false);
    assert.equal(enabled.requested, true);
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.loginPath, "/login");
    assert.equal(enabled.inboxPath, "/");
});

test("filtra la bandeja por destinatario y asunto exacto de Netflix", () => {
    const links = liveonixTest.parseInboxLinks(`
        <div class="mail-card">
            <span>De: Netflix</span>
            <span>Para: otra@example.com</span>
            <span>Asunto: Netflix: Tu código de inicio de sesión</span>
            <a href="/leer/28510">Ver mensaje</a>
        </div>
        <div class="mail-card">
            <span>De: Netflix</span>
            <span>Para: cliente@example.com</span>
            <span>Asunto: Completa tu solicitud de restablecimiento de contraseña</span>
            <a href="/leer/28509">Ver mensaje</a>
        </div>
        <div class="mail-card">
            <span>De: Netflix</span>
            <span>Para: cliente@example.com</span>
            <span>Asunto: Netflix: Tu código de inicio de sesión</span>
            <a href="/leer/28508">Ver mensaje</a>
        </div>
    `, "cliente@example.com");

    assert.deepEqual(links.map((item) => item.href), ["/leer/28508"]);
});

test("lee el destinatario protegido por Cloudflare desde data-cfemail", () => {
    const encodeCloudflareEmail = (email, key = 0x5a) => {
        const bytes = [...email].map((character) => (character.charCodeAt(0) ^ key).toString(16).padStart(2, "0"));
        return `${key.toString(16).padStart(2, "0")}${bytes.join("")}`;
    };
    const sender = encodeCloudflareEmail("info@example.com");
    const recipient = encodeCloudflareEmail("cliente@example.com");

    const links = liveonixTest.parseInboxLinks(`
        <div class="ticket-card">
            <div>DE: Netflix <a href="/cdn-cgi/l/email-protection" data-cfemail="${sender}">[email&nbsp;protected]</a></div>
            <div>PARA: <a href="/cdn-cgi/l/email-protection" data-cfemail="${recipient}">[email&nbsp;protected]</a></div>
            <div>Asunto: Netflix: Tu código de inicio de sesión</div>
            <a href="/leer/28511">Ver mensaje</a>
        </div>
    `, "cliente@example.com");

    assert.deepEqual(links.map((item) => item.href), ["/leer/28511"]);
});

test("extrae cuatro dígitos del mensaje de Netflix", () => {
    const code = liveonixTest.extractLiveonixCode(`
        <div class="info-header">ASUNTO: Netflix: Tu código de inicio de sesión</div>
        <div class="message-body">Ingresa este código para iniciar sesión: <strong>1 0 2 9</strong></div>
    `);

    assert.equal(code, "1029");
});

test("filtra el asunto temporal y encuentra el enlace Obtener código", () => {
    const links = liveonixTest.parseInboxLinks(`
        <div class="mail-card">
            <span>De: Netflix</span>
            <span>Para: cliente@example.com</span>
            <span>Asunto: Netflix: Tu código de inicio de sesión</span>
            <a href="/leer/28512">Ver mensaje</a>
        </div>
        <div class="mail-card">
            <span>De: Netflix</span>
            <span>Para: cliente@example.com</span>
            <span>Asunto: Tu código de acceso temporal de Netflix</span>
            <a href="/leer/28513">Ver mensaje</a>
        </div>
    `, "cliente@example.com", 12, /asunto\s*:\s*tu\s+c[oó]digo\s+de\s+acceso\s+temporal\s+de\s+netflix\b/i);

    assert.deepEqual(links.map((item) => item.href), ["/leer/28513"]);

    const action = liveonixTest.extractTemporaryAction(`
        <div>Tu código de acceso temporal de Netflix</div>
        <a href="/obtener/28513">Obtener código</a>
    `, "https://liveonix.myes.space/leer/28513");
    assert.deepEqual(action, {
        method: "GET",
        url: "https://liveonix.myes.space/obtener/28513",
    });
});

test("extrae el código temporal de la página final de LiveOnix", () => {
    const code = liveonixTest.extractLiveonixTemporaryCode(`
        <h1>Usa este código para ver Netflix en tu dispositivo</h1>
        <p>Ingresa este código en el dispositivo solicitante para obtener acceso temporal.</p>
        <strong>1 9 6 4</strong>
        <p>Este código vence después de 15 minutos.</p>
    `);

    assert.equal(code, "1964");
});

test("inicia sesión con redirección, conserva la cookie y devuelve el código correcto", async () => {
    const originalRequest = axios.request;
    const calls = [];
    axios.request = async (options) => {
        calls.push(options);
        if (options.method === "GET" && options.url.endsWith("/login")) {
            return { status: 200, headers: {}, data: "<form><input name=\"username\"><input name=\"password\"></form>" };
        }
        if (options.method === "POST" && options.url.endsWith("/login")) {
            assert.match(options.data, /username=user/);
            assert.match(options.data, /password=pass/);
            return { status: 302, headers: { "set-cookie": ["session=test-session; Path=/; HttpOnly"], location: "/" }, data: "" };
        }
        if (options.method === "GET" && options.url === "https://liveonix.myes.space/") {
            assert.match(options.headers.Cookie, /session=test-session/);
            return {
                status: 200,
                headers: {},
                data: `
                    <div class="mail-card">
                        <span>De: Netflix</span>
                        <span>Para: cliente@example.com</span>
                        <span>Asunto: Netflix: Tu código de inicio de sesión</span>
                        <a href="/leer/28508">Ver mensaje</a>
                    </div>
                `,
            };
        }
        if (options.method === "GET" && options.url.endsWith("/leer/28508")) {
            assert.match(options.headers.Cookie, /session=test-session/);
            return {
                status: 200,
                headers: {},
                data: `
                    <div class="info-header">ASUNTO: Netflix: Tu código de inicio de sesión</div>
                    <div class="message-body">Ingresa este código: <strong>8 2 4 5</strong></div>
                `,
            };
        }
        throw new Error(`Unexpected request: ${options.method} ${options.url}`);
    };

    try {
        const result = await fetchCodeFromLiveonixProvider({
            email: "cliente@example.com",
            config: {
                enabled: true,
                baseUrl: "https://liveonix.myes.space",
                username: "user",
                password: "pass",
                timeoutMs: 5000,
                maxMessages: 12,
                loginPath: "/login",
                inboxPath: "/",
            },
        });

        assert.deepEqual(result, {
            ok: true,
            type: "code",
            code: "8245",
            source: "liveonix_provider",
        });
        assert.equal(calls.length, 4);
    } finally {
        axios.request = originalRequest;
    }
});

test("consulta el correo temporal, pulsa Obtener código y devuelve cuatro dígitos", async () => {
    const originalRequest = axios.request;
    const calls = [];
    axios.request = async (options) => {
        calls.push(options);
        if (options.method === "GET" && options.url.endsWith("/login")) {
            return { status: 200, headers: {}, data: "<form><input name=\"username\"><input name=\"password\"></form>" };
        }
        if (options.method === "POST" && options.url.endsWith("/login")) {
            return { status: 302, headers: { "set-cookie": ["session=temp-session; Path=/; HttpOnly"], location: "/" }, data: "" };
        }
        if (options.method === "GET" && options.url === "https://liveonix.myes.space/") {
            return {
                status: 200,
                headers: {},
                data: `
                    <div class="mail-card">
                        <span>De: Netflix</span>
                        <span>Para: cliente@example.com</span>
                        <span>Asunto: Tu código de acceso temporal de Netflix</span>
                        <a href="/leer/28513">Ver mensaje</a>
                    </div>
                `,
            };
        }
        if (options.method === "GET" && options.url.endsWith("/leer/28513")) {
            assert.match(options.headers.Cookie, /session=temp-session/);
            return {
                status: 200,
                headers: {},
                data: `
                    <div>Asunto: Tu código de acceso temporal de Netflix</div>
                    <a href="/obtener/28513">Obtener código</a>
                `,
            };
        }
        if (options.method === "GET" && options.url.endsWith("/obtener/28513")) {
            assert.match(options.headers.Cookie, /session=temp-session/);
            return {
                status: 200,
                headers: {},
                data: `
                    <h1>Usa este código para ver Netflix en tu dispositivo</h1>
                    <p>Ingresa este código en el dispositivo solicitante para obtener acceso temporal.</p>
                    <strong>1 9 6 4</strong>
                `,
            };
        }
        throw new Error(`Unexpected request: ${options.method} ${options.url}`);
    };

    try {
        const result = await fetchCodeFromLiveonixProvider({
            email: "cliente@example.com",
            action: "temporary",
            config: {
                enabled: true,
                baseUrl: "https://liveonix.myes.space",
                username: "user",
                password: "pass",
                timeoutMs: 5000,
                maxMessages: 12,
                loginPath: "/login",
                inboxPath: "/",
            },
        });

        assert.deepEqual(result, {
            ok: true,
            type: "code",
            code: "1964",
            source: "liveonix_provider",
        });
        assert.equal(calls.length, 5);
        assert.equal(calls[4].url, "https://liveonix.myes.space/obtener/28513");
    } finally {
        axios.request = originalRequest;
    }
});
