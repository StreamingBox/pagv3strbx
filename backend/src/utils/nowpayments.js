const crypto = require("crypto");

function sortObjectDeep(value) {
    if (Array.isArray(value)) {
        return value.map(sortObjectDeep);
    }
    if (value && typeof value === "object") {
        return Object.keys(value)
            .sort()
            .reduce((acc, key) => {
                acc[key] = sortObjectDeep(value[key]);
                return acc;
            }, {});
    }
    return value;
}

function signNowPaymentsIpn(payload, secret) {
    const normalized = JSON.stringify(sortObjectDeep(payload));
    return crypto
        .createHmac("sha512", String(secret || "").trim())
        .update(normalized)
        .digest("hex");
}

function verifyNowPaymentsIpn({ payload, signature, secret }) {
    if (!signature || !secret) return false;
    const expected = signNowPaymentsIpn(payload, secret);
    const left = Buffer.from(String(signature).trim(), "utf8");
    const right = Buffer.from(expected, "utf8");
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

module.exports = {
    signNowPaymentsIpn,
    verifyNowPaymentsIpn,
};
