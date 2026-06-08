const pool = require("../db");
const { toSqlDateStart } = require("../utils/date");
const {
    normalizeOptionalValue,
    normalizeProfileForAccount,
    normalizeProfileForIdentity,
} = require("../utils/normalize");

const PASSWORD_PROPAGATION_STATUSES = ["available", "assigned", "sold"];
const PASSWORD_PROPAGATION_BLOCKED_STATUSES = ["inactive", "disabled", "down"];

function parsePositiveNumber(value) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(String(value).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

function parsePositiveInt(value) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number.parseInt(String(value), 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

function resolveCostModel({ motherCostTotal, motherProfilesTotal }) {
    const total = parsePositiveNumber(motherCostTotal);
    const profiles = parsePositiveInt(motherProfilesTotal);
    if (!total || !profiles) {
        return { parentCostTotal: null, parentProfilesTotal: null, unitCost: null };
    }
    const unitCost = Number((total / profiles).toFixed(2));
    return {
        parentCostTotal: Number(total.toFixed(2)),
        parentProfilesTotal: profiles,
        unitCost,
    };
}

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

async function upsertIdentity(conn, { pid, emailValue, identityProf, password, pin }) {
    const [idRes] = await conn.query(
        `INSERT INTO account_identities (platform_id, email, profile_number, last_password, last_pin)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
          last_password=VALUES(last_password),
          last_pin=VALUES(last_pin),
          updated_at=CURRENT_TIMESTAMP`,
        [pid, emailValue, identityProf, password, pin]
    );

    let identityId = idRes.insertId;
    if (!identityId) {
        const [ids] = await conn.query(
            `SELECT id FROM account_identities WHERE platform_id=? AND LOWER(email)=LOWER(?) AND profile_number=? LIMIT 1`,
            [pid, emailValue, identityProf]
        );
        identityId = ids?.[0]?.id || null;
    }
    return identityId;
}

async function insertAccount(conn, { identityId, pid, pname, emailValue, password, pin, accountProf, exp, costModel }) {
    const [ins] = await conn.query(
        `INSERT INTO platform_accounts
     (identity_id, platform_id, platform_name, email, password, pin, profile_number, status, expires_at, parent_account_cost_total, parent_profiles_total, unit_cost)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?)`,
        [
            identityId,
            pid,
            pname || "",
            emailValue,
            password,
            pin,
            accountProf,
            exp,
            costModel?.parentCostTotal ?? null,
            costModel?.parentProfilesTotal ?? null,
            costModel?.unitCost ?? null,
        ]
    );
    
    // Al añadir stock nuevo a esta plataforma, resolvemos las notificaciones pendientes de stock
    await resolveStockAlerts(conn, pid, pname);
    
    return ins.insertId;
}

/**
 * Cuando entra stock de una plataforma, busca a todos los usuarios
 * que pidieron aviso y les crea una notificación interna.
 */
async function resolveStockAlerts(conn, pid, pname) {
    if (!pid) return;

    // 1. Encontrar a quiénes notificar (solo usuarios buscando esta plataforma)
    // Utilizamos un subquery o un JOIN para conectar con los IDs de precio asociados al platform
    const [subs] = await conn.query(`
        SELECT ss.id as sub_id, ss.user_id, pp.duration_id
        FROM stock_subscriptions ss
        JOIN platform_prices pp ON pp.id = ss.platform_price_id
        WHERE pp.platform_id = ? AND ss.is_notified = FALSE
    `, [pid]);

    if (!subs.length) return;

    const notifyPromises = subs.map(async (sub) => {
        // 2. Crear notificación para el usuario
        const msg = `¡Ya hay stock disponible de ${pname}! Ingresa al catálogo para comprar.`;
        await conn.query(`
            INSERT INTO user_notifications (user_id, message)
            VALUES (?, ?)
        `, [sub.user_id, msg]);

        // 3. Marcar la suscripcion como notificada para no avisar dos veces
        await conn.query(`
            UPDATE stock_subscriptions SET is_notified = TRUE WHERE id = ?
        `, [sub.sub_id]);
    });

    await Promise.all(notifyPromises);
}

async function propagatePassword(conn, { pid, emailValue, password, newId }) {
    await conn.query(
        `UPDATE platform_accounts
     SET password = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE LOWER(email) = LOWER(?)
       AND id <> ?
       AND (
         platform_accounts.platform_id = ?
         OR EXISTS (
            SELECT 1
              FROM platform_fallbacks pf
             WHERE COALESCE(pf.is_active, 1) = 1
               AND (
                 (pf.source_platform_id = ? AND pf.fallback_platform_id = platform_accounts.platform_id)
                 OR (pf.source_platform_id = platform_accounts.platform_id AND pf.fallback_platform_id = ?)
               )
         )
       )
       AND LOWER(TRIM(COALESCE(status, ''))) NOT IN (${PASSWORD_PROPAGATION_BLOCKED_STATUSES.map(() => "?").join(",")})
       AND (
         TRIM(COALESCE(status, '')) = ''
         OR LOWER(TRIM(status)) IN (${PASSWORD_PROPAGATION_STATUSES.map(() => "?").join(",")})
         OR EXISTS (
            SELECT 1
              FROM subscriptions s
             WHERE s.platform_account_id = platform_accounts.id
               AND s.status = 'active'
               AND (
                 platform_accounts.expires_at IS NULL
                 OR platform_accounts.expires_at >= UTC_TIMESTAMP()
                 OR s.expires_at >= UTC_TIMESTAMP()
               )
         )
       )`,
        [
            password,
            emailValue,
            newId,
            pid,
            pid,
            pid,
            ...PASSWORD_PROPAGATION_BLOCKED_STATUSES,
            ...PASSWORD_PROPAGATION_STATUSES,
        ]
    );
}

async function createAccountOne(conn, body) {
    const { platformId, platformName, email, password, pin, profileNumber, expiresAt } = body;

    if (!email || !password || (!platformId && !platformName)) {
        const err = new Error("platformId o platformName, email y password son obligatorios.");
        err.status = 400;
        throw err;
    }

    const emailValue = String(email).trim();
    const identityProf = normalizeProfileForIdentity(profileNumber);
    const accountProf = normalizeProfileForAccount(profileNumber);
    const exp = expiresAt ? toSqlDateStart(expiresAt) : null;
    const costModel = resolveCostModel({
        motherCostTotal: body.motherCostTotal ?? body.parentAccountCostTotal,
        motherProfilesTotal: body.motherProfilesTotal ?? body.parentProfilesTotal,
    });

    const { pid, pname } = await resolvePlatform(conn, { platformId, platformName });

    const identityId = await upsertIdentity(conn, {
        pid,
        emailValue,
        identityProf,
        password,
        pin: normalizeOptionalValue(pin),
    });

    const newId = await insertAccount(conn, {
        identityId,
        pid,
        pname,
        emailValue,
        password,
        pin: normalizeOptionalValue(pin),
        accountProf,
        exp,
        costModel,
    });

    await propagatePassword(conn, { pid, emailValue, password, newId });

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
            email: String(r.email || "").trim(),
            password: String(r.password || "").trim(),
            pin: normalizeOptionalValue(r.pin),
            profileNumber,
            expiresAt: String(r.expiresAt || r.expires_at || "").trim(),
            motherCostTotal: r.motherCostTotal ?? r.parentAccountCostTotal ?? r.costoCuentaMadre ?? "",
            motherProfilesTotal: r.motherProfilesTotal ?? r.parentProfilesTotal ?? r.cantidadPerfiles ?? "",
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
        const costModel = resolveCostModel({
            motherCostTotal: r.motherCostTotal,
            motherProfilesTotal: r.motherProfilesTotal,
        });

        const identityId = await upsertIdentity(conn, {
            pid,
            emailValue: r.email,
            identityProf,
            password: r.password,
            pin: r.pin,
        });

        const newId = await insertAccount(conn, {
            identityId,
            pid,
            pname: r.platformName || "",
            emailValue: r.email,
            password: r.password,
            pin: r.pin,
            accountProf,
            exp,
            costModel,
        });

        await propagatePassword(conn, { pid, emailValue: r.email, password: r.password, newId });

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
