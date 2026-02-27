const jwt = require("jsonwebtoken");
const crypto = require("crypto");

function signAccessToken(payload) {
    return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
    });
}

function signRefreshToken(payload) {
    const days = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || "30", 10);

    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
        expiresIn: `${days}d`,
        // ✅ Hace el refresh token SIEMPRE único (evita ER_DUP_ENTRY por token_hash repetido)
        jwtid: crypto.randomUUID(),
    });
}

function sha256(input) {
    return crypto.createHash("sha256").update(input).digest("hex");
}

module.exports = { signAccessToken, signRefreshToken, sha256 };
