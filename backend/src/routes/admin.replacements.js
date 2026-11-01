const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { formatDateOnlyBogota } = require("../utils/date");

const router = express.Router();

function parseFilterDate(value) {
    if (value == null || String(value).trim() === "") return null;
    const date = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) < 1000) return undefined;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : undefined;
}

function bogotaDateStartUtc(date, dayOffset = 0) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayOffset, 5))
        .toISOString().slice(0, 19).replace("T", " ");
}

function setPrivateNoStore(res) {
    res.set("Cache-Control", "private, no-store, max-age=0");
    res.set("Pragma", "no-cache");
}

function replacementJoins() {
    return `
        LEFT JOIN users admin ON admin.id = arl.admin_user_id
        LEFT JOIN users u ON u.id = arl.user_id
        LEFT JOIN users reviewer ON reviewer.id = arl.reviewed_by_user_id
        LEFT JOIN platforms p ON p.id = arl.platform_id
        LEFT JOIN platform_accounts old_pa ON old_pa.id = arl.old_account_id
        LEFT JOIN platform_accounts new_pa ON new_pa.id = arl.new_account_id`;
}

function replacementTicketSql() {
    return `(SELECT st.ticket_code
               FROM support_tickets st
              WHERE st.subscription_id = arl.subscription_id
                AND st.old_account_id = arl.old_account_id
                AND st.new_account_id = arl.new_account_id
              ORDER BY st.id DESC
              LIMIT 1)`;
}

router.get("/admin/replacements/:id/credentials", requireAuth, requireRole("admin"), async (req, res) => {
    setPrivateNoStore(res);
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
        return res.status(400).json({ message: "ID de reemplazo inválido." });
    }

    try {
        const [rows] = await pool.query(
            `SELECT
                arl.id,
                arl.old_account_id,
                COALESCE(old_pa.email, arl.old_account_email) AS old_account_email,
                old_pa.password AS old_account_password,
                old_pa.pin AS old_account_pin,
                old_pa.profile_number AS old_account_profile_number,
                old_pa.status AS old_account_status,
                DATE(old_pa.expires_at) AS old_account_expiry,
                arl.new_account_id,
                COALESCE(new_pa.email, arl.new_account_email) AS new_account_email,
                new_pa.password AS new_account_password,
                new_pa.pin AS new_account_pin,
                new_pa.profile_number AS new_account_profile_number,
                new_pa.status AS new_account_status,
                DATE(new_pa.expires_at) AS new_account_expiry
             FROM account_replacement_logs arl
             LEFT JOIN platform_accounts old_pa ON old_pa.id = arl.old_account_id
             LEFT JOIN platform_accounts new_pa ON new_pa.id = arl.new_account_id
             WHERE arl.id = ?
             LIMIT 1`,
            [id]
        );
        if (!rows.length) return res.status(404).json({ message: "Reemplazo no encontrado." });
        return res.json({ item: rows[0] });
    } catch (error) {
        console.error("admin replacement credentials error:", error);
        return res.status(500).json({ message: "No se pudieron cargar los datos de las cuentas." });
    }
});

router.post("/admin/replacements/:id/review", requireAuth, requireRole("admin"), async (req, res) => {
    setPrivateNoStore(res);
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
        return res.status(400).json({ message: "ID de reemplazo inválido." });
    }

    try {
        await pool.query(
            `UPDATE account_replacement_logs
                SET reviewed_at = CURRENT_TIMESTAMP, reviewed_by_user_id = ?
              WHERE id = ? AND reviewed_at IS NULL`,
            [req.user.id, id]
        );
        const [rows] = await pool.query(
            `SELECT arl.id, arl.reviewed_at, arl.reviewed_by_user_id,
                    reviewer.email AS reviewer_email, reviewer.name AS reviewer_name
               FROM account_replacement_logs arl
               LEFT JOIN users reviewer ON reviewer.id = arl.reviewed_by_user_id
              WHERE arl.id = ?
              LIMIT 1`,
            [id]
        );
        if (!rows.length) return res.status(404).json({ message: "Reemplazo no encontrado." });
        return res.json({ item: rows[0] });
    } catch (error) {
        console.error("admin replacement review error:", error);
        return res.status(500).json({ message: "No se pudo archivar el reemplazo." });
    }
});

router.get("/admin/replacements", requireAuth, requireRole("admin"), async (req, res) => {
    setPrivateNoStore(res);
    try {
        const requestedPage = Number.parseInt(req.query.page || "1", 10);
        const requestedLimit = Number.parseInt(req.query.limit || "20", 10);
        const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
        const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 20;
        const offset = (page - 1) * limit;
        const q = String(req.query.q || "").trim().slice(0, 120);
        const fromDate = parseFilterDate(req.query.fromDate);
        const toDate = parseFilterDate(req.query.toDate);
        const platformValue = String(req.query.platformId || "").trim();
        const platformId = platformValue ? Number(platformValue) : null;
        const reviewState = String(req.query.reviewState || "pending").trim().toLowerCase();
        const includeCredentials = req.query.includeCredentials === "1";

        if (fromDate === undefined || toDate === undefined) {
            return res.status(400).json({ message: "Usa fechas válidas en formato AAAA-MM-DD." });
        }
        if (fromDate && toDate && fromDate > toDate) {
            return res.status(400).json({ message: "La fecha inicial no puede ser posterior a la final." });
        }
        if (platformValue && (!Number.isSafeInteger(platformId) || platformId < 1)) {
            return res.status(400).json({ message: "Selecciona una plataforma válida." });
        }
        if (!["pending", "reviewed", "all"].includes(reviewState)) {
            return res.status(400).json({ message: "Selecciona un estado de revisión válido." });
        }

        const baseWhere = [];
        const baseParams = [];

        if (q) {
            const like = `%${q}%`;
            baseWhere.push(`(
                CAST(arl.subscription_id AS CHAR) LIKE ? OR
                CAST(arl.order_id AS CHAR) LIKE ? OR
                COALESCE(arl.order_code, '') LIKE ? OR
                COALESCE(old_pa.email, arl.old_account_email, '') LIKE ? OR
                COALESCE(new_pa.email, arl.new_account_email, '') LIKE ? OR
                COALESCE(u.name, '') LIKE ? OR
                COALESCE(u.email, '') LIKE ? OR
                COALESCE(admin.email, '') LIKE ? OR
                COALESCE(admin.name, '') LIKE ? OR
                COALESCE(p.name, '') LIKE ? OR
                COALESCE(${replacementTicketSql()}, '') LIKE ?
            )`);
            baseParams.push(like, like, like, like, like, like, like, like, like, like, like);
        }
        if (fromDate) {
            baseWhere.push("arl.created_at >= ?");
            baseParams.push(bogotaDateStartUtc(fromDate));
        }
        if (toDate) {
            baseWhere.push("arl.created_at < ?");
            baseParams.push(bogotaDateStartUtc(toDate, 1));
        }
        if (platformId) {
            baseWhere.push("arl.platform_id = ?");
            baseParams.push(platformId);
        }

        const baseWhereSql = baseWhere.length ? `WHERE ${baseWhere.join(" AND ")}` : "";
        const stateWhere = reviewState === "pending"
            ? "arl.reviewed_at IS NULL"
            : reviewState === "reviewed"
                ? "arl.reviewed_at IS NOT NULL"
                : "";
        const itemWhere = [baseWhereSql ? baseWhere.join(" AND ") : "", stateWhere].filter(Boolean).join(" AND ");
        const whereSql = itemWhere ? `WHERE ${itemWhere}` : "";

        const [[countRow]] = await pool.query(
            `SELECT COUNT(*) AS total,
                    COALESCE(SUM(arl.reviewed_at IS NULL), 0) AS pending_total,
                    COALESCE(SUM(arl.reviewed_at IS NOT NULL), 0) AS reviewed_total
               FROM account_replacement_logs arl
               ${replacementJoins()}
               ${baseWhereSql}`,
            baseParams
        );
        const total = reviewState === "pending"
            ? Number(countRow?.pending_total || 0)
            : reviewState === "reviewed"
                ? Number(countRow?.reviewed_total || 0)
                : Number(countRow?.total || 0);

        const credentialColumns = includeCredentials
            ? `, old_pa.password AS old_account_password,
               old_pa.pin AS old_account_pin,
               new_pa.password AS new_account_password,
               new_pa.pin AS new_account_pin`
            : "";

        const [rows] = await pool.query(
            `SELECT
                arl.*,
                COALESCE(old_pa.email, arl.old_account_email) AS old_account_current_email,
                old_pa.profile_number AS old_account_profile_number,
                old_pa.status AS old_account_status,
                DATE(old_pa.expires_at) AS old_account_expiry,
                COALESCE(new_pa.email, arl.new_account_email) AS new_account_current_email,
                new_pa.profile_number AS new_account_profile_number,
                new_pa.status AS new_account_status,
                DATE(new_pa.expires_at) AS new_account_expiry,
                admin.email AS admin_email,
                admin.name AS admin_name,
                u.email AS user_email,
                u.name AS user_name,
                p.name AS platform_name,
                reviewer.email AS reviewer_email,
                reviewer.name AS reviewer_name,
                ${replacementTicketSql()} AS support_ticket_code
                ${credentialColumns}
            FROM account_replacement_logs arl
            ${replacementJoins()}
            ${whereSql}
            ORDER BY arl.id DESC
            LIMIT ? OFFSET ?`,
            [...baseParams, limit, offset]
        );

        const response = {
            items: rows.map((row) => ({
                ...row,
                old_account_email: row.old_account_current_email || row.old_account_email,
                new_account_email: row.new_account_current_email || row.new_account_email,
                previousExpiresLabel: row.previous_expires_at ? formatDateOnlyBogota(row.previous_expires_at) : null,
            })),
            page,
            limit,
            total,
            totalPages: Math.max(Math.ceil(total / limit), 1),
            counts: {
                pending: Number(countRow?.pending_total || 0),
                reviewed: Number(countRow?.reviewed_total || 0),
                all: Number(countRow?.total || 0),
            },
        };

        if (page === 1) {
            const [platformRows] = await pool.query(
                `SELECT DISTINCT p.id, p.name
                   FROM account_replacement_logs arl
                   JOIN platforms p ON p.id = arl.platform_id
                  ORDER BY p.name`
            );
            response.platforms = platformRows.map((platform) => ({ id: platform.id, name: platform.name }));
        }

        return res.json(response);
    } catch (error) {
        console.error("admin replacements list error:", error);
        return res.status(500).json({ message: "Error interno." });
    }
});

module.exports = router;
