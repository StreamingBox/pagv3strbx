const pool = require("../db");
const { BOGOTA_TODAY_SQL, bogotaDateSql } = require("../utils/date");

const AVAILABLE_STATUSES = new Set(["available"]);
const LEGACY_ASSIGNED_STATUSES = new Set(["assigned", "sold"]);
const DOWN_STATUSES = new Set(["inactive", "down", "disabled", "expired", "legacy_review"]);

function isNetflixPlatformName(platformName) {
    const name = String(platformName || "").trim();
    return /netflix/i.test(name) || name.toLowerCase() === "promo";
}

function isAmazonPrimeVideoPlatformName(platformName) {
    return /^(?:amazon\s+)?prime\s+video$/i.test(String(platformName || "").trim());
}

function normalizeAuditRules(rules) {
    if (!Array.isArray(rules) || rules.length === 0) {
        const error = new Error("Agrega al menos una referencia de perfiles.");
        error.status = 400;
        throw error;
    }

    const unique = new Map();
    for (const item of rules) {
        const platformId = Number(item?.platformId ?? item?.platform_id);
        const expectedProfiles = Number(item?.expectedProfiles ?? item?.expected_profiles);
        if (!Number.isInteger(platformId) || platformId <= 0) continue;
        if (!Number.isInteger(expectedProfiles) || expectedProfiles < 1 || expectedProfiles > 30) continue;
        unique.set(platformId, { platformId, expectedProfiles });
    }

    if (!unique.size) {
        const error = new Error("Las referencias de perfiles no son validas.");
        error.status = 400;
        throw error;
    }
    return Array.from(unique.values());
}

function accountKey(platformId, platformName, email) {
    const platform = isNetflixPlatformName(platformName) ? "netflix" : Number(platformId);
    return `${platform}:${String(email || "").trim().toLowerCase()}`;
}

function buildAuditRows(rawRows, rules, providerRows = []) {
    const normalizedRules = normalizeAuditRules(rules);
    const expectedByPlatform = new Map(normalizedRules.map((rule) => [rule.platformId, rule.expectedProfiles]));
    const namesByPlatform = new Map([
        ...rules.map((rule) => [Number(rule.platformId ?? rule.platform_id), rule.platformName || ""]),
        ...(rawRows || []).map((row) => [Number(row.platform_id), row.platform_name || ""]),
        ...providerRows.map((row) => [Number(row.platform_id), row.platform_name || ""]),
    ]);
    const netflixCapacity = normalizedRules.reduce((count, rule) => isNetflixPlatformName(namesByPlatform.get(rule.platformId) || "")
        ? Math.max(count, rule.expectedProfiles) : count, 0);
    const groups = new Map();
    const providers = new Map();
    for (const provider of providerRows) {
        const key = accountKey(provider.platform_id, provider.platform_name, provider.account_email);
        if (!providers.has(key) || Number(provider.id) > Number(providers.get(key).id)) providers.set(key, provider);
    }

    function createGroup(row, expectedProfiles) {
        const key = accountKey(row.platform_id, row.platform_name, row.account_email);
        if (!groups.has(key)) {
            groups.set(key, {
                platformId: Number(row.platform_id),
                platformName: row.platform_name || `Plataforma #${row.platform_id}`,
                accountEmail: String(row.account_email || "").trim(),
                expectedProfiles,
                records: [],
                masterMarkedDown: false,
                masterNote: null,
                provider: providers.get(key) || null,
            });
        }
        const group = groups.get(key);
        group.expectedProfiles = Math.max(group.expectedProfiles, expectedProfiles);
        if (String(row.master_status || "").toLowerCase() === "inactive") {
            group.masterMarkedDown = true;
            group.masterNote = row.master_note || group.masterNote;
        }
        return group;
    }

    for (const row of rawRows || []) {
        const platformId = Number(row.platform_id);
        const expectedProfiles = isAmazonPrimeVideoPlatformName(row.platform_name) ? 5
            : expectedByPlatform.get(platformId)
                || (isNetflixPlatformName(row.platform_name) ? netflixCapacity : 0);
        if (!expectedProfiles) continue;
        const group = createGroup(row, expectedProfiles);
        const profileNumber = Number.isInteger(Number(row.profile_number)) && Number(row.profile_number) > 0
            ? Number(row.profile_number)
            : null;
        if (isAmazonPrimeVideoPlatformName(row.platform_name) && profileNumber === 6) {
            group.expectedProfiles = Math.max(group.expectedProfiles, 6);
        }
        const status = String(row.status || "").trim().toLowerCase();
        group.records.push({
            accountId: Number(row.account_id),
            profileNumber,
            status,
            hasActiveSubscription: Boolean(Number(row.has_active_subscription)),
            hasLegacyActiveAssignment: Boolean(Number(row.has_legacy_active_assignment)),
            assignedUserId: row.assigned_to_user_id || null,
            buyerEmail: row.buyer_email || "",
            expiresAt: row.profile_expires_at || null,
            expired: Boolean(Number(row.profile_expired)),
            replaced: Boolean(Number(row.has_replacement_out)),
        });
    }

    for (const provider of providers.values()) {
        const expectedProfiles = isAmazonPrimeVideoPlatformName(provider.platform_name) ? 5
            : expectedByPlatform.get(Number(provider.platform_id))
                || (isNetflixPlatformName(provider.platform_name) ? netflixCapacity : 0);
        if (expectedProfiles) createGroup(provider, expectedProfiles);
    }

    return Array.from(groups.values()).map((group) => {
        const expected = Array.from({ length: group.expectedProfiles }, (_, index) => index + 1);
        const profileRecords = new Map();
        const statusSet = new Set();
        for (const record of group.records) {
            if (record.profileNumber !== null) {
                if (!profileRecords.has(record.profileNumber)) profileRecords.set(record.profileNumber, []);
                profileRecords.get(record.profileNumber).push(record);
            }
            if (record.status) statusSet.add(record.status);
        }

        const isOccupiedRecord = (record) => record.hasActiveSubscription
            || (LEGACY_ASSIGNED_STATUSES.has(record.status) && record.hasLegacyActiveAssignment && !record.replaced);
        const isFreeRecord = (record) => AVAILABLE_STATUSES.has(record.status)
            && !record.assignedUserId && !record.expired && !record.hasActiveSubscription;
        const isCoveredRecord = (record) => isFreeRecord(record) || isOccupiedRecord(record);
        const coveredProfiles = expected.filter((profile) =>
            (profileRecords.get(profile) || []).some(isCoveredRecord)
        );
        const presentProfiles = expected.filter((profile) => profileRecords.has(profile));
        const missingProfiles = expected.filter((profile) => !profileRecords.has(profile));
        const uncoveredProfiles = expected.filter((profile) => profileRecords.has(profile) && !coveredProfiles.includes(profile));
        const invalidProfiles = Array.from(profileRecords.keys()).filter((profile) => !expected.includes(profile)).sort((a, b) => a - b);
        const duplicateProfiles = expected.filter((profile) => (profileRecords.get(profile) || []).filter(isCoveredRecord).length > 1);
        const unprofiledRecords = group.records.filter((record) => record.profileNumber === null
            && (isCoveredRecord(record) || (!record.replaced && !record.expired && !DOWN_STATUSES.has(record.status))))
            .map((record) => record.accountId);
        const uncoveredProfileDetails = uncoveredProfiles.map((profile) => ({
            profile,
            statuses: Array.from(new Set((profileRecords.get(profile) || []).map((record) => record.status).filter(Boolean))),
            accountIds: (profileRecords.get(profile) || []).map((record) => record.accountId),
        }));
        const reasons = [];
        if (missingProfiles.length) reasons.push("perfiles sin registro");
        if (uncoveredProfiles.length) reasons.push("perfiles sin disponibilidad o venta vigente");
        if (unprofiledRecords.length) reasons.push("registros sin numero de perfil");
        if (duplicateProfiles.length) reasons.push("perfiles duplicados");
        if (invalidProfiles.length) reasons.push("perfiles fuera de la referencia");
        const unidentifiedAssignment = group.records.some((record) => record.profileNumber === null && isOccupiedRecord(record));
        if (unidentifiedAssignment) reasons.push("asignacion vigente sin perfil identificado");

        const provider = group.provider;
        const excludedReason = provider && (provider.status !== "active" || Number(provider.provider_active) === 0)
            ? "provider_inactive"
            : provider && Number(provider.provider_expired) === 1
                ? "provider_expired"
                : group.masterMarkedDown ? "master_down"
                    : group.records.length && group.records.every((record) => DOWN_STATUSES.has(record.status)
                        || (!provider && record.expired && !isOccupiedRecord(record)))
                        ? "inventory_down" : null;
        const profiles = expected.map((number) => {
            const records = profileRecords.get(number) || [];
            const occupied = records.filter(isOccupiedRecord);
            const free = records.filter(isFreeRecord);
            const state = occupied.length ? "occupied"
                : unidentifiedAssignment || free.length > 1 ? "review"
                    : free.length === 1 ? "free"
                        : !records.length ? "missing"
                            : records.some((record) => record.replaced) ? "replaced"
                                : records.every((record) => DOWN_STATUSES.has(record.status)) ? "unavailable" : "review";
            const currentRecords = occupied.length ? occupied : free.length ? free : records;
            return {
                number,
                state,
                accountIds: currentRecords.map((record) => record.accountId),
                buyerEmails: [...new Set(occupied.map((record) => record.buyerEmail).filter(Boolean))],
                expiresAt: currentRecords[0]?.expiresAt || null,
            };
        });
        const freeProfiles = profiles.filter((profile) => profile.state === "free").map((profile) => profile.number);
        const occupiedProfiles = profiles.filter((profile) => profile.state === "occupied").map((profile) => profile.number);
        const reviewProfiles = profiles.filter((profile) => !["free", "occupied"].includes(profile.state)).map((profile) => profile.number);

        return {
            platformId: provider && expectedByPlatform.has(Number(provider.platform_id)) ? Number(provider.platform_id) : group.platformId,
            platformName: provider?.platform_name || group.platformName,
            accountEmail: group.accountEmail,
            providerId: provider ? Number(provider.provider_id) : null,
            providerName: provider?.provider_name || "Sin proveedor",
            providerAccountId: provider ? Number(provider.id) : null,
            providerExpiresAt: provider?.expires_at || null,
            cardRenewalDate: provider?.card_renewal_date || null,
            accountActive: !excludedReason,
            excludedReason,
            profiles,
            freeProfiles,
            occupiedProfiles,
            reviewProfiles,
            availability: freeProfiles.length ? "with_free" : occupiedProfiles.length === group.expectedProfiles ? "full" : "review",
            expectedProfiles: group.expectedProfiles,
            presentProfiles,
            coveredProfiles,
            missingProfiles,
            uncoveredProfiles,
            invalidProfiles,
            duplicateProfiles,
            uncoveredProfileDetails,
            unprofiledRecords,
            statuses: Array.from(statusSet).sort(),
            accountIds: group.records.map((record) => record.accountId).sort((a, b) => a - b),
            masterMarkedDown: group.masterMarkedDown,
            masterNote: group.masterNote || "",
            classification: group.masterMarkedDown ? "excluded_down" : reasons.length ? "exception" : "complete",
            reviewReasons: group.masterMarkedDown ? ["cuenta maestra marcada como caida"] : reasons,
        };
    }).sort((a, b) => a.platformName.localeCompare(b.platformName) || a.accountEmail.localeCompare(b.accountEmail));
}

async function getInventoryAudit(rulesInput) {
    if (!rulesInput) {
        const [defaults] = await pool.query(`
            SELECT p.id, p.name, inventory.profile_capacity, inventory.last_profile
              FROM platforms p
              LEFT JOIN (
                  SELECT platform_id,
                         MAX(CASE WHEN parent_profiles_total BETWEEN 1 AND 30 THEN parent_profiles_total END) AS profile_capacity,
                         MAX(CASE WHEN profile_number BETWEEN 1 AND 30 THEN profile_number END) AS last_profile
                    FROM platform_accounts GROUP BY platform_id
              ) inventory ON inventory.platform_id = p.id
             WHERE p.is_active = 1 AND (inventory.last_profile IS NOT NULL
                OR EXISTS(SELECT 1 FROM provider_accounts provider WHERE provider.platform_id = p.id))
             ORDER BY p.name`);
        rulesInput = defaults.map((platform) => ({
            platformId: Number(platform.id),
            expectedProfiles: isAmazonPrimeVideoPlatformName(platform.name) ? 5
                : isNetflixPlatformName(platform.name) && !/miembro extra/i.test(platform.name) ? 5
            : /disney.*premium/i.test(platform.name) ? 7
                    : Math.max(Number(platform.profile_capacity || 0), Number(platform.last_profile || 0), 1),
        }));
    }
    const rules = normalizeAuditRules(rulesInput);
    const ids = rules.map((rule) => rule.platformId);
    const placeholders = ids.map(() => "?").join(",");
    const [platformRows] = await pool.query(
        `SELECT id, name, slug, is_active
           FROM platforms
          WHERE id IN (${placeholders})`,
        ids
    );
    const platformById = new Map(platformRows.map((platform) => [Number(platform.id), platform]));
    const missingPlatforms = ids.filter((id) => !platformById.has(id));
    if (missingPlatforms.length) {
        const error = new Error(`No existe(n) la(s) plataforma(s): ${missingPlatforms.join(", ")}.`);
        error.status = 404;
        throw error;
    }

    const [accountRows] = await pool.query(
        `SELECT pa.id AS account_id,
                pa.platform_id,
                COALESCE(p.name, pa.platform_name) AS platform_name,
                pa.email AS account_email,
                pa.profile_number,
                pa.status,
                pa.assigned_to_user_id,
                u.email AS buyer_email,
                DATE_FORMAT(${bogotaDateSql("pa.expires_at")}, '%Y-%m-%d') AS profile_expires_at,
                (pa.expires_at IS NOT NULL AND ${bogotaDateSql("pa.expires_at")} < ${BOGOTA_TODAY_SQL}) AS profile_expired,
                EXISTS(SELECT 1 FROM account_replacement_logs replacement WHERE replacement.old_account_id = pa.id) AS has_replacement_out,
                EXISTS(
                    SELECT 1
                      FROM subscriptions active_sub
                     WHERE active_sub.platform_account_id = pa.id
                       AND active_sub.status = 'active'
                       AND DATE(active_sub.expires_at) >= ${BOGOTA_TODAY_SQL}
                ) AS has_active_subscription,
                CASE
                    WHEN pa.assigned_to_user_id IS NOT NULL
                     AND pa.expires_at IS NOT NULL
                     AND ${bogotaDateSql("pa.expires_at")} >= ${BOGOTA_TODAY_SQL}
                     AND NOT EXISTS(SELECT 1 FROM subscriptions historical_sub WHERE historical_sub.platform_account_id = pa.id)
                    THEN 1 ELSE 0
                END AS has_legacy_active_assignment,
                ma.status AS master_status,
                ma.notes AS master_note
           FROM platform_accounts pa
           JOIN platforms p ON p.id = pa.platform_id
           LEFT JOIN users u ON u.id = pa.assigned_to_user_id
           LEFT JOIN master_accounts ma
             ON ma.platform_id = pa.platform_id
            AND LOWER(TRIM(ma.account_email)) = LOWER(TRIM(pa.email))
          WHERE ((pa.platform_id IN (${placeholders}) AND p.is_active = 1)${platformRows.some((platform) => isNetflixPlatformName(platform.name))
            ? " OR LOWER(p.name) LIKE '%netflix%' OR LOWER(TRIM(p.name)) = 'promo'"
            : ""})
          ORDER BY p.name, pa.email, pa.profile_number, pa.id`,
        ids
    );

    const [providerRows] = await pool.query(`
        SELECT pa.id, pa.provider_id, provider.name AS provider_name, provider.is_active AS provider_active,
               pa.platform_id, p.name AS platform_name, pa.account_email, pa.status,
               DATE_FORMAT(pa.expires_at, '%Y-%m-%d') AS expires_at,
               DATE_FORMAT(pa.card_renewal_date, '%Y-%m-%d') AS card_renewal_date,
               (pa.expires_at < ${BOGOTA_TODAY_SQL}) AS provider_expired,
               ma.status AS master_status, ma.notes AS master_note
          FROM provider_accounts pa
          JOIN providers provider ON provider.id = pa.provider_id
          JOIN platforms p ON p.id = pa.platform_id AND p.is_active = 1
          LEFT JOIN master_accounts ma ON ma.platform_id = pa.platform_id
           AND LOWER(TRIM(ma.account_email)) = LOWER(TRIM(pa.account_email))`);
    const allRows = buildAuditRows(accountRows, rules.map((rule) => ({ ...rule, platformName: platformById.get(rule.platformId)?.name })), providerRows);
    const rows = allRows.filter((row) => row.accountActive);
    const excluded = {
        providerInactive: allRows.filter((row) => row.excludedReason === "provider_inactive").length,
        providerExpired: allRows.filter((row) => row.excludedReason === "provider_expired").length,
        inventoryDown: allRows.filter((row) => ["master_down", "inventory_down"].includes(row.excludedReason)).length,
    };
    const summary = {
        totalAccounts: rows.length,
        withFreeProfiles: rows.filter((row) => row.freeProfiles.length > 0).length,
        freeProfiles: rows.reduce((count, row) => count + row.freeProfiles.length, 0),
        occupiedProfiles: rows.reduce((count, row) => count + row.occupiedProfiles.length, 0),
        fullAccounts: rows.filter((row) => row.availability === "full").length,
        reviewAccounts: rows.filter((row) => row.reviewProfiles.length || row.classification === "exception").length,
        complete: rows.filter((row) => row.classification === "complete").length,
        exceptions: rows.filter((row) => row.classification === "exception").length,
        excludedDown: rows.filter((row) => row.classification === "excluded_down").length,
        incomplete: rows.filter((row) => row.classification === "exception" && row.missingProfiles.length > 0).length,
        duplicated: rows.filter((row) => row.classification === "exception" && row.duplicateProfiles.length > 0).length,
        invalidProfiles: rows.filter((row) => row.classification === "exception" && row.invalidProfiles.length > 0).length,
    };

    return {
        generatedAt: new Date().toISOString(),
        rules: rules.map((rule) => ({
            ...rule,
            platformName: platformById.get(rule.platformId)?.name || `Plataforma #${rule.platformId}`,
        })),
        coverage: {
            availableStatuses: Array.from(AVAILABLE_STATUSES),
            legacyAssignedStatuses: Array.from(LEGACY_ASSIGNED_STATUSES),
            description: "Un perfil queda cubierto si esta disponible o si tiene una suscripcion vigente.",
        },
        downStatuses: Array.from(DOWN_STATUSES),
        excluded,
        summary,
        rows,
    };
}

module.exports = {
    AVAILABLE_STATUSES,
    LEGACY_ASSIGNED_STATUSES,
    DOWN_STATUSES,
    normalizeAuditRules,
    buildAuditRows,
    getInventoryAudit,
};
