const pool = require("../db");
const { checkoutService } = require("./checkoutService");
const { normalizeCurrency } = require("../utils/currency");

const DEFAULT_NOTIFACE_USER_EMAIL = "cuentastrbx@gmail.com";

function normalizeNotifacePlatformAlias(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function platformAliasTerms(alias) {
    const normalized = normalizeNotifacePlatformAlias(alias);
    if (!normalized) return [];

    const terms = new Set();
    for (const token of normalized.split(" ")) {
        if (token.length >= 3) terms.add(token);
    }

    if (/\b(netflix|netfli|net)\b/.test(normalized)) terms.add("netflix");
    if (/\b(disney|disnei|disny|dgo)\b/.test(normalized)) terms.add("disney");
    if (/\b(paramount|paramon|para)\b/.test(normalized)) terms.add("paramount");
    if (/\b(spotify|spoty|spoti)\b/.test(normalized)) terms.add("spotify");
    if (/\b(prime|amazon|video)\b/.test(normalized)) {
        terms.add("prime");
        terms.add("amazon");
    }
    if (/\b(hbo|max|maxhbo)\b/.test(normalized)) {
        terms.add("hbo");
        terms.add("max");
    }

    return [...terms];
}

async function findNotifaceSalesUser(email) {
    const targetEmail = String(email || process.env.NOTIFACE_SALES_USER_EMAIL || DEFAULT_NOTIFACE_USER_EMAIL)
        .trim()
        .toLowerCase();

    const [rows] = await pool.query(
        `SELECT u.id, u.name, u.email, u.status, COALESCE(w.currency, 'COP') AS wallet_currency
         FROM users u
         LEFT JOIN wallets w ON w.user_id = u.id
         WHERE LOWER(u.email) = ?
         LIMIT 1`,
        [targetEmail]
    );

    const user = rows?.[0] || null;
    if (!user) {
        const err = new Error(`No encontre el usuario de ventas NotiFace: ${targetEmail}.`);
        err.status = 404;
        throw err;
    }

    if (String(user.status || "").toLowerCase() !== "active") {
        const err = new Error(`El usuario de ventas NotiFace no esta activo: ${targetEmail}.`);
        err.status = 409;
        throw err;
    }

    return user;
}

function notifacePlatformSelectSql(whereSql) {
    return `
        SELECT
            pp.id AS platformPriceId,
            p.id AS platformId,
            p.name AS platformName,
            p.slug AS platformSlug,
            p.type AS platformType,
            d.id AS durationId,
            d.days,
            pp.price,
            pp.currency,
            (
                SELECT COUNT(*)
                FROM platform_accounts pa
                WHERE pa.platform_id = p.id
                  AND pa.status = 'available'
            ) AS availableAccounts
        FROM platform_prices pp
        JOIN platforms p ON p.id = pp.platform_id
        JOIN durations d ON d.id = pp.duration_id
        WHERE p.is_active = 1
          AND pp.is_active = 1
          ${whereSql}
        ORDER BY
          CASE WHEN d.days = ? THEN 0 WHEN d.days = 30 THEN 1 ELSE 2 END,
          d.days ASC,
          pp.price ASC,
          p.name ASC
        LIMIT 10`;
}

async function resolveNotifacePlatformPrice({ platformPriceId, platformAlias, durationDays, currency }) {
    const wantedDuration = Number.isFinite(Number(durationDays)) && Number(durationDays) > 0
        ? Number(durationDays)
        : 30;
    const wantedCurrency = normalizeCurrency(currency || "COP", "COP");

    if (Number.isInteger(Number(platformPriceId)) && Number(platformPriceId) > 0) {
        const [rows] = await pool.query(
            notifacePlatformSelectSql("AND pp.id = ?"),
            [Number(platformPriceId), wantedDuration]
        );
        if (!rows.length) {
            const err = new Error(`No encontre el plan #${platformPriceId}.`);
            err.status = 404;
            throw err;
        }
        return rows[0];
    }

    const terms = platformAliasTerms(platformAlias);
    if (!terms.length) {
        const err = new Error("Debes indicar una plataforma, por ejemplo /vender netflix.");
        err.status = 400;
        throw err;
    }

    const clauses = [];
    const params = [];
    for (const term of terms) {
        clauses.push("LOWER(p.slug) LIKE ?");
        params.push(`%${term}%`);
        clauses.push("LOWER(p.name) LIKE ?");
        params.push(`%${term}%`);
    }

    const [rows] = await pool.query(
        notifacePlatformSelectSql(`AND UPPER(pp.currency) = ? AND (${clauses.join(" OR ")})`),
        [wantedCurrency, ...params, wantedDuration]
    );

    if (!rows.length) {
        const err = new Error(`No encontre plan activo para "${platformAlias}".`);
        err.status = 404;
        throw err;
    }

    return rows[0];
}

async function recordNotifaceSale(payload) {
    try {
        await pool.query(
            `INSERT INTO notiface_sales
                (order_id, order_code, conversation_code, face, buyer_name, listing_name,
                 platform_alias, platform_price_id, status, error_message)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                payload.orderId || null,
                payload.orderCode || null,
                payload.conversationCode || null,
                payload.face || null,
                payload.buyerName || null,
                payload.listingName || null,
                payload.platformAlias || null,
                payload.platformPriceId || null,
                payload.status || "sold",
                payload.errorMessage || null,
            ]
        );
    } catch (err) {
        console.warn("[notiface] No se pudo guardar auditoria de venta:", err?.message || err);
    }
}

async function sellFromNotiface(input = {}) {
    const salesUser = await findNotifaceSalesUser(input.salesUserEmail);
    const platform = await resolveNotifacePlatformPrice({
        platformPriceId: input.platformPriceId,
        platformAlias: input.platformAlias,
        durationDays: input.durationDays,
        currency: salesUser.wallet_currency || input.currency || "COP",
    });

    try {
        const result = await checkoutService({
            userId: salesUser.id,
            items: [{ platformPriceId: platform.platformPriceId }],
            combos: [],
            recordProfit: false,
            profitAmount: 0,
            salesChannel: "reseller",
        });

        await recordNotifaceSale({
            orderId: result.orderId,
            orderCode: result.orderCode,
            conversationCode: input.conversationCode,
            face: input.face,
            buyerName: input.buyerName,
            listingName: input.listingName,
            platformAlias: input.platformAlias,
            platformPriceId: platform.platformPriceId,
            status: "sold",
        });

        return {
            ok: true,
            salesUser: {
                id: salesUser.id,
                email: salesUser.email,
                name: salesUser.name,
            },
            matchedPlatform: platform,
            orderId: result.orderId,
            orderCode: result.orderCode,
            total: result.total,
            currency: result.currency,
            wallet: result.wallet,
            deliveryMessage: result.deliveryMessage,
        };
    } catch (err) {
        await recordNotifaceSale({
            conversationCode: input.conversationCode,
            face: input.face,
            buyerName: input.buyerName,
            listingName: input.listingName,
            platformAlias: input.platformAlias,
            platformPriceId: platform.platformPriceId,
            status: "failed",
            errorMessage: err?.message || String(err),
        });
        throw err;
    }
}

async function catalogForNotiface(query) {
    const salesUser = await findNotifaceSalesUser();
    const wantedCurrency = normalizeCurrency(salesUser.wallet_currency || "COP", "COP");
    const terms = platformAliasTerms(query);
    const where = terms.length
        ? `AND (${terms.map(() => "(LOWER(p.slug) LIKE ? OR LOWER(p.name) LIKE ?)").join(" OR ")})`
        : "";
    const params = [wantedCurrency];
    for (const term of terms) {
        params.push(`%${term}%`, `%${term}%`);
    }

    const [rows] = await pool.query(
        `SELECT
            pp.id AS platformPriceId,
            p.name AS platformName,
            p.slug AS platformSlug,
            d.days,
            pp.price,
            pp.currency,
            p.type AS platformType,
            (
                SELECT COUNT(*)
                FROM platform_accounts pa
                WHERE pa.platform_id = p.id
                  AND pa.status = 'available'
            ) AS availableAccounts
         FROM platform_prices pp
         JOIN platforms p ON p.id = pp.platform_id
         JOIN durations d ON d.id = pp.duration_id
         WHERE p.is_active = 1
           AND pp.is_active = 1
           AND UPPER(pp.currency) = ?
           ${where}
         ORDER BY p.name ASC, d.days ASC, pp.price ASC
         LIMIT 25`,
        params
    );

    return rows;
}

module.exports = {
    DEFAULT_NOTIFACE_USER_EMAIL,
    normalizeNotifacePlatformAlias,
    platformAliasTerms,
    resolveNotifacePlatformPrice,
    sellFromNotiface,
    catalogForNotiface,
    __testing: {
        normalizeNotifacePlatformAlias,
        platformAliasTerms,
    },
};
