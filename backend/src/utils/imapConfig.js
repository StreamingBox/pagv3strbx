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
    const imapTlsInsecure = getEnvBool("IMAP_TLS_INSECURE");

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
            // Por defecto verificación TLS estricta. Solo en desarrollo: IMAP_TLS_INSECURE=true
            tlsOptions: {
                rejectUnauthorized: !imapTlsInsecure,
            },
        },
    };
}

function safeToDate(v) {
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d;
}

module.exports = { getImapConfig, safeToDate, getEnvBool };
