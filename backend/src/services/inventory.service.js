// BACKEND
// pagv2strbx/src/services/inventory.service.js

const pool = require("../db");
const { escapeCsv } = require("../utils/csv");
const { formatDateOnlyBogota, parseDateOnly, toSqlDateStart } = require("../utils/date");
const { normalizeOptionalValue } = require("../utils/normalize");

const LATEST_REPLACEMENT_JOIN = `
LEFT JOIN (
    SELECT arl1.*
    FROM account_replacement_logs arl1
    INNER JOIN (
        SELECT new_account_id, MAX(id) AS max_id
        FROM account_replacement_logs
        GROUP BY new_account_id
    ) arl_last ON arl_last.max_id = arl1.id
) latest_replacement ON latest_replacement.new_account_id = pa.id`;

/**
 * Construye WHERE dinámico + params para inventory/export.
 */
function buildInventoryWhere({ platformId, status, q, assignedTo, expiresFrom, expiresTo }) {
    const where = [];
    const params = [];

    if (platformId) {
        where.push("pa.platform_id = ?");
        params.push(Number(platformId));
    }

    if (status) {
        if (status === "sold") {
            where.push("pa.status IN ('assigned','sold')");
        } else if (["assigned", "available", "inactive", "down"].includes(status)) {
            where.push("pa.status = ?");
            params.push(status);
        } else {
            // ignorar status inválido
        }
    }

    if (q) {
        where.push(`(
            pa.email LIKE ? OR
            pa.platform_name LIKE ? OR
            p.name LIKE ? OR
            u.email LIKE ? OR
            CAST(active_sub.id AS CHAR) LIKE ? OR
            CAST(latest_replacement.subscription_id AS CHAR) LIKE ? OR
            CAST(latest_replacement.order_id AS CHAR) LIKE ? OR
            COALESCE(latest_replacement.order_code, '') LIKE ?
        )`);
        params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    if (assignedTo) {
        where.push("u.email LIKE ?");
        params.push(`%${assignedTo}%`);
    }

    const from = parseDateOnly(expiresFrom);
    const to = parseDateOnly(expiresTo);

    if (from) {
        where.push("DATE(COALESCE(active_sub.expires_at, pa.expires_at)) >= ?");
        params.push(from);
    }
    if (to) {
        where.push("DATE(COALESCE(active_sub.expires_at, pa.expires_at)) <= ?");
        params.push(to);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    return { whereSql, params };
}

/**
 * GET /admin/inventory
 */
async function getInventory(query = {}) {
    const { platformId, status, q, assignedTo, expiresFrom, expiresTo, page = 1, limit = 5 } = query;

    const { whereSql, params } = buildInventoryWhere({
        platformId,
        status,
        q,
        assignedTo,
        expiresFrom,
        expiresTo,
    });

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 2000);
    const offset = (pageNum - 1) * limitNum;

    // Obtener total
    const [countRows] = await pool.query(
        `SELECT COUNT(*) as total
         FROM platform_accounts pa
         LEFT JOIN platforms p ON p.id = pa.platform_id
         LEFT JOIN users u ON u.id = pa.assigned_to_user_id
         LEFT JOIN subscriptions active_sub
           ON active_sub.platform_account_id = pa.id
          AND active_sub.status = 'active'
         ${LATEST_REPLACEMENT_JOIN}
         ${whereSql}`,
        params
    );
    const total = countRows[0]?.total || 0;

    const [rows] = await pool.query(
        `SELECT
      pa.id,
      pa.platform_id,
      p.name AS platform_name_ref,
      pa.platform_name AS platform_name_raw,
      pa.email,
      pa.password,
      pa.pin,
      pa.profile_number,
      pa.status,
      pa.assigned_to_user_id,
      u.email AS assigned_user_email,
      u.name  AS assigned_user_name,
      pa.assigned_at,
      pa.expires_at,
      COALESCE(active_sub.id, latest_replacement.subscription_id) AS sale_id,
      latest_replacement.order_id AS replacement_order_id,
      latest_replacement.order_code AS replacement_order_code,
      active_sub.expires_at AS subscription_expires_at,
      pa.created_at,
      pa.updated_at
    FROM platform_accounts pa
    LEFT JOIN platforms p ON p.id = pa.platform_id
    LEFT JOIN users u ON u.id = pa.assigned_to_user_id
    LEFT JOIN subscriptions active_sub
      ON active_sub.platform_account_id = pa.id
     AND active_sub.status = 'active'
    ${LATEST_REPLACEMENT_JOIN}
    ${whereSql}
    ORDER BY pa.id DESC
    LIMIT ${limitNum} OFFSET ${offset}`,
        params
    );

    const items = rows.map((r) => ({
        ...r,
        platform_name: r.platform_name_ref || r.platform_name_raw || "",
        sale_id: r.sale_id || null,
        replacement_order_id: r.replacement_order_id || null,
        replacement_order_code: r.replacement_order_code || null,
        display_expires_at: r.subscription_expires_at || r.expires_at,
        sold_like: ["assigned", "sold"].includes(String(r.status || "")),
    }));

    return {
        items,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
    };
}

/**
 * GET /admin/inventory/export
 * Devuelve { filename, csv } para que el route sete headers y responda.
 */
async function exportInventoryCsv(query = {}) {
    const { platformId, status, q, assignedTo, expiresFrom, expiresTo } = query;

    const { whereSql, params } = buildInventoryWhere({
        platformId,
        status,
        q,
        assignedTo,
        expiresFrom,
        expiresTo,
    });

    const [rows] = await pool.query(
        `SELECT
      pa.id,
      COALESCE(p.name, pa.platform_name) AS platform_name,
      pa.email,
      pa.password,
      pa.pin,
      pa.profile_number,
      pa.status,
      u.email AS assigned_user_email,
      COALESCE(active_sub.id, latest_replacement.subscription_id) AS sale_id,
      pa.expires_at,
      active_sub.expires_at AS subscription_expires_at
    FROM platform_accounts pa
    LEFT JOIN platforms p ON p.id = pa.platform_id
    LEFT JOIN users u ON u.id = pa.assigned_to_user_id
    LEFT JOIN subscriptions active_sub
      ON active_sub.platform_account_id = pa.id
     AND active_sub.status = 'active'
    ${LATEST_REPLACEMENT_JOIN}
    ${whereSql}
    ORDER BY pa.expires_at DESC, pa.id DESC`,
        params
    );

    const header = [
        "id",
        "platform",
        "email",
        "password",
        "pin",
        "profile_number",
        "status",
        "sale_id",
        "assigned_to",
        "expires_at",
    ].join(",");

    const lines = rows.map((r) =>
        [
            escapeCsv(r.id),
            escapeCsv(r.platform_name),
            escapeCsv(r.email),
            escapeCsv(r.password),
            escapeCsv(r.pin),
            escapeCsv(r.profile_number),
            escapeCsv(r.status),
            escapeCsv(r.sale_id || ""),
            escapeCsv(r.assigned_user_email || ""),
            escapeCsv((r.subscription_expires_at || r.expires_at) ? formatDateOnlyBogota(r.subscription_expires_at || r.expires_at) : ""),
        ].join(",")
    );

    return {
        filename: "inventario.csv",
        csv: [header, ...lines].join("\n"),
    };
}

/**
 * PATCH /admin/inventory/:id
 * Permite:
 *  - resetear asignación
 *  - cambiar status/email/password/pin/profile_number/expires_at
 */
async function patchInventory(id, body = {}) {
    const {
        status,
        email,
        password,
        pin,
        profile_number,
        reset_assign,
        expires_at,
        expiresAt,
    } = body;

    if (!id) {
        const err = new Error("id requerido.");
        err.status = 400;
        throw err;
    }

    if (reset_assign) {
        await pool.query(
            `UPDATE platform_accounts
       SET assigned_to_user_id = NULL,
           assigned_at = NULL,
           expires_at = NULL,
           status = 'available'
       WHERE id = ?`,
            [id]
        );
        return { ok: true, reset: true };
    }

    const expOnly = parseDateOnly(expiresAt) || parseDateOnly(expires_at);
    const expSql = expOnly ? toSqlDateStart(expOnly) : null;

    // Nota: normalizeOptionalValue para que "" -> null (no pisa con vacío si no quieres)
    const emailNorm = email === undefined ? null : normalizeOptionalValue(email);
    const passNorm = password === undefined ? null : normalizeOptionalValue(password);
    const pinNorm = pin === undefined ? null : normalizeOptionalValue(pin);

    // profile_number: si viene "" -> null; si viene número -> number
    let profNorm = null;
    if (profile_number !== undefined) {
        const profStr = normalizeOptionalValue(profile_number);
        if (profStr === null) profNorm = null;
        else {
            const n = Number(profStr);
            profNorm = Number.isFinite(n) ? n : null;
        }
    } else {
        profNorm = null; // no se usará si viene undefined por COALESCE
    }

    await pool.query(
        `UPDATE platform_accounts
     SET status         = COALESCE(?, status),
         email          = COALESCE(?, email),
         password       = COALESCE(?, password),
         pin            = COALESCE(?, pin),
         profile_number = COALESCE(?, profile_number),
         expires_at     = COALESCE(?, expires_at)
     WHERE id = ?`,
        [
            status ?? null,
            email === undefined ? null : emailNorm,
            password === undefined ? null : passNorm,
            pin === undefined ? null : pinNorm,
            profile_number === undefined ? null : profNorm,
            expSql,
            id,
        ]
    );

    return { ok: true };
}

module.exports = {
    getInventory,
    exportInventoryCsv,
    patchInventory,
};
