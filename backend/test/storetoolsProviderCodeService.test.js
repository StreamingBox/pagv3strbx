const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

const {
    getStoretoolsProviderConfigForProvider,
} = require("../src/config/storetoolsProvider");
const {
    fetchCodeFromStoretoolsProvider,
    __test: storetoolsTest,
} = require("../src/services/storetoolsProviderCodeService");

function storetoolsConfig(overrides = {}) {
    return {
        enabled: true,
        baseUrl: "https://storetools.co",
        userId: "user-id",
        timeoutMs: 5000,
        validateIdPath: "/api/consultar/validar-id",
        queryPath: "/api/consultar",
        platform: "netflix",
        platformId: "1",
        language: "es",
        ...overrides,
    };
}

test("StoreTools solo se habilita cuando la cuenta fue marcada como ese proveedor", () => {
    const disabled = getStoretoolsProviderConfigForProvider("strbx", {
        STORETOOLS_PROVIDER_USER_ID: "user-id",
    });
    const enabled = getStoretoolsProviderConfigForProvider("storetools.co", {
        STORETOOLS_PROVIDER_USER_ID: "user-id",
    });

    assert.equal(disabled.requested, false);
    assert.equal(disabled.enabled, false);
    assert.equal(enabled.requested, true);
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.validateIdPath, "/api/consultar/validar-id");
    assert.equal(enabled.queryPath, "/api/consultar");
});

test("elige el último correo de inicio de Netflix y extrae cuatro dígitos", () => {
    assert.ok(storetoolsTest.parseStoretoolsDate("29-Aug-2026 17:29:12") > 0);

    const selected = storetoolsTest.selectLatestStoretoolsCode([
        {
            fecha: "29-Aug-2026 17:20:00",
            asunto: "Netflix: Tu código de inicio de sesión",
            mensaje: "Ingresa este código: <strong>1094</strong>",
        },
        {
            fecha: "29-Aug-2026 17:29:12",
            asunto: "Netflix: Tu código de inicio de sesión",
            mensaje: "Ingresa este código: <strong>8245</strong>",
        },
    ]);

    assert.equal(selected.code, "8245");
});

test("elige el último correo temporal de Netflix y encuentra el enlace Obtener código", () => {
    const selected = storetoolsTest.selectLatestStoretoolsTemporaryEmail([
        {
            fecha: "11-Sep-2026 18:40:00",
            asunto: "Tu código de acceso temporal de Netflix",
            mensaje: "<a href=\"https://www.netflix.com/account/travel/verify?nf_token=old\">Obtener código</a>",
        },
        {
            fecha: "11-Sep-2026 18:52:26",
            asunto: "Tu código de acceso temporal de Netflix",
            mensaje: "<a href=\"https://www.netflix.com/account/travel/verify?nf_token=new\">Obtener código</a>",
        },
        {
            fecha: "11-Sep-2026 18:53:00",
            asunto: "Netflix: Tu código de inicio de sesión",
            mensaje: "Código 8245",
        },
    ]);

    assert.equal(selected.row.fecha, "11-Sep-2026 18:52:26");
    assert.deepEqual(
        storetoolsTest.extractStoretoolsTemporaryAction(selected.row.mensaje),
        { method: "GET", url: "https://www.netflix.com/account/travel/verify?nf_token=new" },
    );
    assert.equal(
        storetoolsTest.safeNetflixTemporaryUrl("https://www.netflix.com.evil.test/account/travel/verify?nf_token=x"),
        "",
    );
});

test("decodifica el HTML escapado que StoreTools entrega en el correo temporal", () => {
    const escapedMessage = "&lt;a href=&quot;https://www.netflix.com/account/travel/verify?nf_token=escaped-token&amp;source=email&quot;&gt;Obtener código&lt;/a&gt;";
    const messageHtml = storetoolsTest.decodeHtmlMarkup(escapedMessage);

    assert.deepEqual(
        storetoolsTest.extractStoretoolsTemporaryAction(messageHtml),
        { method: "GET", url: "https://www.netflix.com/account/travel/verify?nf_token=escaped-token&source=email" },
    );
});

test("valida el ID en StoreTools, conserva el token y consulta Netflix", async () => {
    const originalRequest = axios.request;
    const calls = [];
    axios.request = async (options) => {
        calls.push(options);
        if (options.method === "POST" && options.url.endsWith("/validar-id")) {
            assert.equal(options.headers["Content-Type"], "application/json");
            assert.deepEqual(JSON.parse(options.data), { idUsuarioConsulta: "user-id" });
            return {
                status: 200,
                headers: {},
                data: { respuesta: "exito", token: "provider-token", datos: { idConsulta: "validated-id" } },
            };
        }
        if (options.method === "POST" && options.url.endsWith("/api/consultar")) {
            assert.equal(options.headers.Authorization, "Bearer provider-token");
            assert.deepEqual(JSON.parse(options.data), {
                plataforma: "netflix",
                idPlataforma: "1",
                correoConsultar: "cliente@ejemplo.com",
                modo: "correo",
                tipoConsulta: "correo",
                token: "provider-token",
                idUsuarioConsulta: "validated-id",
                language: "es",
            });
            return {
                status: 200,
                headers: {},
                data: {
                    respuesta: "exito",
                    resultadoCorreos: [
                        {
                            fecha: "29-Aug-2026 17:20:00",
                            asunto: "Netflix: Tu código de inicio",
                            mensaje: "Código 1094",
                        },
                        {
                            fecha: "29-Aug-2026 17:29:12",
                            asunto: "Netflix: Tu código de inicio",
                            mensaje: "Ingresa este código: 8245",
                        },
                    ],
                },
            };
        }
        throw new Error(`Unexpected request: ${options.method} ${options.url}`);
    };

    try {
        const result = await fetchCodeFromStoretoolsProvider({
            email: "cliente@ejemplo.com",
            config: storetoolsConfig(),
        });

        assert.deepEqual(result, {
            ok: true,
            type: "code",
            code: "8245",
            source: "storetools_provider",
        });
        assert.equal(calls.length, 2);
        assert.equal(calls[0].url, "https://storetools.co/api/consultar/validar-id");
        assert.equal(calls[1].url, "https://storetools.co/api/consultar");
    } finally {
        axios.request = originalRequest;
    }
});

test("muestra un error de autenticación neutral cuando StoreTools rechaza el ID", async () => {
    const originalRequest = axios.request;
    axios.request = async (options) => {
        assert.equal(options.url, "https://storetools.co/api/consultar/validar-id");
        return {
            status: 400,
            headers: {},
            data: { respuesta: "error", mensaje: "ID no encontrado" },
        };
    };

    try {
        const result = await fetchCodeFromStoretoolsProvider({
            email: "cliente@ejemplo.com",
            config: storetoolsConfig(),
        });

        assert.deepEqual(result, {
            ok: false,
            status: "provider_auth_error",
            message: "No se pudo validar el acceso configurado.",
        });
    } finally {
        axios.request = originalRequest;
    }
});

test("reintenta la consulta cuando el correo todavía no aparece en la primera respuesta", async () => {
    const originalRequest = axios.request;
    let queryCalls = 0;
    axios.request = async (options) => {
        if (options.method === "POST" && options.url.endsWith("/validar-id")) {
            return { status: 200, headers: {}, data: { respuesta: "exito", token: "retry-token" } };
        }
        if (options.method === "POST" && options.url.endsWith("/api/consultar")) {
            queryCalls += 1;
            return {
                status: 200,
                headers: {},
                data: queryCalls === 1
                    ? { respuesta: "exito", resultadoCorreos: [] }
                    : {
                        respuesta: "exito",
                        resultadoCorreos: [{
                            fecha: "17-Sep-2026 21:45:36",
                            asunto: "Netflix: Tu código de inicio de sesión",
                            mensaje: "Ingresa este código: <strong>5 3 0 5</strong>",
                        }],
                    },
            };
        }
        throw new Error(`Unexpected request: ${options.method} ${options.url}`);
    };

    try {
        const result = await fetchCodeFromStoretoolsProvider({
            email: "cliente@ejemplo.com",
            config: storetoolsConfig(),
        });

        assert.deepEqual(result, {
            ok: true,
            type: "code",
            code: "5305",
            source: "storetools_provider",
        });
        assert.equal(queryCalls, 2);
    } finally {
        axios.request = originalRequest;
    }
});

test("StoreTools abre Obtener código y extrae los cuatro dígitos temporales", async () => {
    const originalRequest = axios.request;
    const calls = [];
    axios.request = async (options) => {
        calls.push(options);
        if (options.method === "POST" && options.url.endsWith("/validar-id")) {
            return { status: 200, headers: {}, data: { respuesta: "exito", token: "temporary-token" } };
        }
        if (options.method === "POST" && options.url.endsWith("/api/consultar")) {
            return {
                status: 200,
                headers: {},
                data: {
                    respuesta: "exito",
                    resultadoCorreos: [{
                        fecha: "11-Sep-2026 18:52:26",
                        asunto: "Tu código de acceso temporal de Netflix",
                        mensaje: "<a href=\"https://www.netflix.com/account/travel/verify?nf_token=temp-token\">Obtener código</a>",
                    }],
                },
            };
        }
        if (options.method === "GET" && options.url.startsWith("https://www.netflix.com/account/travel/verify")) {
            assert.match(options.headers.Referer, /storetools\.co/);
            return {
                status: 200,
                headers: {},
                data: `
                    <h1>Usa este código para ver Netflix en tu dispositivo</h1>
                    <p>Ingresa este código en el dispositivo solicitante para obtener acceso temporal.</p>
                    <strong>3856</strong>
                    <p>Este código vence después de 15 minutos.</p>
                `,
            };
        }
        throw new Error(`Unexpected request: ${options.method} ${options.url}`);
    };

    try {
        const result = await fetchCodeFromStoretoolsProvider({
            email: "cliente@ejemplo.com",
            action: "temporary",
            config: storetoolsConfig(),
        });

        assert.deepEqual(result, {
            ok: true,
            type: "code",
            code: "3856",
            source: "storetools_provider",
        });
        assert.equal(calls.length, 3);
        assert.match(calls[2].url, /nf_token=temp-token/);
    } finally {
        axios.request = originalRequest;
    }
});
