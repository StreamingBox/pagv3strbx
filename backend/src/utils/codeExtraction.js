function extractFallbackCode(haystack) {
    const patterns = [
        /(?:tu\s+c[o\u00f3]digo\s+de\s+chatgpt\s+es|your\s+chatgpt\s+code\s+is)[^0-9]{0,80}([0-9]{6})/i,
        /(?:introduce|ingresa|enter)\s+(?:este|this)?\s*(?:c[o\u00f3]digo\s+de\s+verificaci[o\u00f3]n\s+temporal|temporary\s+verification\s+code)[^0-9]{0,80}([0-9]{6})/i,
        /(?:c[o\u00f3]digo|codigo)\s+de\s+verificaci[o\u00f3]n[^0-9]{0,80}([0-9]{4,8})/i,
        /verification\s+code\s+is[^0-9]{0,20}([0-9]{4,8})/i,
        /verification\s+code[^0-9]{0,20}([0-9]{4,8})/i,
    ];

    for (const pattern of patterns) {
        const match = String(haystack || "").match(pattern);
        if (match?.[1]) return match[1];
    }

    return null;
}

module.exports = { extractFallbackCode };
