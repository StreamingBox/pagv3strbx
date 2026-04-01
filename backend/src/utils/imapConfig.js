/**
 * Configuración IMAP compartida para los servicios de Gmail.
 * Exporta también `safeToDate` para uso en gmailCodeService y netflixFlowService.
 */

function getImapConfig() {
    const user = process.env.GMAIL_EMAIL;
    const password = process.env.GMAIL_IMAP_PASS;
    if (!user || !password) return null;
    const imapTlsInsecure = String(process.env.IMAP_TLS_INSECURE || "").trim().toLowerCase() === "true";

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

module.exports = { getImapConfig, safeToDate };
