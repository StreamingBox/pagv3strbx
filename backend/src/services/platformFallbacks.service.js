const { BOGOTA_TODAY_SQL, bogotaDateSql } = require("../utils/date");
const { excludeInactiveMasterAccountByEmailSql } = require("./expirationVisibility.service");

async function getPlatformFallbacks(conn, sourcePlatformId = null) {
    const params = [];
    const where = [];

    if (sourcePlatformId) {
        where.push("pf.source_platform_id = ?");
        params.push(Number(sourcePlatformId));
    }

    const [rows] = await conn.query(
        `SELECT
            pf.id,
            pf.source_platform_id,
            source.name AS source_platform_name,
            source.slug AS source_platform_slug,
            pf.fallback_platform_id,
            fallback.name AS fallback_platform_name,
            fallback.slug AS fallback_platform_slug,
            pf.priority,
            pf.is_active,
            COALESCE(stock.stock, 0) AS fallback_stock
         FROM platform_fallbacks pf
         JOIN platforms source ON source.id = pf.source_platform_id
         JOIN platforms fallback ON fallback.id = pf.fallback_platform_id
         LEFT JOIN (
            SELECT platform_id, COUNT(*) AS stock
            FROM platform_accounts
            WHERE status = 'available'
              AND (expires_at IS NULL OR ${bogotaDateSql("expires_at")} >= ${BOGOTA_TODAY_SQL})
            GROUP BY platform_id
         ) stock ON stock.platform_id = pf.fallback_platform_id
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY source.name ASC, pf.priority ASC, fallback.name ASC`,
        params
    );

    return rows;
}

async function getCandidatePlatformsForPlatform(conn, platformId, additionalPlatformIds = []) {
    const requestedPlatformId = Number(platformId);
    if (!Number.isInteger(requestedPlatformId) || requestedPlatformId <= 0) {
        const err = new Error("platformId invalido.");
        err.status = 400;
        throw err;
    }

    const candidates = [];
    const seen = new Set();
    const addCandidate = (value, source) => {
        const id = Number(value);
        if (!Number.isInteger(id) || id <= 0 || seen.has(id)) return;
        seen.add(id);
        candidates.push({ platformId: id, source });
    };

    addCandidate(requestedPlatformId, "requested");
    for (const additionalPlatformId of additionalPlatformIds || []) {
        addCandidate(additionalPlatformId, "historical");
    }

    const [fallbackRows] = await conn.query(
        `SELECT fallback_platform_id
           FROM platform_fallbacks
          WHERE source_platform_id = ? AND is_active = 1
          ORDER BY priority ASC, id ASC`,
        [requestedPlatformId]
    );
    for (const row of fallbackRows) {
        addCandidate(row.fallback_platform_id, "fallback");
    }

    return candidates;
}

async function findAvailableAccountForPlatform(conn, platformId, options = {}) {
    const requestedPlatformId = Number(platformId);
    const excludeAccountId = Number(options.excludeAccountId || 0);
    const specificAccountId = Number(options.accountId || 0);
    const excludeAccountEmail = String(options.excludeAccountEmail || "").trim().toLowerCase();
    const excludeInactiveMasterAccounts = options.excludeInactiveMasterAccounts === true;

    if (!Number.isInteger(requestedPlatformId) || requestedPlatformId <= 0) {
        const err = new Error("platformId invalido.");
        err.status = 400;
        throw err;
    }

    const candidatePlatforms = await getCandidatePlatformsForPlatform(
        conn,
        requestedPlatformId,
        options.additionalPlatformIds || []
    );
    const candidatePlatformIds = candidatePlatforms.map((candidate) => candidate.platformId);
    const candidatePlaceholders = candidatePlatformIds.map(() => "?").join(",");
    const replacementFilters = [];
    const replacementParams = [];
    if (excludeInactiveMasterAccounts) {
        replacementFilters.push(excludeInactiveMasterAccountByEmailSql({ accountAlias: "pa" }));
    }
    if (excludeAccountEmail) {
        replacementFilters.push("LOWER(TRIM(COALESCE(pa.email, ''))) <> ?");
        replacementParams.push(excludeAccountEmail);
    }
    const replacementFilterSql = replacementFilters.length
        ? ` AND ${replacementFilters.join(" AND ")}`
        : "";

    if (specificAccountId > 0) {
        const [specificRows] = await conn.query(
            `SELECT pa.id, pa.platform_id, pa.email, pa.password, pa.pin, pa.two_factor_secret, pa.profile_number, pa.access_url, pa.unit_cost,
                    p.name AS delivered_platform_name, p.slug AS delivered_platform_slug
             FROM platform_accounts pa
             JOIN platforms p ON p.id = pa.platform_id
             WHERE pa.id = ?
               AND pa.status = 'available'
               AND pa.id <> ?
               AND pa.platform_id IN (${candidatePlaceholders})
               AND (pa.expires_at IS NULL OR ${bogotaDateSql("pa.expires_at")} >= ${BOGOTA_TODAY_SQL})
               ${replacementFilterSql}
             LIMIT 1
             FOR UPDATE`,
            [specificAccountId, excludeAccountId || 0, ...candidatePlatformIds, ...replacementParams]
        );

        return specificRows[0]
            ? {
                account: specificRows[0],
                requestedPlatformId,
                deliveredPlatformId: Number(specificRows[0].platform_id),
                usedFallback: Number(specificRows[0].platform_id) !== requestedPlatformId,
            }
            : null;
    }

    const [rows] = await conn.query(
        `SELECT pa.id, pa.platform_id, pa.email, pa.password, pa.pin, pa.two_factor_secret, pa.profile_number, pa.access_url, pa.unit_cost,
                p.name AS delivered_platform_name, p.slug AS delivered_platform_slug
         FROM platform_accounts pa
         JOIN platforms p ON p.id = pa.platform_id AND p.is_active = 1
         WHERE pa.status = 'available'
           AND pa.id <> ?
           AND pa.platform_id IN (${candidatePlaceholders})
           AND (pa.expires_at IS NULL OR ${bogotaDateSql("pa.expires_at")} >= ${BOGOTA_TODAY_SQL})
           ${replacementFilterSql}
         ORDER BY FIELD(pa.platform_id, ${candidatePlaceholders}), RAND(), pa.id ASC
         LIMIT 1
         FOR UPDATE`,
        [excludeAccountId || 0, ...candidatePlatformIds, ...candidatePlatformIds, ...replacementParams]
    );

    return rows[0]
        ? {
            account: rows[0],
            requestedPlatformId,
            deliveredPlatformId: Number(rows[0].platform_id),
            usedFallback: Number(rows[0].platform_id) !== requestedPlatformId,
        }
        : null;
}

module.exports = {
    getPlatformFallbacks,
    getCandidatePlatformsForPlatform,
    findAvailableAccountForPlatform,
};
