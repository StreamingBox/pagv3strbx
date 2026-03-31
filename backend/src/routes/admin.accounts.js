const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { parseDateOnly } = require("../utils/date");
const {
    normalizeOptionalValue,
    normalizeProfileForAccount,
    normalizeProfileForIdentity,
} = require("../utils/normalize");

const router = express.Router();

// Helper CSV local (solo usado en este archivo para el endpoint de export)
function escapeCsv(value) {
    if (value === null || value === undefined) return "";
    const s = String(value);
    const needsQuotes = s.includes(",") || s.includes("\n") || s.includes('"');
    const escaped = s.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
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

        // ── Registrar en logs ──
        const adminEmail = req.user?.email || null;
        const adminId    = req.user?.id    || null;
        await pool.query(
            `INSERT INTO account_upload_logs
             (type, admin_id, admin_email, platform_id, platform_name, total_rows, inserted, skipped, errors, notes)
             VALUES ('manual', ?, ?, ?, ?, 1, 1, 0, 0, ?)`,
            [adminId, adminEmail, pid, pname, `Cuenta: ${emailNorm}`]
        ).catch(() => {});

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
    const { rows, filename } = req.body || {};
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
    const skippedCount = normalized.length - candidates.length;
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
        let errorsCount = 0;
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
                errorsCount++;
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

        // ── Registrar en logs ──
        const adminEmail = req.user?.email || null;
        const adminId    = req.user?.id    || null;
        // Determinar plataforma dominante del lote (la primera con pid resuelto)
        let logPid = null; let logPname = null;
        for (const r of candidates) {
            let pid = r.platformId;
            if (!pid) pid = mapByName.get(String(r.platformName || "").toLowerCase()) || null;
            if (pid) { logPid = pid; logPname = r.platformName || null; break; }
        }
        await pool.query(
            `INSERT INTO account_upload_logs
             (type, admin_id, admin_email, platform_id, platform_name, total_rows, inserted, skipped, errors, source_filename, notes)
             VALUES ('bulk', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                adminId, adminEmail,
                logPid, logPname,
                candidates.length,
                inserted,
                skippedCount,
                errorsCount,
                filename || null,
                missingPlatforms.size > 0
                    ? `Plataformas no encontradas: ${[...missingPlatforms].join(", ")}`
                    : null
            ]
        ).catch(() => {});

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
 * GET /admin/accounts/upload-logs
 * Historial de cargas de cuentas con paginación y filtros
 */
router.get("/admin/accounts/upload-logs", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page  || "1"));
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20")));
        const offset = (page - 1) * limit;
        const type   = req.query.type || "";   // 'manual' | 'bulk' | ''
        const search = req.query.search || ""; // busca por admin_email o platform_name

        const conditions = [];
        const params     = [];

        if (type === "manual" || type === "bulk") {
            conditions.push("type = ?");
            params.push(type);
        }
        if (search.trim()) {
            conditions.push("(admin_email LIKE ? OR platform_name LIKE ?)");
            params.push(`%${search.trim()}%`, `%${search.trim()}%`);
        }

        const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total FROM account_upload_logs ${where}`,
            params
        );

        const [rows] = await pool.query(
            `SELECT * FROM account_upload_logs ${where}
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return res.json({
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            items: rows,
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: "Error al obtener logs." });
    }
});

/**
 * DELETE /admin/accounts/upload-logs
 * Limpiar logs más antiguos de N días (por defecto 30)
 */
router.delete("/admin/accounts/upload-logs", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const days = Math.max(1, parseInt(req.query.days || "30"));
        const [result] = await pool.query(
            `DELETE FROM account_upload_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [days]
        );
        return res.json({ ok: true, deleted: result.affectedRows });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: "Error al limpiar logs." });
    }
});

module.exports = router;

