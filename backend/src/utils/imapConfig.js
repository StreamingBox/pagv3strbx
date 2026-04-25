const imaps = require("imap-simple");

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

function getImapConfig() {
    const user = process.env.GMAIL_EMAIL;
    const password = process.env.GMAIL_IMAP_PASS;
    if (!user || !password) return null;
    const imapTlsInsecure = process.env.NODE_ENV !== "production" && getEnvBool("IMAP_TLS_INSECURE");

    return {
        imap: {
            user,
            password,
            host: "imap.gmail.com",
            port: 993,
            tls: true,
            connTimeout: 10000,
            authTimeout: 10000,
            socketTimeout: 15000,
            // Verificacion TLS estricta en produccion; IMAP_TLS_INSECURE solo aplica en desarrollo.
            tlsOptions: {
                rejectUnauthorized: !imapTlsInsecure,
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

async function connectImapWithTlsFallback(config, contextLabel = "imap") {
    try {
        return await imaps.connect(config);
    } catch (error) {
        if (!isTlsCertificateError(error)) {
            throw error;
        }
        if (process.env.NODE_ENV === "production" || !getEnvBool("IMAP_TLS_INSECURE")) {
            throw error;
        }

        const insecureConfig = {
            ...config,
            imap: {
                ...(config?.imap || {}),
                tlsOptions: {
                    ...((config?.imap && config.imap.tlsOptions) || {}),
                    rejectUnauthorized: false,
                },
            },
        };

        console.warn(`[${contextLabel}] TLS certificate error on IMAP connect. Retrying with rejectUnauthorized=false.`);
        return imaps.connect(insecureConfig);
    }
}

function safeToDate(v) {
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d;
}

module.exports = { getImapConfig, safeToDate, getEnvBool, connectImapWithTlsFallback, isTlsCertificateError };
