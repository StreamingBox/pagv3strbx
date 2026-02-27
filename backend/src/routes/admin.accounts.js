const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

/**
 * Helpers
 */
function escapeCsv(value) {
    if (value === null || value === undefined) return "";
    const s = String(value);
    // Escapar comillas y envolver si tiene coma o salto
    const needsQuotes = s.includes(",") || s.includes("\n") || s.includes('"');
    const escaped = s.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
}

function parseDateOnly(value) {
    // admite YYYY-MM-DD
    if (!value) return null;
    const s = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return s;
}

// ✅ Convierte valores vacíos/placeholders a null
function normalizeOptionalValue(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;
    const low = s.toLowerCase();
    if (low === "-" || low === "null" || low === "undefined" || low === "n/a") return null;
    return s;
}

// ✅ Perfil para platform_accounts: null si viene vacío
function normalizeProfileForAccount(v) {
    const s = normalizeOptionalValue(v);
    if (s === null) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

// ✅ Perfil para account_identities: si viene vacío => 1 (por compatibilidad)
function normalizeProfileForIdentity(v) {
    const s = normalizeOptionalValue(v);
    if (s === null) return 1;
    const n = Number(s);
    return Number.isFinite(n) ? n : 1;
}

/**
 * POST /admin/accounts
 * Cargar una cuenta al inventario (1x1)
 * Regla: SIEMPRE inserta un nuevo registro.
 * Luego propaga SOLO la password a cuentas active/assigned previas con mismo platform+email.
 */
router.post("/admin/accounts", requireAuth, requireRole("admin"), async (req, res) => {
    const { platformId, platformName, email, password, pin, profileNumber, expiresAt } = req.body || {};

    if (!email || !password || (!platformId && !platformName)) {
        return res
            .status(400)
            .json({ message: "platformId o platformName, email y password son obligatorios." });
    }

    const emailNorm = String(email).trim().toLowerCase();

    // ✅ identity profile siempre válido (fallback 1)
    const identityProf = normalizeProfileForIdentity(profileNumber);

    // ✅ platform_accounts profile: null si viene vacío
    const accountProf = normalizeProfileForAccount(profileNumber);

    const exp = expiresAt ? `${String(expiresAt).slice(0, 10)} 00:00:00` : null;

    // ✅ cuentas que consideras “activas / asignadas” para propagación de password
    const ACTIVE_STATUSES = ["available", "assigned"];

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 1) Resolver platformId si viene platformName
        let pid = platformId ? Number(platformId) : null;
        let pname = String(platformName || "").trim();

        if (!pid) {
            const [ps] = await conn.query(
                `SELECT id, name FROM platforms WHERE LOWER(name) = LOWER(?) LIMIT 1`,
                [pname]
            );
            if (!ps.length) {
                await conn.rollback();
                return res.status(400).json({
                    message: "platformName no existe en la tabla platforms.",
                    platformName: pname,
                });
            }
            pid = Number(ps[0].id);
            pname = ps[0].name;
        } else if (!pname) {
            const [ps] = await conn.query(`SELECT name FROM platforms WHERE id=? LIMIT 1`, [pid]);
            if (ps.length) pname = ps[0].name;
        }

        // 2) Upsert identidad (mantener compatibilidad)
        const [idRes] = await conn.query(
            `INSERT INTO account_identities (platform_id, email, profile_number, last_password, last_pin)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
            last_password=VALUES(last_password),
            last_pin=VALUES(last_pin),
            updated_at=CURRENT_TIMESTAMP`,
            [pid, emailNorm, identityProf, password, normalizeOptionalValue(pin)]
        );

        let identityId = idRes.insertId;
        if (!identityId) {
            const [ids] = await conn.query(
                `SELECT id FROM account_identities WHERE platform_id=? AND email=? AND profile_number=? LIMIT 1`,
                [pid, emailNorm, identityProf]
            );
            identityId = ids?.[0]?.id || null;
        }

        // 3) Insertar SIEMPRE nuevo registro (nuevo id)
        const [ins] = await conn.query(
            `INSERT INTO platform_accounts
       (identity_id, platform_id, platform_name, email, password, pin, profile_number, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?)`,
            [
                identityId,
                pid,
                pname || "",
                emailNorm,
                password,
                normalizeOptionalValue(pin),
                accountProf, // ✅ null si viene vacío
                exp,
            ]
        );

        const newId = ins.insertId;

        // 4) ✅ Propagar SOLO password por platform+email
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

        await conn.commit();

        return res.status(201).json({
            ok: true,
            id: newId,
            platformId: pid,
            platformName: pname,
        });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    } finally {
        conn.release();
    }
});

/**
 * POST /admin/accounts/bulk
 * Cargar cuentas en lote (Excel -> JSON desde frontend)
 * Regla: SIEMPRE inserta un nuevo registro.
 * Luego propaga SOLO la password a cuentas active/assigned previas con mismo platform+email.
 */
router.post("/admin/accounts/bulk", requireAuth, requireRole("admin"), async (req, res) => {
    const { rows } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "rows vacío." });
    }

    // 1) Normalizar filas (acepta platformId o platformName)
    const normalized = rows.map((r) => {
        const platformId = r.platformId ? Number(r.platformId) : null;
        const platformName = String(r.platformName || r.platform || r.platform_name || "").trim();

        const rawProfile = r.profileNumber ?? r.profile_number ?? r.profile ?? "";
        const profileNumber = normalizeOptionalValue(rawProfile); // ✅ string o null

        return {
            platformId,
            platformName,
            email: String(r.email || "").trim().toLowerCase(),
            password: String(r.password || "").trim(),
            pin: normalizeOptionalValue(r.pin),
            profileNumber, // ✅ ahora puede ser null
            expiresAt: String(r.expiresAt || r.expires_at || "").trim(),
        };
    });

    // 2) Validación mínima
    const candidates = normalized.filter((r) => r.email && r.password && (r.platformId || r.platformName));
    if (candidates.length === 0) {
        return res.status(400).json({
            message: "❌ No hay filas válidas (requiere platformId o platformName, email, password).",
        });
    }

    // 3) Resolver platformName -> platformId usando tabla platforms
    const needResolve = candidates.filter((r) => !r.platformId && r.platformName);
    let mapByName = new Map();

    if (needResolve.length) {
        const names = [...new Set(needResolve.map((r) => r.platformName.toLowerCase()))];
        const placeholders = names.map(() => "?").join(",");

        const [ps] = await pool.query(
            `SELECT id, name FROM platforms WHERE LOWER(name) IN (${placeholders})`,
            names
        );
        mapByName = new Map(ps.map((p) => [String(p.name).toLowerCase(), Number(p.id)]));
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const ACTIVE_STATUSES = ["available", "assigned"];

        let inserted = 0;
        const missingPlatforms = new Set();

        for (const r of candidates) {
            // ✅ perfil para identity (fallback 1), y para account (null si vacío)
            const identityProf = normalizeProfileForIdentity(r.profileNumber);
            const accountProf = normalizeProfileForAccount(r.profileNumber);

            // resolver platformId si no viene
            let pid = r.platformId;
            if (!pid) pid = mapByName.get(String(r.platformName).toLowerCase()) || null;

            if (!pid) {
                missingPlatforms.add(r.platformName || "(vacío)");
                continue;
            }

            const exp = r.expiresAt ? `${String(r.expiresAt).slice(0, 10)} 00:00:00` : null;

            // 4.1 Upsert identidad
            const [idRes] = await conn.query(
                `INSERT INTO account_identities (platform_id, email, profile_number, last_password, last_pin)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
              last_password=VALUES(last_password),
              last_pin=VALUES(last_pin),
              updated_at=CURRENT_TIMESTAMP`,
                [pid, r.email, identityProf, r.password, r.pin]
            );

            let identityId = idRes.insertId;
            if (!identityId) {
                const [ids] = await conn.query(
                    `SELECT id FROM account_identities WHERE platform_id=? AND email=? AND profile_number=? LIMIT 1`,
                    [pid, r.email, identityProf]
                );
                identityId = ids?.[0]?.id || null;
            }

            // 4.2 Insertar SIEMPRE nueva fila inventario
            const [insAcc] = await conn.query(
                `INSERT INTO platform_accounts
         (identity_id, platform_id, platform_name, email, password, pin, profile_number, status, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?)`,
                [
                    identityId || null,
                    pid,
                    r.platformName || "",
                    r.email,
                    r.password,
                    r.pin,
                    accountProf, // ✅ null si no viene perfil
                    exp,
                ]
            );

            const newId = insAcc.insertId;

            // 4.3 ✅ Propagar SOLO password por platform+email
            await conn.query(
                `UPDATE platform_accounts
         SET password = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE platform_id = ?
           AND LOWER(email) = LOWER(?)
           AND status IN (${ACTIVE_STATUSES.map(() => "?").join(",")})
           AND id <> ?`,
                [r.password, pid, r.email, ...ACTIVE_STATUSES, newId]
            );

            inserted += 1;
        }

        await conn.commit();

        const missing = [...missingPlatforms].slice(0, 20);
        if (inserted === 0) {
            return res.status(400).json({
                message: "No se insertó ninguna fila. Revisa que platformName exista en platforms o envía platformId.",
                missingPlatforms: missing,
            });
        }

        return res.json({ ok: true, inserted, warning_missing_platforms: missing });
    } catch (e) {
        await conn.rollback();
        console.error(e);
        return res.status(500).json({ message: "Error en carga masiva." });
    } finally {
        conn.release();
    }
});

/**
 * GET /admin/inventory
 * Listado de inventario con filtros:
 *  - platformId
 *  - status: available | assigned | sold  (sold se mapea a assigned/sold)
 *  - q: búsqueda por email o plataforma
 *  - expiresFrom: YYYY-MM-DD
 *  - expiresTo: YYYY-MM-DD
 *  - limit
 */
router.get("/admin/inventory", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { platformId, status, q, limit, expiresFrom, expiresTo } = req.query;

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
                // ignorar
            }
        }

        if (q) {
            where.push("(pa.email LIKE ? OR pa.platform_name LIKE ? OR p.name LIKE ? OR u.email LIKE ?)");
            params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
        }

        const from = parseDateOnly(expiresFrom);
        const to = parseDateOnly(expiresTo);

        if (from) {
            where.push("DATE(pa.expires_at) >= ?");
            params.push(from);
        }
        if (to) {
            where.push("DATE(pa.expires_at) <= ?");
            params.push(to);
        }

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
        const lim = Math.min(Math.max(parseInt(limit || "200", 10), 1), 2000);

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
        pa.created_at,
        pa.updated_at
      FROM platform_accounts pa
      LEFT JOIN platforms p ON p.id = pa.platform_id
      LEFT JOIN users u ON u.id = pa.assigned_to_user_id
      ${whereSql}
      ORDER BY pa.expires_at DESC, pa.id DESC
      LIMIT ${lim}`,
            params
        );

        const mapped = rows.map((r) => ({
            ...r,
            platform_name: r.platform_name_ref || r.platform_name_raw || "",
            sold_like: ["assigned", "sold"].includes(String(r.status || "")),
        }));

        return res.json(mapped);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

/**
 * GET /admin/inventory/export
 * Export CSV del inventario usando los mismos filtros de /admin/inventory
 * Query:
 *  - platformId, status, q, expiresFrom, expiresTo
 */
router.get("/admin/inventory/export", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { platformId, status, q, expiresFrom, expiresTo } = req.query;

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
            }
        }

        if (q) {
            where.push("(pa.email LIKE ? OR pa.platform_name LIKE ? OR p.name LIKE ? OR u.email LIKE ?)");
            params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
        }

        const from = parseDateOnly(expiresFrom);
        const to = parseDateOnly(expiresTo);

        if (from) {
            where.push("DATE(pa.expires_at) >= ?");
            params.push(from);
        }
        if (to) {
            where.push("DATE(pa.expires_at) <= ?");
            params.push(to);
        }

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

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
        pa.expires_at
      FROM platform_accounts pa
      LEFT JOIN platforms p ON p.id = pa.platform_id
      LEFT JOIN users u ON u.id = pa.assigned_to_user_id
      ${whereSql}
      ORDER BY pa.expires_at DESC, pa.id DESC`,
            params
        );

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="inventario.csv"`);

        const header = [
            "id",
            "platform",
            "email",
            "password",
            "pin",
            "profile_number",
            "status",
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
                escapeCsv(r.assigned_user_email || ""),
                escapeCsv(r.expires_at ? String(r.expires_at).slice(0, 10) : ""),
            ].join(",")
        );

        return res.send([header, ...lines].join("\n"));
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error exportando CSV." });
    }
});

/**
 * PATCH /admin/inventory/:id
 * Permite:
 *  - cambiar status (available/assigned/sold)
 *  - actualizar email/password/pin/profile_number/expires_at
 *  - (opcional) resetear asignación
 */
router.patch("/admin/inventory/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { id } = req.params;
        const { status, email, password, pin, profile_number, reset_assign, expires_at, expiresAt } = req.body || {};

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
            return res.json({ ok: true, reset: true });
        }

        const exp = parseDateOnly(expiresAt) || parseDateOnly(expires_at);

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
                email ?? null,
                password ?? null,
                pin ?? null,
                profile_number ?? null,
                exp ? `${exp} 00:00:00` : null,
                id,
            ]
        );

        return res.json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

module.exports = router;
