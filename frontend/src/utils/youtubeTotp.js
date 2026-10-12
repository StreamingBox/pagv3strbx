const TOTP_PERIOD_MS = 30_000;

function normalizeSecret(value) {
    let secret = String(value || "").trim();
    if (/^otpauth:\/\//i.test(secret)) {
        try {
            secret = new URL(secret).searchParams.get("secret") || "";
        } catch {
            throw new Error("La URI de Authenticator no es válida.");
        }
    }

    secret = secret.toUpperCase().replace(/[\s=-]/g, "");
    if (!/^[A-Z2-7]+$/.test(secret)) {
        throw new Error("Pega una clave secreta Base32 o una URI otpauth:// válida.");
    }
    return secret;
}

function decodeBase32(secret) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const bytes = [];
    let buffer = 0;
    let bits = 0;

    for (const character of secret) {
        const value = alphabet.indexOf(character);
        if (value < 0) throw new Error("La clave Base32 no es válida.");
        buffer = (buffer << 5) | value;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((buffer >> bits) & 0xff);
            buffer &= (1 << bits) - 1;
        }
    }

    if (bytes.length < 10) throw new Error("La clave del Authenticator es demasiado corta.");
    return new Uint8Array(bytes);
}

export async function generateTotpCode(secretValue, now = Date.now()) {
    if (!globalThis.crypto?.subtle) {
        throw new Error("Este navegador no permite generar códigos seguros. Abre la página con HTTPS.");
    }

    const secret = decodeBase32(normalizeSecret(secretValue));
    const key = await globalThis.crypto.subtle.importKey(
        "raw",
        secret,
        { name: "HMAC", hash: "SHA-1" },
        false,
        ["sign"]
    );
    const period = Math.floor(Number(now) / TOTP_PERIOD_MS);
    const counter = new ArrayBuffer(8);
    new DataView(counter).setBigUint64(0, BigInt(period));
    const digest = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, counter));
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[offset] & 0x7f) << 24)
        | (digest[offset + 1] << 16)
        | (digest[offset + 2] << 8)
        | digest[offset + 3];
    const expiresAt = (period + 1) * TOTP_PERIOD_MS;

    return {
        code: String(binary % 1_000_000).padStart(6, "0"),
        expiresAt,
    };
}
