const crypto = require("crypto");

function credFingerprint(password, pin) {
    const raw = `${String(password || "")}::${String(pin || "")}`;
    return crypto.createHash("sha256").update(raw).digest("hex");
}

module.exports = { credFingerprint };
