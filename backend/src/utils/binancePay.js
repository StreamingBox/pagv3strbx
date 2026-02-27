// BACKEND: pagv2strbx/src/utils/binancePay.js
const crypto = require("crypto");

const BASE_URL = process.env.BINANCE_PAY_BASE_URL || "https://bpay.binanceapi.com";
const API_KEY = process.env.BINANCE_PAY_API_KEY || "";
const API_SECRET = process.env.BINANCE_PAY_API_SECRET || "";

function assertEnv() {
    if (!API_KEY || !API_SECRET) {
        throw new Error("Faltan BINANCE_PAY_API_KEY o BINANCE_PAY_API_SECRET en .env");
    }
}

function createNonce(len = 32) {
    // Binance recomienda nonce de 32 chars
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
}

function signPayload({ timestamp, nonce, body }) {
    // payload = timestamp + "\n" + nonce + "\n" + body + "\n"
    const payload = `${timestamp}\n${nonce}\n${body}\n`;
    const h = crypto.createHmac("sha512", API_SECRET);
    h.update(payload);
    return h.digest("hex").toUpperCase();
}

function buildHeaders(bodyString) {
    assertEnv();
    const timestamp = Date.now().toString();
    const nonce = createNonce(32);
    const signature = signPayload({ timestamp, nonce, body: bodyString });

    return {
        "Content-Type": "application/json",
        "BinancePay-Timestamp": timestamp,
        "BinancePay-Nonce": nonce,
        "BinancePay-Certificate-SN": API_KEY,
        "BinancePay-Signature": signature,
    };
}

async function binancePayPost(path, payload) {
    const bodyString = JSON.stringify(payload ?? {});
    const headers = buildHeaders(bodyString);

    const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers,
        body: bodyString,
    });

    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text };
    }

    return { ok: res.ok, status: res.status, data };
}

/**
 * Verifica firma del WEBHOOK (misma regla: timestamp\nnonce\nbody\n).
 * Devuelve {ok:boolean, reason?:string}
 */
function verifyWebhookSignature(req) {
    try {
        assertEnv();

        const timestamp = String(req.headers["binancepay-timestamp"] || "");
        const nonce = String(req.headers["binancepay-nonce"] || "");
        const sig = String(req.headers["binancepay-signature"] || "");
        const body = String(req.rawBody || "");

        if (!timestamp || !nonce || !sig) {
            return { ok: false, reason: "Faltan headers BinancePay-*" };
        }

        const expected = signPayload({ timestamp, nonce, body });
        const a = Buffer.from(expected, "utf8");
        const b = Buffer.from(sig, "utf8");

        if (a.length !== b.length) return { ok: false, reason: "Firma inválida (len)" };
        const same = crypto.timingSafeEqual(a, b);
        return same ? { ok: true } : { ok: false, reason: "Firma inválida" };
    } catch (e) {
        return { ok: false, reason: e?.message || "Error verificando firma" };
    }
}

module.exports = {
    binancePayPost,
    verifyWebhookSignature,
};
