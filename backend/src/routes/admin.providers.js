const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const {
    addCalendarDays,
    isDateOnly,
    normalizeCurrency,
} = require("../services/providerAccounts.service");

const router = express.Router();

function parseId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function cleanText(value, maxLength = 255) {
    const text = String(value ?? "").trim();
    return text ? text.slice(0, maxLength) : null;
}

function parseBoolean(value) {
    return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
}

function parseAmount(value) {
    if (value === "" || value === null || value === undefined) return 0;
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(2)) : null;
}

function duplicateError(error) {
    return String(error?.code || "") === "ER_DUP_ENTRY";
}

function accountPayload(body = {}) {
    const purchaseDate = String(body.purchaseDate ?? body.purchase_date ?? "").trim();
    const currency = normalizeCurrency(body.currency);
    const amount = parseAmount(body.amount);
    const accountEmail = cleanText(body.accountEmail ?? body.account_email, 190);
    const accountPassword = String(body.accountPassword ?? body.account_password ?? "");
    const ipAddress = cleanText(body.ipAddress ?? body.ip_address, 64);

    return {
        providerId: parseId(body.providerId ?? body.provider_id),
        platformId: parseId(body.platformId ?? body.platform_id),
        accountEmail,
        accountPassword,
        purchaseDate,
        expiresAt: addCalendarDays(purchaseDate, 30),
        ipAddress,
        amount,
        currency,
    };
}

function validateAccountPayload(payload, { passwordRequired = true } = {}) {
    if (!payload.providerId) return "Selecciona un proveedor.";
    if (!payload.platformId) return "Selecciona una plataforma activa.";
    if (!payload.accountEmail) return "El correo de la cuenta es obligatorio.";
    if (passwordRequired && !payload.accountPassword) return "La contraseña de la cuenta es obligatoria.";
    if (!isDateOnly(payload.purchaseDate)) return "La fecha de compra no es válida.";
    if (!payload.expiresAt) return "No se pudo calcular la fecha de vencimiento.";
    if (!payload.currency) return "La moneda debe ser COP o USD.";
    if (payload.amount === null) return "El valor debe ser un número mayor o igual a cero.";
    return null;
}

async function getProviderById(id) {
    const [rows] = await pool.query(
        `SELECT id, name, contact_email AS contactEmail, notes, is_active AS isActive
           FROM providers
          WHERE id = ?
          LIMIT 1`,
        [id]
    );
    return rows[0] || null;
}

async function getAccountById(id) {
    const [rows] = await pool.query(
        `SELECT
            pa.id,
            pa.provider_id AS providerId,
            p.name AS providerName,
            pa.platform_id AS platformId,
            pl.name AS platformName,
            pl.slug AS platformSlug,
            pa.account_email AS accountEmail,
            pa.account_password AS accountPassword,
            DATE_FORMAT(pa.purchase_date, '%Y-%m-%d') AS purchaseDate,
            DATE_FORMAT(pa.expires_at, '%Y-%m-%d') AS expiresAt,
            pa.ip_address AS ipAddress,
            pa.amount,
            pa.currency,
            pa.status,
            pa.created_at AS createdAt,
            pa.updated_at AS updatedAt
         FROM provider_accounts pa
         JOIN providers p ON p.id = pa.provider_id
         JOIN platforms pl ON pl.id = pa.platform_id
        WHERE pa.id = ?
        LIMIT 1`,
        [id]
    );
    return rows[0] || null;
}

router.get("/admin/providers", requireAuth, requireRole("admin"), async (_req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                p.id,
                p.name,
                p.contact_email AS contactEmail,
                p.notes,
                p.is_active AS isActive,
                p.created_at AS createdAt,
                p.updated_at AS updatedAt,
                COALESCE(stats.accountCount, 0) AS accountCount,
                COALESCE(stats.activeAccountCount, 0) AS activeAccountCount
            FROM providers p
            LEFT JOIN (
                SELECT
                    provider_id,
                    COUNT(*) AS accountCount,
                    SUM(status = 'active') AS activeAccountCount
                FROM provider_accounts
                GROUP BY provider_id
            ) stats ON stats.provider_id = p.id
            ORDER BY p.is_active DESC, p.name ASC
        `);
        return res.json(rows);
    } catch (error) {
        console.error("[admin/providers] list error", error);
        return res.status(500).json({ message: "No se pudieron cargar los proveedores." });
    }
});

router.post("/admin/providers", requireAuth, requireRole("admin"), async (req, res) => {
    const name = cleanText(req.body?.name, 160);
    const contactEmail = cleanText(req.body?.contactEmail ?? req.body?.contact_email, 190);
    const notes = cleanText(req.body?.notes, 5000);

    if (!name) return res.status(400).json({ message: "El nombre del proveedor es obligatorio." });

    try {
        const [result] = await pool.query(
            `INSERT INTO providers (name, contact_email, notes, is_active)
             VALUES (?, ?, ?, 1)`,
            [name, contactEmail, notes]
        );
        return res.status(201).json(await getProviderById(result.insertId));
    } catch (error) {
        if (duplicateError(error)) {
            return res.status(409).json({ message: "Ya existe un proveedor con ese nombre." });
        }
        console.error("[admin/providers] create error", error);
        return res.status(500).json({ message: "No se pudo crear el proveedor." });
    }
});

router.patch("/admin/providers/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: "Proveedor inválido." });

    const fields = [];
    const params = [];
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "name")) {
        const name = cleanText(req.body.name, 160);
        if (!name) return res.status(400).json({ message: "El nombre del proveedor es obligatorio." });
        fields.push("name = ?");
        params.push(name);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "contactEmail") || Object.prototype.hasOwnProperty.call(req.body || {}, "contact_email")) {
        fields.push("contact_email = ?");
        params.push(cleanText(req.body.contactEmail ?? req.body.contact_email, 190));
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "notes")) {
        fields.push("notes = ?");
        params.push(cleanText(req.body.notes, 5000));
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "isActive") || Object.prototype.hasOwnProperty.call(req.body || {}, "is_active")) {
        fields.push("is_active = ?");
        params.push(parseBoolean(req.body.isActive ?? req.body.is_active));
    }
    if (!fields.length) return res.status(400).json({ message: "No hay cambios para guardar." });

    try {
        params.push(id);
        const [result] = await pool.query(`UPDATE providers SET ${fields.join(", ")} WHERE id = ?`, params);
        if (!result.affectedRows) return res.status(404).json({ message: "Proveedor no encontrado." });
        return res.json(await getProviderById(id));
    } catch (error) {
        if (duplicateError(error)) {
            return res.status(409).json({ message: "Ya existe un proveedor con ese nombre." });
        }
        console.error("[admin/providers] update error", error);
        return res.status(500).json({ message: "No se pudo actualizar el proveedor." });
    }
});

router.get("/admin/provider-platforms", requireAuth, requireRole("admin"), async (_req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT id, name, slug
            FROM platforms
            WHERE is_active = 1
            ORDER BY name ASC
        `);
        return res.json(rows);
    } catch (error) {
        console.error("[admin/provider-platforms] list error", error);
        return res.status(500).json({ message: "No se pudieron cargar las plataformas activas." });
    }
});

router.get("/admin/provider-accounts", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const providerId = req.query?.providerId ? parseId(req.query.providerId) : null;
        const params = [];
        const where = [];
        if (req.query?.providerId && !providerId) {
            return res.status(400).json({ message: "Proveedor inválido." });
        }
        if (providerId) {
            where.push("pa.provider_id = ?");
            params.push(providerId);
        }

        const [rows] = await pool.query(`
            SELECT
                pa.id,
                pa.provider_id AS providerId,
                p.name AS providerName,
                pa.platform_id AS platformId,
                pl.name AS platformName,
                pl.slug AS platformSlug,
                pa.account_email AS accountEmail,
                pa.account_password AS accountPassword,
                DATE_FORMAT(pa.purchase_date, '%Y-%m-%d') AS purchaseDate,
                DATE_FORMAT(pa.expires_at, '%Y-%m-%d') AS expiresAt,
                pa.ip_address AS ipAddress,
                pa.amount,
                pa.currency,
                pa.status,
                pa.created_at AS createdAt,
                pa.updated_at AS updatedAt
            FROM provider_accounts pa
            JOIN providers p ON p.id = pa.provider_id
            JOIN platforms pl ON pl.id = pa.platform_id
            ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
            ORDER BY pa.expires_at ASC, pa.id DESC
        `, params);
        return res.json(rows);
    } catch (error) {
        console.error("[admin/provider-accounts] list error", error);
        return res.status(500).json({ message: "No se pudieron cargar las cuentas de proveedor." });
    }
});

router.post("/admin/provider-accounts", requireAuth, requireRole("admin"), async (req, res) => {
    const payload = accountPayload(req.body);
    const validationError = validateAccountPayload(payload);
    if (validationError) return res.status(400).json({ message: validationError });

    try {
        const [providerRows] = await pool.query(
            "SELECT id FROM providers WHERE id = ? AND is_active = 1 LIMIT 1",
            [payload.providerId]
        );
        if (!providerRows.length) return res.status(400).json({ message: "El proveedor no existe o está inactivo." });

        const [platformRows] = await pool.query(
            "SELECT id FROM platforms WHERE id = ? AND is_active = 1 LIMIT 1",
            [payload.platformId]
        );
        if (!platformRows.length) return res.status(400).json({ message: "La plataforma debe estar activa." });

        const [result] = await pool.query(
            `INSERT INTO provider_accounts (
                provider_id, platform_id, account_email, account_password,
                purchase_date, expires_at, ip_address, amount, currency, status
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
            [
                payload.providerId,
                payload.platformId,
                payload.accountEmail,
                payload.accountPassword,
                payload.purchaseDate,
                payload.expiresAt,
                payload.ipAddress,
                payload.amount,
                payload.currency,
            ]
        );
        return res.status(201).json(await getAccountById(result.insertId));
    } catch (error) {
        console.error("[admin/provider-accounts] create error", error);
        return res.status(500).json({ message: "No se pudo crear la cuenta del proveedor." });
    }
});

router.patch("/admin/provider-accounts/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: "Cuenta de proveedor inválida." });

    try {
        const [existingRows] = await pool.query(
            `SELECT provider_id AS providerId, platform_id AS platformId,
                    account_email AS accountEmail, account_password AS accountPassword,
                    DATE_FORMAT(purchase_date, '%Y-%m-%d') AS purchaseDate,
                    ip_address AS ipAddress, amount, currency, status
             FROM provider_accounts WHERE id = ? LIMIT 1`,
            [id]
        );
        const existing = existingRows[0];
        if (!existing) return res.status(404).json({ message: "Cuenta de proveedor no encontrada." });

        const body = req.body || {};
        const merged = {
            providerId: body.providerId ?? body.provider_id ?? existing.providerId,
            platformId: body.platformId ?? body.platform_id ?? existing.platformId,
            accountEmail: body.accountEmail ?? body.account_email ?? existing.accountEmail,
            accountPassword: body.accountPassword ?? body.account_password ?? existing.accountPassword,
            purchaseDate: body.purchaseDate ?? body.purchase_date ?? existing.purchaseDate,
            ipAddress: body.ipAddress ?? body.ip_address ?? existing.ipAddress,
            amount: body.amount ?? existing.amount,
            currency: body.currency ?? existing.currency,
        };
        const payload = accountPayload(merged);
        const validationError = validateAccountPayload(payload);
        if (validationError) return res.status(400).json({ message: validationError });

        const [providerRows] = await pool.query(
            "SELECT id FROM providers WHERE id = ? AND is_active = 1 LIMIT 1",
            [payload.providerId]
        );
        if (!providerRows.length) return res.status(400).json({ message: "El proveedor no existe o está inactivo." });
        const [platformRows] = await pool.query(
            "SELECT id FROM platforms WHERE id = ? AND is_active = 1 LIMIT 1",
            [payload.platformId]
        );
        if (!platformRows.length) return res.status(400).json({ message: "La plataforma debe estar activa." });

        const status = body.status === undefined ? existing.status : (String(body.status).toLowerCase() === "inactive" ? "inactive" : "active");
        await pool.query(
            `UPDATE provider_accounts SET
                provider_id = ?, platform_id = ?, account_email = ?, account_password = ?,
                purchase_date = ?, expires_at = ?, ip_address = ?, amount = ?, currency = ?, status = ?
             WHERE id = ?`,
            [
                payload.providerId,
                payload.platformId,
                payload.accountEmail,
                payload.accountPassword,
                payload.purchaseDate,
                payload.expiresAt,
                payload.ipAddress,
                payload.amount,
                payload.currency,
                status,
                id,
            ]
        );
        return res.json(await getAccountById(id));
    } catch (error) {
        console.error("[admin/provider-accounts] update error", error);
        return res.status(500).json({ message: "No se pudo actualizar la cuenta del proveedor." });
    }
});

module.exports = router;
module.exports.__testing = {
    accountPayload,
    validateAccountPayload,
};
