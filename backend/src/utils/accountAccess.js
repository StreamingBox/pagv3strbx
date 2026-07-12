const { normalizeOptionalValue } = require("./normalize");

function normalizeAccessUrl(value, { required = false } = {}) {
    const raw = normalizeOptionalValue(value);
    if (!raw) {
        if (required) {
            const err = new Error("URL es obligatoria para IPTV.");
            err.status = 400;
            throw err;
        }
        return null;
    }

    try {
        const parsed = new URL(raw);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("protocol");
        return raw;
    } catch {
        const err = new Error("La URL debe ser valida e iniciar con http:// o https://.");
        err.status = 400;
        throw err;
    }
}

module.exports = { normalizeAccessUrl };
