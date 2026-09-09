const pool = require("../db");
const { BOGOTA_TODAY_SQL, bogotaDateSql } = require("../utils/date");

const AVAILABLE_STATUSES = new Set(["available"]);
const LEGACY_ASSIGNED_STATUSES = new Set(["assigned", "sold"]);
const DOWN_STATUSES = new Set(["inactive", "down", "disabled", "expired", "legacy_review"]);

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

function buildAuditRows(rawRows, rules) {
    const normalizedRules = normalizeAuditRules(rules);
    const expectedByPlatform = new Map(normalizedRules.map((rule) => [rule.platformId, rule.expectedProfiles]));
    const groups = new Map();

    for (const row of rawRows || []) {
        const platformId = Number(row.platform_id);
        const expectedProfiles = expectedByPlatform.get(platformId);
        if (!expectedProfiles) continue;
        const accountEmail = String(row.account_email || "").trim();
        const key = `${platformId}:${accountEmail.toLowerCase()}`;
        if (!groups.has(key)) {
            groups.set(key, {
                platformId,
                platformName: row.platform_name || `Plataforma #${platformId}`,
                accountEmail,
                expectedProfiles,
                records: [],
                masterMarkedDown: false,
                masterNote: null,
            });
        }
        const group = groups.get(key);
        const profileNumber = Number.isInteger(Number(row.profile_number)) && Number(row.profile_number) > 0
            ? Number(row.profile_number)
            : null;
        const status = String(row.status || "").trim().toLowerCase();
        group.records.push({
            accountId: Number(row.account_id),
            profileNumber,
            status,
            hasActiveSubscription: Boolean(Number(row.has_active_subscription)),
            hasLegacyActiveAssignment: Boolean(Number(row.has_legacy_active_assignment)),
        });
        if (String(row.master_status || "").toLowerCase() === "inactive") {
            group.masterMarkedDown = true;
            group.masterNote = row.master_note || group.masterNote;
        }
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

        const isCoveredRecord = (record) => AVAILABLE_STATUSES.has(record.status)
            || record.hasActiveSubscription
            || (LEGACY_ASSIGNED_STATUSES.has(record.status) && record.hasLegacyActiveAssignment);
        const coveredProfiles = expected.filter((profile) =>
            (profileRecords.get(profile) || []).some(isCoveredRecord)
        );
        const presentProfiles = expected.filter((profile) => profileRecords.has(profile));
        const missingProfiles = expected.filter((profile) => !profileRecords.has(profile));
        const uncoveredProfiles = expected.filter((profile) => profileRecords.has(profile) && !coveredProfiles.includes(profile));
        const invalidProfiles = Array.from(profileRecords.keys()).filter((profile) => !expected.includes(profile)).sort((a, b) => a - b);
        const duplicateProfiles = expected.filter((profile) => (profileRecords.get(profile) || []).length > 1);
        const unprofiledRecords = group.records.filter((record) => record.profileNumber === null).map((record) => record.accountId);
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

        return {
            platformId: group.platformId,
            platformName: group.platformName,
            accountEmail: group.accountEmail,
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
                    THEN 1 ELSE 0
                END AS has_legacy_active_assignment,
                ma.status AS master_status,
                ma.notes AS master_note
           FROM platform_accounts pa
           JOIN platforms p ON p.id = pa.platform_id
           LEFT JOIN master_accounts ma
             ON ma.platform_id = pa.platform_id
            AND LOWER(TRIM(ma.account_email)) = LOWER(TRIM(pa.email))
          WHERE pa.platform_id IN (${placeholders})
          ORDER BY p.name, pa.email, pa.profile_number, pa.id`,
        ids
    );

    const rows = buildAuditRows(accountRows, rules);
    const summary = {
        totalAccounts: rows.length,
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
