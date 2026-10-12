const STRBX_REPORTED_PROVIDER_NAME_SQL = "LOWER(TRIM(reported_provider.name)) IN ('strbx', 'streaming box')";
const NETFLIX_PLATFORM_SQL = (platformAlias) => `(LOWER(TRIM(${platformAlias}.name)) LIKE '%netflix%' OR LOWER(TRIM(${platformAlias}.name)) = 'promo')`;

function strbxReportedNetflixAccountSql(accountAlias = "pa") {
    if (!/^[a-z][a-z0-9_]*$/i.test(accountAlias)) {
        throw new Error("Alias SQL de cuenta inválido.");
    }

    return `EXISTS (
        SELECT 1
          FROM provider_accounts reported_provider_account
          JOIN providers reported_provider ON reported_provider.id = reported_provider_account.provider_id
          JOIN platforms reported_platform ON reported_platform.id = reported_provider_account.platform_id
          JOIN platforms account_platform ON account_platform.id = ${accountAlias}.platform_id
         WHERE LOWER(TRIM(reported_provider_account.account_email)) = LOWER(TRIM(${accountAlias}.email))
           AND reported_provider_account.provider_reported_at IS NOT NULL
           AND ${STRBX_REPORTED_PROVIDER_NAME_SQL}
           AND ${NETFLIX_PLATFORM_SQL("reported_platform")}
           AND ${NETFLIX_PLATFORM_SQL("account_platform")}
    )`;
}

async function getStrbxReportedNetflixProviderAccount(conn, { platformId, email }) {
    const [rows] = await conn.query(
        `SELECT reported_provider_account.id,
                reported_provider_account.provider_reported_by AS reportedBy
           FROM provider_accounts reported_provider_account
           JOIN providers reported_provider ON reported_provider.id = reported_provider_account.provider_id
           JOIN platforms reported_platform ON reported_platform.id = reported_provider_account.platform_id
           JOIN platforms account_platform ON account_platform.id = ?
          WHERE LOWER(TRIM(reported_provider_account.account_email)) = LOWER(TRIM(?))
            AND reported_provider_account.provider_reported_at IS NOT NULL
            AND ${STRBX_REPORTED_PROVIDER_NAME_SQL}
            AND ${NETFLIX_PLATFORM_SQL("reported_platform")}
            AND ${NETFLIX_PLATFORM_SQL("account_platform")}
          ORDER BY reported_provider_account.provider_reported_at DESC,
                   reported_provider_account.id DESC
          LIMIT 1
          FOR UPDATE`,
        [Number(platformId), String(email || "").trim()]
    );
    return rows[0] || null;
}

function canSellStrbxReportedNetflixAccount(report, sellerUserId) {
    if (!report) return true;
    return Number(report.reportedBy) > 0 && Number(report.reportedBy) === Number(sellerUserId);
}

function isStrbxReportedNetflixProviderAccount(account) {
    const provider = String(account?.providerName || "").trim().toLowerCase();
    const platform = String(account?.platformName || "").trim().toLowerCase();
    return Boolean(account?.providerReportedAt)
        && ["strbx", "streaming box"].includes(provider)
        && (platform.includes("netflix") || platform === "promo");
}

module.exports = {
    strbxReportedNetflixAccountSql,
    getStrbxReportedNetflixProviderAccount,
    canSellStrbxReportedNetflixAccount,
    isStrbxReportedNetflixProviderAccount,
};
