const crypto = require("node:crypto");
const pool = require("../db");
const { BOGOTA_TODAY_SQL } = require("../utils/date");

const TOTP_PERIOD_MS = 30_000;
const SECRET_PREFIX = "youtube-premium-totp-v1";
const TOTP_REQUEST_WINDOW_MINUTES = 10;
const MAX_TOTP_REQUESTS = 5;

function isYoutubeTotpProduct(nameOrSlug) {
    const value = String(nameOrSlug || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const compact = value.replace(/[^a-z0-9]/g, "");
    return value.includes("youtube")
        && (value.includes("premium") || value.includes("music") || compact.includes("youtube3meses"));
}

function errorWithStatus(message, status) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function encryptionKey(value = process.env.TOTP_ENCRYPTION_KEY) {
    const key = String(value || "").trim();
    if (!/^[a-f\d]{64}$/i.test(key)) {
        throw errorWithStatus("El servidor no tiene configurada la clave de cifrado TOTP.", 503);
    }
    return Buffer.from(key, "hex");
}

function normalizeTotpSecret(value) {
    let secret = String(value || "").trim();
    if (/^otpauth:\/\//i.test(secret)) {
        try {
            secret = new URL(secret).searchParams.get("secret") || "";
        } catch {
            throw errorWithStatus("La URI de Authenticator no es valida.", 400);
        }
    }
    secret = secret.toUpperCase().replace(/[\s=-]/g, "");
    if (!/^[A-Z2-7]+$/.test(secret)) {
        throw errorWithStatus("Ingresa la clave secreta Base32 del autenticador, no el codigo de seis digitos.", 400);
    }
    const decoded = decodeBase32(secret);
    if (decoded.length < 10) throw errorWithStatus("La clave del autenticador es demasiado corta.", 400);
    return secret;
}

function decodeBase32(value) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (const character of value) {
        const index = alphabet.indexOf(character);
        if (index < 0) throw errorWithStatus("La clave Base32 del autenticador no es valida.", 400);
        bits += index.toString(2).padStart(5, "0");
    }
    const bytes = [];
    for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
        bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
    }
    return Buffer.from(bytes);
}

function encryptTotpSecret(value, keyValue = process.env.TOTP_ENCRYPTION_KEY) {
    const secret = normalizeTotpSecret(value);
    const key = encryptionKey(keyValue);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(SECRET_PREFIX));
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

function decryptTotpSecret(record, keyValue = process.env.TOTP_ENCRYPTION_KEY) {
    const key = encryptionKey(keyValue);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, record.iv);
    decipher.setAAD(Buffer.from(SECRET_PREFIX));
    decipher.setAuthTag(record.authTag);
    return normalizeTotpSecret(Buffer.concat([
        decipher.update(record.ciphertext),
        decipher.final(),
    ]).toString("utf8"));
}

function generateTotp(secret, now = Date.now()) {
    const counter = BigInt(Math.floor(Number(now) / TOTP_PERIOD_MS));
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(counter);
    const digest = crypto.createHmac("sha1", decodeBase32(normalizeTotpSecret(secret))).update(counterBuffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = digest.readUInt32BE(offset) & 0x7fffffff;
    return String(binary % 1_000_000).padStart(6, "0");
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFreshTotpPeriod({ now, clock = Date.now, wait = sleep } = {}) {
    if (now !== undefined) return Number(now);
    let generationTime = Number(clock());
    const elapsedInPeriod = generationTime % TOTP_PERIOD_MS;
    if (elapsedInPeriod > 250) {
        await wait(TOTP_PERIOD_MS - elapsedInPeriod + 250);
        generationTime = Number(clock());
    }
    return generationTime;
}

function verifyTotpCode(secret, code, now = Date.now(), window = 1) {
    const candidate = String(code || "").trim();
    if (!/^\d{6}$/.test(candidate)) return false;

    const candidateBuffer = Buffer.from(candidate, "ascii");
    for (let offset = -window; offset <= window; offset += 1) {
        const expected = Buffer.from(generateTotp(secret, Number(now) + (offset * TOTP_PERIOD_MS)), "ascii");
        if (crypto.timingSafeEqual(expected, candidateBuffer)) return true;
    }
    return false;
}

function normalizeGoogleEmail(value) {
    const email = String(value || "").trim().toLowerCase();
    if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw errorWithStatus("Ingresa un correo valido para asociar el autenticador de Google.", 400);
    }
    return email;
}

async function deleteLegacySecretsForEmail(conn, email) {
    await conn.query(
        `DELETE secret
           FROM platform_account_totp_secrets secret
           JOIN platform_accounts a ON a.id = secret.platform_account_id
           JOIN platforms p ON p.id = a.platform_id
          WHERE LOWER(TRIM(a.email)) = ?
            AND (LOWER(p.name) LIKE '%youtube%' OR LOWER(p.slug) LIKE '%youtube%')`,
        [normalizeGoogleEmail(email)]
    );
}

async function saveTotpSecret(conn, email, value) {
    const encrypted = encryptTotpSecret(value);
    const normalizedEmail = normalizeGoogleEmail(email);
    await deleteLegacySecretsForEmail(conn, normalizedEmail);
    await conn.query(
        `INSERT INTO youtube_google_totp_secrets
            (email_normalized, encrypted_secret, secret_iv, secret_auth_tag)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE encrypted_secret = VALUES(encrypted_secret),
                                 secret_iv = VALUES(secret_iv),
                                 secret_auth_tag = VALUES(secret_auth_tag),
                                 updated_at = CURRENT_TIMESTAMP`,
        [normalizedEmail, encrypted.ciphertext, encrypted.iv, encrypted.authTag]
    );
}

async function clearTotpSecret(conn, email) {
    const normalizedEmail = normalizeGoogleEmail(email);
    await conn.query("DELETE FROM youtube_google_totp_secrets WHERE email_normalized = ?", [normalizedEmail]);
    await deleteLegacySecretsForEmail(conn, normalizedEmail);
}

async function recordTotpRequest(subscriptionId, db = pool) {
    const conn = await db.getConnection();
    let transactionStarted = false;
    try {
        await conn.beginTransaction();
        transactionStarted = true;
        await conn.query(
            `INSERT IGNORE INTO youtube_totp_request_limits
                (subscription_id, first_requested_at, request_count)
             VALUES (?, UTC_TIMESTAMP(3), 0)`,
            [subscriptionId]
        );
        const [rows] = await conn.query(
            `SELECT request_count,
                    first_requested_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${TOTP_REQUEST_WINDOW_MINUTES} MINUTE) AS window_expired
               FROM youtube_totp_request_limits
              WHERE subscription_id = ?
              FOR UPDATE`,
            [subscriptionId]
        );
        const request = rows?.[0];
        if (!request) throw errorWithStatus("No se pudo validar el límite de consultas para este pedido.", 503);
        if (Number(request.window_expired) === 1) {
            throw errorWithStatus("Este pedido ya solicitó el código. Contacta a soporte si necesitas ayuda.", 429);
        }
        const requestCount = Number(request.request_count);
        if (requestCount >= MAX_TOTP_REQUESTS) {
            throw errorWithStatus("Este pedido ya solicitó el código. Contacta a soporte si necesitas ayuda.", 429);
        }

        await conn.query(
            `UPDATE youtube_totp_request_limits
                SET request_count = request_count + 1
              WHERE subscription_id = ?`,
            [subscriptionId]
        );
        await conn.commit();
        transactionStarted = false;
    } catch (error) {
        if (transactionStarted) {
            try {
                await conn.rollback();
            } catch {
                // Keep the original request error.
            }
        }
        throw error;
    } finally {
        conn.release();
    }
}

async function getSubscriptionTotp({
    subscriptionId,
    userId,
    isAdmin = false,
    now,
    db = pool,
    keyValue = process.env.TOTP_ENCRYPTION_KEY,
}) {
    const ownershipFilter = isAdmin ? "" : " AND s.user_id = ?";
    const queryParams = isAdmin ? [subscriptionId] : [subscriptionId, userId];
    const [[row]] = await db.query(
        `SELECT s.id AS subscription_id, s.status AS subscription_status,
                (s.expires_at IS NOT NULL AND DATE(CONVERT_TZ(s.expires_at, '+00:00', '-05:00')) < ${BOGOTA_TODAY_SQL}) AS subscription_expired,
                a.id AS platform_account_id, p.name AS platform_name, p.slug AS platform_slug,
                secret.encrypted_secret, secret.secret_iv, secret.secret_auth_tag
           FROM subscriptions s
           JOIN platform_accounts a ON a.id = s.platform_account_id
           JOIN platforms p ON p.id = a.platform_id
           LEFT JOIN youtube_google_totp_secrets secret
             ON secret.email_normalized = CASE
                    WHEN LOCATE('@', TRIM(a.email)) = 0 THEN CONCAT(LOWER(TRIM(a.email)), '@gmail.com')
                    ELSE LOWER(TRIM(a.email))
                END
          WHERE s.id = ?${ownershipFilter}
          LIMIT 1`,
        queryParams
    );

    if (!row || !isYoutubeTotpProduct(`${row.platform_name || ""} ${row.platform_slug || ""}`)) {
        throw errorWithStatus("No se encontro una suscripcion valida de YouTube para este usuario.", 404);
    }
    if (row.subscription_status !== "active" || Number(row.subscription_expired) === 1) {
        throw errorWithStatus("La suscripcion ya no esta activa.", 403);
    }
    if (!row.encrypted_secret || !row.secret_iv || !row.secret_auth_tag) {
        throw errorWithStatus("Esta cuenta aun no tiene configurado el autenticador.", 409);
    }

    const secret = decryptTotpSecret({
        ciphertext: row.encrypted_secret,
        iv: row.secret_iv,
        authTag: row.secret_auth_tag,
    }, keyValue);
    if (!isAdmin) await recordTotpRequest(row.subscription_id, db);
    const generationTime = await waitForFreshTotpPeriod({ now });
    const code = generateTotp(secret, generationTime);
    const expiresAt = (Math.floor(generationTime / TOTP_PERIOD_MS) + 1) * TOTP_PERIOD_MS;
    return {
        code,
        expiresAt,
        validForSeconds: Math.max(1, Math.ceil((expiresAt - generationTime) / 1000)),
    };
}

module.exports = {
    clearTotpSecret,
    decryptTotpSecret,
    encryptTotpSecret,
    generateTotp,
    getSubscriptionTotp,
    isYoutubeTotpProduct,
    normalizeTotpSecret,
    normalizeGoogleEmail,
    recordTotpRequest,
    saveTotpSecret,
    verifyTotpCode,
    waitForFreshTotpPeriod,
};
