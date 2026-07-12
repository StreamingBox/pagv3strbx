const pool = require("../db");
const { toSqlDateStart } = require("../utils/date");
const {
    normalizeOptionalValue,
    normalizeProfileForAccount,
    normalizeProfileForIdentity,
} = require("../utils/normalize");
const {
    normalizeCostMode,
    resolveCostModel,
    validateCostModelInput,
} = require("../utils/accountCosts");
const { isIptvProduct } = require("../utils/productDeliveryProfile");
const { normalizeAccessUrl } = require("../utils/accountAccess");
const { enqueueNotification } = require("./notificationOutbox.service");

const PASSWORD_PROPAGATION_STATUSES = ["available", "assigned", "sold"];
const PASSWORD_PROPAGATION_BLOCKED_STATUSES = ["inactive", "disabled", "down"];

async function resolvePlatform(conn, { platformId, platformName }) {
    let pid = platformId ? Number(platformId) : null;
    let pname = String(platformName || "").trim();
    let platformSlug = "";

    if (!pid) {
        const [ps] = await conn.query(
            `SELECT id, name, slug FROM platforms WHERE LOWER(name) = LOWER(?) LIMIT 1`,
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
        platformSlug = ps[0].slug || "";
    } else {
        const [ps] = await conn.query(`SELECT name, slug FROM platforms WHERE id=? LIMIT 1`, [pid]);
        if (ps.length) {
            if (!pname) pname = ps[0].name;
            platformSlug = ps[0].slug || "";
        }
    }

    return { pid, pname, platformSlug };
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

async function insertAccount(conn, { identityId, pid, pname, emailValue, password, accessUrl, pin, twoFactorSecret, accountProf, exp, costModel }) {
    const [ins] = await conn.query(
        `INSERT INTO platform_accounts
     (identity_id, platform_id, platform_name, email, password, access_url, pin, two_factor_secret, profile_number, status, expires_at, parent_account_cost_total, parent_profiles_total, unit_cost)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?)`,
        [
            identityId,
            pid,
            pname || "",
            emailValue,
            password,
            accessUrl,
            pin,
            twoFactorSecret,
            accountProf,
            exp,
            costModel?.parentCostTotal ?? null,
            costModel?.parentProfilesTotal ?? null,
            costModel?.unitCost ?? null,
        ]
    );
    
    // Al añadir stock nuevo a esta plataforma, resolvemos las notificaciones pendientes de stock
    await queueStockAvailabilityNotifications(conn, pid, pname);
    
    return ins.insertId;
}

function firstNonEmpty(...values) {
    for (const value of values) {
        if (value !== null && value !== undefined && String(value).trim()) {
            return String(value).trim();
        }
    }
    return "";
}

function isScreenCostInput(costInput = {}) {
    return normalizeCostMode(costInput.costMode) === "screen";
}

function buildDuplicatePayload(row, rowNumber = null) {
    if (!row) return null;
    return {
        rowNumber,
        accountId: row.id,
        platformId: row.platform_id,
        platformName: row.platform_name || "",
        email: row.email || "",
        profileNumber: row.profile_number ?? null,
        status: row.status || "",
        assignedTo: row.assigned_user_email || row.assigned_user_name || "",
        assignedUserEmail: row.assigned_user_email || "",
        assignedUserName: row.assigned_user_name || "",
        expiresAt: row.effective_expires_date || row.subscription_expires_at || row.expires_at || null,
        accountExpiresAt: row.expires_at || null,
        subscriptionExpiresAt: row.subscription_expires_at || null,
        effectiveExpiresDate: row.effective_expires_date || null,
        subscriptionId: row.subscription_id || null,
        orderId: row.order_id || null,
        orderCode: row.order_code || null,
    };
}

function duplicateSummaryLine(item) {
    const row = item.rowNumber ? `Fila ${item.rowNumber}: ` : "";
    const profile = item.profileNumber === null || item.profileNumber === undefined || String(item.profileNumber).trim() === ""
        ? "sin perfil"
        : `perfil ${item.profileNumber}`;
    const order = item.orderCode || (item.orderId ? `orden #${item.orderId}` : item.subscriptionId ? `venta #${item.subscriptionId}` : "sin orden activa");
    const assignedTo = item.assignedTo ? `, asignada a ${item.assignedTo}` : "";
    const expires = item.expiresAt ? `, expira ${String(item.expiresAt).slice(0, 10)}` : ", sin fecha de expiracion";
    return `${row}no se cargo ${item.platformName || "la plataforma"} ${item.email} (${profile}) porque ya existe la cuenta #${item.accountId}${assignedTo}, ${order}${expires}.`;
}

function duplicateSummaryMessage(items = [], limit = 5) {
    const list = items.slice(0, limit).map(duplicateSummaryLine);
    if (items.length > limit) {
        list.push(`... y ${items.length - limit} duplicada(s) mas.`);
    }
    return list.join(" ");
}

async function findActiveAssignedScreenDuplicate(conn, { pid, emailValue, accountProf }) {
    const params = [pid, emailValue];
    const profileSql = accountProf === null || accountProf === undefined || String(accountProf).trim() === ""
        ? "(pa.profile_number IS NULL OR CAST(pa.profile_number AS CHAR) = '')"
        : "CAST(pa.profile_number AS CHAR) = ?";
    if (profileSql.includes("?")) params.push(String(accountProf));

    const [rows] = await conn.query(
        `SELECT
            pa.id,
            pa.platform_id,
            COALESCE(p.name, pa.platform_name) AS platform_name,
            pa.email,
            pa.profile_number,
            pa.status,
            pa.expires_at,
            active_sub.expires_at AS subscription_expires_at,
            DATE_FORMAT(
                CASE
                    WHEN active_sub.expires_at IS NOT NULL THEN DATE(active_sub.expires_at)
                    ELSE DATE(DATE_SUB(pa.expires_at, INTERVAL 5 HOUR))
                END,
                '%Y-%m-%d'
            ) AS effective_expires_date,
            u.email AS assigned_user_email,
            u.name AS assigned_user_name,
            active_sub.id AS subscription_id,
            o.id AS order_id,
            o.order_code
         FROM platform_accounts pa
         LEFT JOIN platforms p ON p.id = pa.platform_id
         LEFT JOIN users u ON u.id = pa.assigned_to_user_id
         LEFT JOIN subscriptions active_sub
           ON active_sub.platform_account_id = pa.id
          AND active_sub.status = 'active'
         LEFT JOIN order_items oi ON oi.subscription_id = active_sub.id
         LEFT JOIN orders o ON o.id = oi.order_id
         WHERE pa.platform_id = ?
           AND LOWER(pa.email) = LOWER(?)
           AND ${profileSql}
           AND (
                (
                    active_sub.id IS NOT NULL
                    AND DATE(active_sub.expires_at) >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))
                )
                OR (
                    active_sub.id IS NULL
                    AND (
                        LOWER(TRIM(COALESCE(pa.status, ''))) = 'assigned'
                        OR pa.assigned_to_user_id IS NOT NULL
                    )
                    AND pa.expires_at IS NOT NULL
                    AND DATE(DATE_SUB(pa.expires_at, INTERVAL 5 HOUR)) >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))
                )
           )
         ORDER BY pa.id DESC
         LIMIT 1`,
        params
    );

    return rows?.[0] || null;
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

async function queueStockAvailabilityNotifications(conn, pid, pname) {
    if (!pid) return;

    const [subs] = await conn.query(`
        SELECT
            ss.id AS sub_id,
            ss.user_id,
            u.email AS user_email,
            u.name AS user_name,
            p.name AS platform_name,
            d.name AS duration_name
        FROM stock_subscriptions ss
        JOIN platform_prices pp ON pp.id = ss.platform_price_id
        JOIN platforms p ON p.id = pp.platform_id
        LEFT JOIN durations d ON d.id = pp.duration_id
        JOIN users u ON u.id = ss.user_id
        WHERE pp.platform_id = ? AND ss.is_notified = FALSE
    `, [pid]);

    if (!subs.length) return;

    for (const sub of subs) {
        const platformName = sub.platform_name || pname || "este producto";
        const msg = `Ya hay stock disponible de ${platformName}. Ingresa al catalogo para comprar.`;

        await conn.query(`
            INSERT INTO user_notifications (user_id, message)
            VALUES (?, ?)
        `, [sub.user_id, msg]);

        await conn.query(`
            UPDATE stock_subscriptions SET is_notified = TRUE WHERE id = ?
        `, [sub.sub_id]);

        if (sub.user_email) {
            await enqueueNotification(conn, {
                channel: "email",
                eventType: "stock_available",
                dedupeKey: `stock-available:${sub.sub_id}`,
                payload: {
                    to: sub.user_email,
                    name: sub.user_name,
                    platformName,
                    durationName: sub.duration_name,
                },
            });
        }
    }
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
                 OR DATE(DATE_SUB(platform_accounts.expires_at, INTERVAL 5 HOUR)) >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))
                 OR DATE(s.expires_at) >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))
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
    const { platformId, platformName, password, pin, profileNumber, expiresAt } = body;
    const email = firstNonEmpty(body.email, body.correo, body.username, body.user, body.usuario);

    if (!email || !password || (!platformId && !platformName)) {
        const err = new Error("platformId o platformName, email y password son obligatorios.");
        err.status = 400;
        throw err;
    }

    const emailValue = String(email).trim();
    const twoFactorSecret = normalizeOptionalValue(
        body.twoFactorSecret
        ?? body.two_factor_secret
        ?? body.twoFactor
        ?? body["2FA"]
        ?? body["2fa"]
    );
    const identityProf = normalizeProfileForIdentity(profileNumber);
    const accountProf = normalizeProfileForAccount(profileNumber);
    const exp = expiresAt ? toSqlDateStart(expiresAt) : null;
    const costInput = {
        costMode: body.costMode ?? body.tipoCosto,
        costAmount: body.costAmount ?? body.valorCosto,
        unitCost: body.unitCost ?? body.costoPantalla,
        screenCost: body.screenCost,
        motherCostTotal: body.motherCostTotal ?? body.parentAccountCostTotal,
        motherProfilesTotal: body.motherProfilesTotal ?? body.parentProfilesTotal,
    };
    const costModel = validateCostModelInput(costInput);

    const { pid, pname, platformSlug } = await resolvePlatform(conn, { platformId, platformName });
    const accessUrl = normalizeAccessUrl(
        body.accessUrl ?? body.access_url ?? body.url ?? body.URL,
        { required: isIptvProduct({ platformName: pname, platformSlug }) }
    );

    if (isScreenCostInput(costInput)) {
        const duplicate = await findActiveAssignedScreenDuplicate(conn, { pid, emailValue, accountProf });
        if (duplicate) {
            const payload = buildDuplicatePayload(duplicate);
            const err = new Error(
                `No se cargo la pantalla porque ya esta asignada y no ha expirado. ${duplicateSummaryLine(payload)}`
            );
            err.status = 409;
            err.payload = { duplicateAssigned: [payload] };
            throw err;
        }
    }

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
        accessUrl,
        pin: normalizeOptionalValue(pin),
        twoFactorSecret,
        accountProf,
        exp,
        costModel,
    });

    await propagatePassword(conn, { pid, emailValue, password, newId });

    return { id: newId, platformId: pid, platformName: pname };
}

async function resolvePlatformsByName(conn, rows) {
    const needResolve = rows.filter((r) => !r.platformId && r.platformName);
    if (!needResolve.length) return new Map();

    const names = [...new Set(needResolve.map((r) => r.platformName.toLowerCase()))];
    const placeholders = names.map(() => "?").join(",");

    const [ps] = await conn.query(
        `SELECT id, name, slug FROM platforms WHERE LOWER(name) IN (${placeholders})`,
        names
    );
    return new Map(ps.map((p) => [
        String(p.name).toLowerCase(),
        { id: Number(p.id), name: p.name, slug: p.slug || "" },
    ]));
}

async function resolvePlatformsById(conn, rows) {
    const ids = [...new Set(
        rows.map((row) => Number(row.platformId)).filter((id) => Number.isInteger(id) && id > 0)
    )];
    if (!ids.length) return new Map();

    const placeholders = ids.map(() => "?").join(",");
    const [platforms] = await conn.query(
        `SELECT id, name, slug FROM platforms WHERE id IN (${placeholders})`,
        ids
    );
    return new Map(platforms.map((platform) => [
        Number(platform.id),
        { id: Number(platform.id), name: platform.name, slug: platform.slug || "" },
    ]));
}

function normalizeBulkRows(rows) {
    return rows.map((r, index) => {
        const platformId = (r.platformId ?? r.plataformaId)
            ? Number(r.platformId ?? r.plataformaId)
            : null;
        const platformName = String(
            r.platformName || r.platform || r.platform_name || r.plataforma || ""
        ).trim();

        const rawProfile = r.profileNumber ?? r.profile_number ?? r.profile ?? r.perfil ?? "";
        const profileNumber = normalizeOptionalValue(rawProfile); // string o null

        return {
            rowNumber: index + 2,
            platformId,
            platformName,
            email: firstNonEmpty(r.usuario, r.Usuario, r.username, r.user, r.email, r.correo),
            password: String(r.password || r.contrasena || r.clave || "").trim(),
            accessUrl: normalizeOptionalValue(r.accessUrl ?? r.access_url ?? r.url ?? r.URL ?? r.Url),
            pin: normalizeOptionalValue(r.pin),
            twoFactorSecret: normalizeOptionalValue(
                r.twoFactorSecret
                ?? r.two_factor_secret
                ?? r.twoFactor
                ?? r["2FA"]
                ?? r["2fa"]
            ),
            profileNumber,
            expiresAt: String(r.expiresAt || r.expires_at || r.expiracion || "").trim(),
            costMode: r.costMode ?? r.tipoCosto ?? r.tipo_costo ?? "",
            costAmount: r.costAmount ?? r.valorCosto ?? r.valor_costo ?? "",
            unitCost: r.unitCost ?? r.costoPantalla ?? r.costo_pantalla ?? "",
            motherCostTotal: r.motherCostTotal ?? r.parentAccountCostTotal ?? r.costoCuentaMadre ?? "",
            motherProfilesTotal: r.motherProfilesTotal ?? r.parentProfilesTotal ?? r.cantidadPerfiles ?? r.totalPantallas ?? "",
        };
    });
}

async function bulkInsertAccounts(conn, rows, options = {}) {
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

    const mapByName = await resolvePlatformsByName(conn, candidates);
    const mapById = await resolvePlatformsById(conn, candidates);

    let inserted = 0;
    const missingPlatforms = new Set();
    let missingPlatformRows = 0;
    const duplicateAssigned = [];
    const allowAssignedDuplicateScreens = options.allowAssignedDuplicateScreens === true;

    for (const [rowIndex, r] of candidates.entries()) {
        let platform = r.platformId ? mapById.get(Number(r.platformId)) : null;
        if (!platform) platform = mapByName.get(String(r.platformName).toLowerCase()) || null;
        const pid = platform?.id || null;

        if (!pid) {
            missingPlatforms.add(r.platformName || "(vacío)");
            missingPlatformRows += 1;
            continue;
        }

        const identityProf = normalizeProfileForIdentity(r.profileNumber);
        const accountProf = normalizeProfileForAccount(r.profileNumber);
        const exp = r.expiresAt ? toSqlDateStart(r.expiresAt) : null;
        let accessUrl;
        try {
            accessUrl = normalizeAccessUrl(r.accessUrl, {
                required: isIptvProduct({ platformName: platform.name, platformSlug: platform.slug }),
            });
        } catch (err) {
            err.message = `Fila ${r.rowNumber || rowIndex + 2}: ${err.message}`;
            throw err;
        }
        const costInput = {
            costMode: r.costMode,
            costAmount: r.costAmount,
            unitCost: r.unitCost,
            motherCostTotal: r.motherCostTotal,
            motherProfilesTotal: r.motherProfilesTotal,
        };
        let costModel;
        try {
            costModel = validateCostModelInput(costInput);
        } catch (err) {
            err.message = `Fila ${rowIndex + 2}: ${err.message}`;
            throw err;
        }

        if (isScreenCostInput(costInput) && !allowAssignedDuplicateScreens) {
            const duplicate = await findActiveAssignedScreenDuplicate(conn, {
                pid,
                emailValue: r.email,
                accountProf,
            });
            if (duplicate) {
                duplicateAssigned.push(buildDuplicatePayload(duplicate, r.rowNumber || rowIndex + 2));
                continue;
            }
        }

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
            pname: platform.name,
            emailValue: r.email,
            password: r.password,
            accessUrl,
            pin: r.pin,
            twoFactorSecret: r.twoFactorSecret,
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
        missingPlatformRows,
        skippedDuplicateAssigned: duplicateAssigned.length,
        duplicateAssigned,
        forcedAssignedDuplicates: allowAssignedDuplicateScreens,
    };
}

module.exports = {
    createAccountOne,
    bulkInsertAccounts,
    duplicateSummaryLine,
    duplicateSummaryMessage,
    findActiveAssignedScreenDuplicate,
    isScreenCostInput,
};
