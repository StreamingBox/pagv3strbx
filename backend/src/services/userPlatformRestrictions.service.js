async function getRestrictedPlatformIds(queryable, userId) {
    const normalizedUserId = Number(userId);
    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) return new Set();

    const [rows] = await queryable.query(
        "SELECT platform_id FROM user_platform_purchase_restrictions WHERE user_id = ?",
        [normalizedUserId]
    );
    return new Set(rows.map((row) => Number(row.platform_id)));
}

async function assertUserCanPurchasePlatforms(queryable, userId, platformIds) {
    const restrictedIds = await getRestrictedPlatformIds(queryable, userId);
    const blocked = (Array.isArray(platformIds) ? platformIds : [])
        .some((platformId) => restrictedIds.has(Number(platformId)));

    if (!blocked) return;

    const error = new Error("Este producto no está disponible para tu cuenta.");
    error.status = 409;
    error.code = "USER_PLATFORM_UNAVAILABLE";
    throw error;
}

module.exports = { getRestrictedPlatformIds, assertUserCanPurchasePlatforms };
