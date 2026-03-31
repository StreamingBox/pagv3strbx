/**
 * Middleware de saneamiento básico de inputs.
 * - Recorta strings en el body.
 * - Bloquea intentos de prototype pollution.
 */

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function containsDangerousKeys(obj, depth = 0) {
    if (depth > 5 || typeof obj !== "object" || obj === null) return false;
    for (const key of Object.keys(obj)) {
        if (BLOCKED_KEYS.has(key)) return true;
        if (containsDangerousKeys(obj[key], depth + 1)) return true;
    }
    return false;
}

function trimStrings(obj, depth = 0) {
    if (depth > 5 || typeof obj !== "object" || obj === null) return obj;
    for (const key of Object.keys(obj)) {
        if (typeof obj[key] === "string") {
            obj[key] = obj[key].trim();
        } else if (typeof obj[key] === "object") {
            trimStrings(obj[key], depth + 1);
        }
    }
    return obj;
}

function sanitize(req, res, next) {
    if (req.body && typeof req.body === "object") {
        if (containsDangerousKeys(req.body)) {
            return res.status(400).json({ ok: false, message: "Payload no permitido." });
        }
        trimStrings(req.body);
    }
    next();
}

module.exports = sanitize;
