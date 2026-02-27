const pool = require("../db");
const { toSqlDateStart } = require("../utils/date");
const {
    normalizeOptionalValue,
    normalizeProfileForAccount,
    normalizeProfileForIdentity,
} = require("../utils/normalize");

const ACTIVE_STATUSES = ["available", "assigned"];

async function resolvePlatform(conn, { platformId, platformName }) {
    let pid = platformId ? Number(platformId) : null;
    let pname = String(platformName || "").trim();

    if (!pid) {
        const [ps] = await conn.query(
            `SELECT id, name FROM platforms WHERE LOWER(name) = LOWER(?) LIMIT 1`,
            [pname]
        );
        if (!ps.length) {
            const err = new Error("platformName no existe en la tabla platforms.");
            err.status = 400;
            err.payload = { platformName: pname };
            throw err;
        }
        pid = Number(ps[0].id);
        pname = ps[0].name;
    } else if (!pname) {
        const [ps] = await conn.query(`SELECT name FROM platforms WHERE id=? LIMIT 1`, [pid]);
        if (ps.length) pname = ps[0].name;
    }

    return { pid, pname };
}

async function upsertIdentity(conn, { pid, emailNorm, identityProf, password, pin }) {
    const [idRes] = await conn.query(
        `INSERT INTO account_identities (platform_id, email, profile_number, last_password, last_pin)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
          last_password=VALUES(last_password),
          last_pin=VALUES(last_pin),
          updated_at=CURRENT_TIMESTAMP`,
        [pid, emailNorm, identityProf, password, pin]
    );

    let identityId = idRes.insertId;
    if (!identityId) {
        const [ids] = await conn.query(
            `SELECT id FROM account_identities WHERE platform_id=? AND email=? AND profile_number=? LIMIT 1`,
            [pid, emailNorm, identityProf]
        );
        identityId = ids?.[0]?.id || null;
    }
    return identityId;
}

async function insertAccount(conn, { identityId, pid, pname, emailNorm, password, pin, accountProf, exp }) {
    const [ins] = await conn.query(
        `INSERT INTO platform_accounts
     (identity_id, platform_id, platform_name, email, password, pin, profile_number, status, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?)`,
        [identityId, pid, pname || "", emailNorm, password, pin, accountProf, exp]
    );
    return ins.insertId;
}

async function propagatePassword(conn, { pid, emailNorm, password, newId }) {
    await conn.query(
        `UPDATE platform_accounts
     SET password = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE platform_id = ?
       AND LOWER(email) = LOWER(?)
       AND status IN (${ACTIVE_STATUSES.map(() => "?").join(",")})
       AND id <> ?`,
        [password, pid, emailNorm, ...ACTIVE_STATUSES, newId]
    );
}

async function createAccountOne(conn, body) {
    const { platformId, platformName, email, password, pin, profileNumber, expiresAt } = body;

    if (!email || !password || (!platformId && !platformName)) {
        const err = new Error("platformId o platformName, email y password son obligatorios.");
        err.status = 400;
        throw err;
    }

    const emailNorm = String(email).trim().toLowerCase();
    const identityProf = normalizeProfileForIdentity(profileNumber);
    const accountProf = normalizeProfileForAccount(profileNumber);
    const exp = expiresAt ? toSqlDateStart(expiresAt) : null;

    const { pid, pname } = await resolvePlatform(conn, { platformId, platformName });

    const identityId = await upsertIdentity(conn, {
        pid,
        emailNorm,
        identityProf,
        password,
        pin: normalizeOptionalValue(pin),
    });

    const newId = await insertAccount(conn, {
        identityId,
        pid,
        pname,
        emailNorm,
        password,
        pin: normalizeOptionalValue(pin),
        accountProf,
        exp,
    });

    await propagatePassword(conn, { pid, emailNorm, password, newId });

    return { id: newId, platformId: pid, platformName: pname };
}

async function resolvePlatformsByName(rows) {
    const needResolve = rows.filter((r) => !r.platformId && r.platformName);
    if (!needResolve.length) return new Map();

    const names = [...new Set(needResolve.map((r) => r.platformName.toLowerCase()))];
    const placeholders = names.map(() => "?").join(",");

    const [ps] = await pool.query(
        `SELECT id, name FROM platforms WHERE LOWER(name) IN (${placeholders})`,
        names
    );
    return new Map(ps.map((p) => [String(p.name).toLowerCase(), Number(p.id)]));
}

function normalizeBulkRows(rows) {
    return rows.map((r) => {
        const platformId = r.platformId ? Number(r.platformId) : null;
        const platformName = String(r.platformName || r.platform || r.platform_name || "").trim();

        const rawProfile = r.profileNumber ?? r.profile_number ?? r.profile ?? "";
        const profileNumber = normalizeOptionalValue(rawProfile); // string o null

        return {
            platformId,
            platformName,
            email: String(r.email || "").trim().toLowerCase(),
            password: String(r.password || "").trim(),
            pin: normalizeOptionalValue(r.pin),
            profileNumber,
            expiresAt: String(r.expiresAt || r.expires_at || "").trim(),
        };
    });
}

async function bulkInsertAccounts(conn, rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        const err = new Error("rows vacío.");
        err.status = 400;
        throw err;
    }

    const normalized = normalizeBulkRows(rows);
    const candidates = normalized.filter((r) => r.email && r.password && (r.platformId || r.platformName));
    if (candidates.length === 0) {
        const err = new Error("❌ No hay filas válidas (requiere platformId o platformName, email, password).");
        err.status = 400;
        throw err;
    }

    const mapByName = await resolvePlatformsByName(candidates);

    let inserted = 0;
    const missingPlatforms = new Set();

    for (const r of candidates) {
        let pid = r.platformId;
        if (!pid) pid = mapByName.get(String(r.platformName).toLowerCase()) || null;

        if (!pid) {
            missingPlatforms.add(r.platformName || "(vacío)");
            continue;
        }

        const identityProf = normalizeProfileForIdentity(r.profileNumber);
        const accountProf = normalizeProfileForAccount(r.profileNumber);
        const exp = r.expiresAt ? toSqlDateStart(r.expiresAt) : null;

        const identityId = await upsertIdentity(conn, {
            pid,
            emailNorm: r.email,
            identityProf,
            password: r.password,
            pin: r.pin,
        });

        const newId = await insertAccount(conn, {
            identityId,
            pid,
            pname: r.platformName || "",
            emailNorm: r.email,
            password: r.password,
            pin: r.pin,
            accountProf,
            exp,
        });

        await propagatePassword(conn, { pid, emailNorm: r.email, password: r.password, newId });

        inserted += 1;
    }

    return {
        inserted,
        missingPlatforms: [...missingPlatforms].slice(0, 20),
    };
}

module.exports = {
    createAccountOne,
    bulkInsertAccounts,
};
