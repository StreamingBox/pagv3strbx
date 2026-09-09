const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

const {
    extractJeffProviderCode,
    fetchCodeFromJeffProvider,
} = require("../src/services/jeffProviderCodeService");
const {
    getJeffProviderConfigForSlug,
} = require("../src/config/jeffProvider");

test("extracts a spaced PIN from the provider inbox", () => {
    const html = `
        <main>
            <section id="recent-code">
                <h2>Codigo para Netflix</h2>
                <strong>1 0 9 4</strong>
            </section>
        </main>
    `;

    assert.equal(extractJeffProviderCode(html), "1094");
});

test("extracts a PIN stored in an input value", () => {
    const html = `<input id="verification-code" value="6 3 6 7" />`;

    assert.equal(extractJeffProviderCode(html), "6367");
});

test("does not mistake dates for provider codes", () => {
    const html = `
        <main>
            <p>Fecha de consulta: 22/08/2026</p>
            <p>No hay codigo disponible.</p>
        </main>
    `;

    assert.equal(extractJeffProviderCode(html), "");
});

test("prefers the code after the Netflix instruction over date digits", () => {
    const html = `
        <main>
            <p>Fecha: Wed, 9 Sep 2026 23:24:14 +0000</p>
            <h1>Ingresa este código para iniciar sesión</h1>
            <div>4497</div>
        </main>
    `;

    assert.equal(extractJeffProviderCode(html), "4497");
});

test("does not report a provider error when the inbox has no recent code", async () => {
    const originalRequest = axios.request;
    axios.request = async (options) => {
        if (options.method === "GET" && options.url.endsWith("/app-login")) {
            return { status: 200, headers: {}, data: `<form action="/login" method="post"><input name="phone" /><input name="password" type="password" /></form>` };
        }
        if (options.method === "POST" && options.url.endsWith("/login")) {
            return { status: 302, headers: { location: "/v1/user-panel/inbox" }, data: "" };
        }
        if (options.method === "GET" && options.url.endsWith("/user-panel/inbox")) {
            return { status: 200, headers: {}, data: `<form action="/v1/user-panel/inbox_client" method="post"><input name="correo_buscar" /></form>` };
        }
        if (options.method === "POST" && options.url.endsWith("/user-panel/inbox_client")) {
            return { status: 200, headers: {}, data: `<p>Un nuevo dispositivo está usando tu cuenta. No hay código todavía.</p>` };
        }
        throw new Error(`Unexpected request: ${options.method} ${options.url}`);
    };

    try {
        const result = await fetchCodeFromJeffProvider({
            email: "cliente@ejemplo.com",
            config: {
                enabled: true,
                baseUrl: "https://proveedores-jeff.store/v1",
                username: "provider-user",
                password: "provider-pass",
                timeoutMs: 5000,
                loginPath: "/app-login",
                inboxPath: "/user-panel/inbox",
            },
        });
        assert.equal(result.ok, false);
        assert.equal(result.status, "provider_code_not_found");
    } finally {
        axios.request = originalRequest;
    }
});

test("classifies provider timeouts separately from unavailable errors", async () => {
    const originalRequest = axios.request;
    axios.request = async () => {
        const error = new Error("socket timed out");
        error.code = "ETIMEDOUT";
        throw error;
    };

    try {
        const result = await fetchCodeFromJeffProvider({
            email: "cliente@ejemplo.com",
            config: {
                enabled: true,
                baseUrl: "https://proveedores-jeff.store/v1",
                username: "provider-user",
                password: "provider-pass",
                timeoutMs: 5,
                loginPath: "/app-login",
                inboxPath: "/user-panel/inbox",
            },
        });
        assert.equal(result.status, "provider_timeout");
    } finally {
        axios.request = originalRequest;
    }
});

test("provider remains disabled unless the slug and credentials are configured", () => {
    const base = getJeffProviderConfigForSlug("netflix", {
        JEFF_PROVIDER_PLATFORM_SLUGS: "",
        JEFF_PROVIDER_USERNAME: "user",
        JEFF_PROVIDER_PASSWORD: "pass",
    });
    const enabled = getJeffProviderConfigForSlug("netflix", {
        JEFF_PROVIDER_PLATFORM_SLUGS: "netflix",
        JEFF_PROVIDER_USERNAME: "user",
        JEFF_PROVIDER_PASSWORD: "pass",
    });

    assert.equal(base.requested, false);
    assert.equal(base.enabled, false);
    assert.equal(enabled.requested, true);
    assert.equal(enabled.enabled, true);
});

test("logs in, keeps the session cookie, searches by email and returns the provider code", async () => {
    const originalRequest = axios.request;
    const calls = [];

    axios.request = async (options) => {
        calls.push(options);
        if (options.method === "GET" && options.url.endsWith("/app-login")) {
            return {
                status: 200,
                headers: { "set-cookie": ["session=test-session; Path=/; HttpOnly"] },
                data: `
                    <form action="./app-backend/new-login.php" method="post">
                        <input type="hidden" name="csrf" value="token" />
                        <input name="phone" />
                        <input name="password" type="password" />
                    </form>
                `,
            };
        }
        if (options.method === "POST" && options.url.endsWith("/app-backend/new-login.php")) {
            return { status: 302, headers: { location: "/v1/user-panel/inbox" }, data: "" };
        }
        if (options.method === "GET" && options.url.endsWith("/user-panel/inbox")) {
            assert.match(options.headers.Cookie, /session=test-session/);
            return {
                status: 200,
                headers: {},
                data: `
                    <form action="/v1/user-panel/inbox" method="get">
                        <input type="search" name="email" />
                    </form>
                `,
            };
        }
        if (options.method === "GET" && options.url.includes("email=cliente%40ejemplo.com")) {
            assert.match(options.headers.Cookie, /session=test-session/);
            return {
                status: 200,
                headers: {},
                data: `<section><h2>Código de acceso</h2><strong>6 3 6 7</strong></section>`,
            };
        }
        throw new Error(`Unexpected request: ${options.method} ${options.url}`);
    };

    try {
        const result = await fetchCodeFromJeffProvider({
            email: "cliente@ejemplo.com",
            config: {
                enabled: true,
                baseUrl: "https://proveedores-jeff.store/v1",
                username: "provider-user",
                password: "provider-pass",
                timeoutMs: 5000,
                loginPath: "/app-login",
                inboxPath: "/user-panel/inbox",
                searchPath: "",
                searchField: "email",
            },
        });

        assert.deepEqual(result, {
            ok: true,
            type: "code",
            code: "6367",
            source: "jeff_provider",
        });
        assert.equal(calls[0].url, "https://proveedores-jeff.store/v1/app-login");
        assert.equal(calls.length, 5);
        assert.match(calls[1].data, /phone=provider-user/);
        assert.match(calls[1].data, /password=provider-pass/);
        assert.match(calls[1].data, /csrf=token/);
    } finally {
        axios.request = originalRequest;
    }
});
