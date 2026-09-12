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
    assert.equal(enabled.loginPath, "/funciones/validarID.php");
    assert.equal(enabled.queryPath, "/funciones/get_email.php");
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

test("inicia sesión en StoreTools, consulta Netflix y conserva la cookie", async () => {
    const originalRequest = axios.request;
    const calls = [];
    axios.request = async (options) => {
        calls.push(options);
        if (options.method === "GET" && options.url.endsWith("/consultar")) {
            return {
                status: 200,
                headers: { "set-cookie": ["PHPSESSID=test-session; Path=/; HttpOnly"] },
                data: "<html>StoreTools</html>",
            };
        }
        if (options.method === "POST" && options.url.endsWith("/validarID.php")) {
            assert.match(options.data, /tipo=login/);
            assert.match(options.data, /idUsuarioConsulta=user-id/);
            return { status: 200, headers: {}, data: { respuesta: "exito" } };
        }
        if (options.method === "POST" && options.url.endsWith("/get_email.php")) {
            assert.match(options.headers.Cookie, /PHPSESSID=test-session/);
            assert.match(options.data, /plataforma=netflix/);
            assert.match(options.data, /idPlataforma=1/);
            assert.match(options.data, /correoConsultar=cliente%40ejemplo.com/);
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
            config: {
                enabled: true,
                baseUrl: "https://storetools.co",
                userId: "user-id",
                timeoutMs: 5000,
                pagePath: "/consultar",
                loginPath: "/funciones/validarID.php",
                queryPath: "/funciones/get_email.php",
                platform: "netflix",
                platformId: "1",
                language: "es",
            },
        });

        assert.deepEqual(result, {
            ok: true,
            type: "code",
            code: "8245",
            source: "storetools_provider",
        });
        assert.equal(calls.length, 3);
        assert.equal(calls[0].url, "https://storetools.co/consultar");
        assert.match(calls[2].headers.Cookie, /PHPSESSID=test-session/);
    } finally {
        axios.request = originalRequest;
    }
});

test("StoreTools abre Obtener código y extrae los cuatro dígitos temporales", async () => {
    const originalRequest = axios.request;
    const calls = [];
    axios.request = async (options) => {
        calls.push(options);
        if (options.method === "GET" && options.url.endsWith("/consultar")) {
            return {
                status: 200,
                headers: { "set-cookie": ["PHPSESSID=temp-session; Path=/; HttpOnly"] },
                data: "<html>StoreTools</html>",
            };
        }
        if (options.method === "POST" && options.url.endsWith("/validarID.php")) {
            return { status: 200, headers: {}, data: { respuesta: "exito" } };
        }
        if (options.method === "POST" && options.url.endsWith("/get_email.php")) {
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
            config: {
                enabled: true,
                baseUrl: "https://storetools.co",
                userId: "user-id",
                timeoutMs: 5000,
                pagePath: "/consultar",
                loginPath: "/funciones/validarID.php",
                queryPath: "/funciones/get_email.php",
                platform: "netflix",
                platformId: "1",
                language: "es",
            },
        });

        assert.deepEqual(result, {
            ok: true,
            type: "code",
            code: "3856",
            source: "storetools_provider",
        });
        assert.equal(calls.length, 4);
        assert.match(calls[3].url, /nf_token=temp-token/);
    } finally {
        axios.request = originalRequest;
    }
});
