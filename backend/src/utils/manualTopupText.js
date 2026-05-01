function normalizeInlineText(value) {
    return String(value || "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function stripTrackingNoise(value) {
    return normalizeInlineText(value)
        .replace(/\[https?:\/\/[^\]]+\]/gi, " ")
        .replace(/https?:\/\/\S+/gi, " ")
        .replace(/\b(?:click-url|google-analytics|webhook\/open|bapi\/composite|email\.mgidirectmail)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function cleanSenderCandidate(value) {
    return stripTrackingNoise(value)
        .replace(/[|[\]{}<>]+/g, " ")
        .replace(/\s*[;:,.-]+\s*$/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120)
        .trim();
}

function extractSenderName(value) {
    const source = normalizeInlineText(value);
    if (!source) return "";

    const patterns = [
        /Remitente:\s*(.+?)(?=\s+Monto:|\s+Fecha\s+y\s+hora:|\s+Hora:|\s+Nota:|\s+Ver historial|\s+Todos los derechos|\s+https?:\/\/|$)/i,
        /Recibiste\s+\$?\s*[0-9.,]+\s+de\s+(.+?)(?=\s+-\s+el\s+\d{1,2}\s+de\s+|\s+el\s+\d{1,2}\s+de\s+|$)/i,
    ];

    for (const pattern of patterns) {
        const match = source.match(pattern);
        if (match?.[1]) {
            const candidate = cleanSenderCandidate(match[1]);
            if (candidate) return candidate;
        }
    }

    return cleanSenderCandidate(source);
}

function sanitizeMatchedSenderName(value) {
    const source = normalizeInlineText(value);
    if (!source) return "";
    if (source.length > 140 || /(click-url|email\.mgidirectmail|google-analytics|webhook\/open|https?:\/\/)/i.test(source)) {
        return extractSenderName(source);
    }
    return cleanSenderCandidate(source);
}

function sanitizeAdminNote(value) {
    const source = normalizeInlineText(value);
    if (!source) return "";

    const autoMatch = source.match(/^(Aprobada autom[aá]ticamente por [^.]+)\.\s+Remitente:\s*(.+?)(?:\.\s+Hora:\s*(.+))?$/i);
    if (autoMatch) {
        const [, prefix, senderRaw, timeRaw] = autoMatch;
        const sender = sanitizeMatchedSenderName(senderRaw);
        const time = normalizeInlineText(timeRaw);
        return `${prefix}. Remitente: ${sender || "No disponible"}${time ? `. Hora: ${time}` : ""}`.trim();
    }

    if (source.length > 220 || /(click-url|email\.mgidirectmail|google-analytics|webhook\/open)/i.test(source)) {
        return stripTrackingNoise(source).slice(0, 220).trim();
    }

    return source;
}

module.exports = {
    extractSenderName,
    sanitizeAdminNote,
    sanitizeMatchedSenderName,
};
