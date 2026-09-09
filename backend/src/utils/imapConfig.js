const imaps = require("imap-simple");
const dns = require("dns");

/**
 * Configuración IMAP compartida para los servicios de Gmail.
 * Exporta también `safeToDate` para uso en gmailCodeService y netflixFlowService.
 */

function getEnvBool(name) {
    const raw = String(process.env[name] || "");
    const withoutComment = raw.split("#")[0].trim();
    const unquoted = withoutComment.replace(/^['"]|['"]$/g, "").trim().toLowerCase();
    return unquoted === "true" || unquoted === "1" || unquoted === "yes" || unquoted === "on";
}

function isProduction() {
    return process.env.NODE_ENV === "production";
}

function allowInsecureTls(name) {
    return !isProduction() && getEnvBool(name);
}

function getPositiveInt(name, fallback, { min = 1000, max = 120000 } = {}) {
    const value = Number.parseInt(String(process.env[name] || ""), 10);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(Math.max(value, min), max);
}

function getImapIpFamily() {
    const value = Number.parseInt(String(process.env.IMAP_IP_FAMILY || "4"), 10);
    return value === 6 ? 6 : 4;
}

function getImapConfig() {
    const user = process.env.GMAIL_EMAIL;
    const password = process.env.GMAIL_IMAP_PASS;
    if (!user || !password) return null;
    const imapTlsInsecure = allowInsecureTls("IMAP_TLS_INSECURE");
    const host = "imap.gmail.com";
    const ipFamily = getImapIpFamily();

    return {
        imap: {
            user,
            password,
            host,
            port: 993,
            tls: true,
            // EC2 no tiene salida IPv6; forzar IPv4 evita que node-imap espere al socket IPv6.
            family: ipFamily,
            connTimeout: getPositiveInt("IMAP_CONN_TIMEOUT_MS", 30000),
            authTimeout: getPositiveInt("IMAP_AUTH_TIMEOUT_MS", 20000),
            socketTimeout: getPositiveInt("IMAP_SOCKET_TIMEOUT_MS", 30000),
            // Keep strict TLS, send SNI explicitly and use the same address family for TLS.
            tlsOptions: {
                rejectUnauthorized: !imapTlsInsecure,
                servername: host,
                family: ipFamily,
            },
        },
    };
}

function isTlsCertificateError(error) {
    const message = String(error?.message || "").toLowerCase();
    const code = String(error?.code || "").toUpperCase();

    return (
        message.includes("self-signed certificate") ||
        message.includes("unable to verify the first certificate") ||
        code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
        code === "SELF_SIGNED_CERT_IN_CHAIN" ||
        code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
    );
}

function isImapAuthenticationError(error) {
    const message = String(error?.message || error || "").toLowerCase();
    const code = String(error?.code || "").toUpperCase();

    return code === "AUTHENTICATIONFAILED"
        || code === "AUTHENTICATION_FAILURE"
        || message.includes("invalid credentials")
        || message.includes("authentication failed")
        || message.includes("authenticationfailure")
        || message.includes("login failed");
}

function isImapTimeoutError(error) {
    const message = String(error?.message || error || "").toLowerCase();
    const code = String(error?.code || "").toUpperCase();

    return code === "ETIMEDOUT"
        || code === "ESOCKETTIMEDOUT"
        || message.includes("connection timed out")
        || message.includes("timeout =")
        || message.includes("timed out");
}

function getImapAuthenticationMessage() {
    return "El buzón de códigos rechazó la autenticación. El administrador debe actualizar la app password de Gmail en el servidor.";
}

async function connectImapWithTlsFallback(config, contextLabel = "imap") {
    const resolvedConfig = await resolveImapConfig(config);
    try {
        return await imaps.connect(resolvedConfig);
    } catch (error) {
        if (!isTlsCertificateError(error)) {
            throw error;
        }
        if (!allowInsecureTls("IMAP_TLS_INSECURE")) {
            throw error;
        }

        const insecureConfig = {
            ...resolvedConfig,
            imap: {
                ...(resolvedConfig?.imap || {}),
                tlsOptions: {
                    ...((resolvedConfig?.imap && resolvedConfig.imap.tlsOptions) || {}),
                    rejectUnauthorized: false,
                },
            },
        };

        console.warn(`[${contextLabel}] TLS certificate error on IMAP connect. Retrying with rejectUnauthorized=false.`);
        return imaps.connect(insecureConfig);
    }
}

async function resolveImapConfig(config) {
    const imap = config?.imap || {};
    const family = imap.family === 6 ? 6 : 4;
    const host = String(imap.host || "").trim();
    if (!host || /^[0-9a-f:.]+$/i.test(host)) return config;

    const result = await dns.promises.lookup(host, { family });
    return {
        ...config,
        imap: {
            ...imap,
            // node-imap opens the TCP socket with imap.host and does not forward
            // `family` to socket.connect(). Resolve first so EC2 never attempts IPv6.
            host: result.address,
            tlsOptions: {
                ...(imap.tlsOptions || {}),
                servername: imap.tlsOptions?.servername || host,
            },
        },
    };
}

function safeToDate(v) {
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d;
}

module.exports = {
    getImapConfig,
    safeToDate,
    getEnvBool,
    allowInsecureTls,
    connectImapWithTlsFallback,
    resolveImapConfig,
    isTlsCertificateError,
    isImapAuthenticationError,
    isImapTimeoutError,
    getImapAuthenticationMessage,
};
