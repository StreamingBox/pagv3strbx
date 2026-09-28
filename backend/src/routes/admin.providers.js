const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const {
    addCalendarDays,
    isDateOnly,
    normalizeCurrency,
} = require("../services/providerAccounts.service");
const { currentBogotaDateOnly } = require("../utils/date");

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

function buildProviderAccountHistory(accounts, logs) {
    const incomingByNewId = new Map();
    const outgoingByOldId = new Map();
    for (const log of logs || []) {
        const oldId = Number(log.oldAccountId);
        const newId = Number(log.newAccountId);
        if (!oldId || !newId) continue;
        incomingByNewId.set(newId, oldId);
        outgoingByOldId.set(oldId, newId);
    }

    return (accounts || []).map((account) => {
        const accountId = Number(account.id);
        const chainIds = [];
        const seenBackward = new Set();
        let rootId = accountId;
        while (incomingByNewId.has(rootId) && !seenBackward.has(rootId)) {
            seenBackward.add(rootId);
            rootId = incomingByNewId.get(rootId);
        }

        const seenForward = new Set();
        let currentId = rootId;
        while (currentId && !seenForward.has(currentId)) {
            seenForward.add(currentId);
            chainIds.push(currentId);
            currentId = outgoingByOldId.get(currentId) || null;
        }
        if (!chainIds.length) chainIds.push(accountId);

        const sequence = Math.max(0, chainIds.indexOf(accountId)) + 1;
        return {
            ...account,
            historyIds: chainIds,
            historyRootId: chainIds[0],
            historyPreviousId: sequence > 1 ? chainIds[sequence - 2] : null,
            historyNextId: sequence < chainIds.length ? chainIds[sequence] : null,
            historySequence: sequence,
            historyTotal: chainIds.length,
        };
    });
}

async function addProviderAccountHistory(accounts, queryable = pool) {
    if (!accounts.length) return accounts;
    const [logs] = await queryable.query(
        `SELECT old_account_id AS oldAccountId,
                new_account_id AS newAccountId
           FROM provider_account_replacement_logs
          ORDER BY id ASC`
    );
    return buildProviderAccountHistory(accounts, logs);
}

function accountPayload(body = {}) {
    const purchaseDate = String(body.purchaseDate ?? body.purchase_date ?? "").trim();
    const cardRenewalDateRaw = String(body.cardRenewalDate ?? body.card_renewal_date ?? "").trim();
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
        cardRenewalDate: cardRenewalDateRaw || null,
        ipAddress,
        amount,
        currency,
    };
}

function calculateRenewedExpiry(currentExpiry, renewalDate = currentBogotaDateOnly()) {
    const today = String(renewalDate || "").trim();
    const existingExpiry = String(currentExpiry || "").trim();
    const baseDate = isDateOnly(existingExpiry) && existingExpiry >= today ? existingExpiry : today;
    return addCalendarDays(baseDate, 30);
}
function validateAccountPayload(payload, { passwordRequired = true } = {}) {
    if (!payload.providerId) return "Selecciona un proveedor.";
    if (!payload.platformId) return "Selecciona una plataforma activa.";
    if (!payload.accountEmail) return "El correo de la cuenta es obligatorio.";
    if (passwordRequired && !payload.accountPassword) return "La contraseña de la cuenta es obligatoria.";
    if (!isDateOnly(payload.purchaseDate)) return "La fecha de compra no es válida.";
    if (!payload.expiresAt) return "No se pudo calcular la fecha de vencimiento.";
    if (payload.cardRenewalDate && !isDateOnly(payload.cardRenewalDate)) return "La fecha de renovación de tarjeta no es válida.";
    if (!payload.currency) return "La moneda debe ser COP o USD.";
    if (payload.amount === null) return "El valor debe ser un número mayor o igual a cero.";
    return null;
}

async function getProviderById(id) {
    const [rows] = await pool.query(
        `SELECT id, name, whatsapp_number AS whatsappNumber,
                code_page_url AS codePageUrl,
                code_page_username AS codePageUsername,
                notes, is_active AS isActive
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
            DATE_FORMAT(pa.purchase_date, '%Y-%m-%d') AS purchaseDate,
            DATE_FORMAT(pa.expires_at, '%Y-%m-%d') AS expiresAt,
            DATE_FORMAT(pa.card_renewal_date, '%Y-%m-%d') AS cardRenewalDate,
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
    const [account] = await addProviderAccountHistory(rows);
    return account || null;
}

router.get("/admin/providers", requireAuth, requireRole("admin"), async (_req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                p.id,
                p.name,
                p.whatsapp_number AS whatsappNumber,
                p.code_page_url AS codePageUrl,
                p.code_page_username AS codePageUsername,
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
                FROM provider_accounts pa
                JOIN platforms platform_filter ON platform_filter.id = pa.platform_id
                 AND LOWER(platform_filter.slug) LIKE 'netflix%'
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
    const whatsappNumber = cleanText(req.body?.whatsappNumber ?? req.body?.whatsapp_number, 40);
    const codePageUrl = cleanText(req.body?.codePageUrl ?? req.body?.code_page_url, 500);
    const codePageUsername = cleanText(req.body?.codePageUsername ?? req.body?.code_page_username, 190);
    const codePagePassword = String(req.body?.codePagePassword ?? req.body?.code_page_password ?? "");
    const notes = cleanText(req.body?.notes, 5000);

    if (!name) return res.status(400).json({ message: "El nombre del proveedor es obligatorio." });
    if (!codePageUrl) return res.status(400).json({ message: "La página de códigos es obligatoria." });
    if (!codePageUsername) return res.status(400).json({ message: "El usuario de la página es obligatorio." });
    if (!codePagePassword) return res.status(400).json({ message: "La contraseña de la página es obligatoria." });

    try {
        const [result] = await pool.query(
            `INSERT INTO providers (
                name, whatsapp_number, code_page_url, code_page_username,
                code_page_password, notes, is_active
             ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [name, whatsappNumber, codePageUrl, codePageUsername, codePagePassword, notes]
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
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "whatsappNumber") || Object.prototype.hasOwnProperty.call(req.body || {}, "whatsapp_number")) {
        fields.push("whatsapp_number = ?");
        params.push(cleanText(req.body.whatsappNumber ?? req.body.whatsapp_number, 40));
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "codePageUrl") || Object.prototype.hasOwnProperty.call(req.body || {}, "code_page_url")) {
        fields.push("code_page_url = ?");
        params.push(cleanText(req.body.codePageUrl ?? req.body.code_page_url, 500));
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "codePageUsername") || Object.prototype.hasOwnProperty.call(req.body || {}, "code_page_username")) {
        fields.push("code_page_username = ?");
        params.push(cleanText(req.body.codePageUsername ?? req.body.code_page_username, 190));
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "codePagePassword") || Object.prototype.hasOwnProperty.call(req.body || {}, "code_page_password")) {
        const codePagePassword = String(req.body.codePagePassword ?? req.body.code_page_password ?? "");
        if (!codePagePassword) return res.status(400).json({ message: "La contraseña de la página no puede quedar vacía." });
        fields.push("code_page_password = ?");
        params.push(codePagePassword);
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
                DATE_FORMAT(pa.purchase_date, '%Y-%m-%d') AS purchaseDate,
                DATE_FORMAT(pa.expires_at, '%Y-%m-%d') AS expiresAt,
                DATE_FORMAT(pa.card_renewal_date, '%Y-%m-%d') AS cardRenewalDate,
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
            ORDER BY pa.id DESC
        `, params);
        return res.json(await addProviderAccountHistory(rows));
    } catch (error) {
        console.error("[admin/provider-accounts] list error", error);
        return res.status(500).json({ message: "No se pudieron cargar las cuentas de proveedor." });
    }
});

router.post("/admin/provider-accounts", requireAuth, requireRole("admin"), async (req, res) => {
    const payload = accountPayload(req.body);
    const validationError = validateAccountPayload(payload, { passwordRequired: false });
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
                purchase_date, expires_at, card_renewal_date, ip_address, amount, currency, status
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
            [
                payload.providerId,
                payload.platformId,
                payload.accountEmail,
                payload.accountPassword,
                payload.purchaseDate,
                payload.expiresAt,
                payload.cardRenewalDate,
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
                    DATE_FORMAT(expires_at, '%Y-%m-%d') AS expiresAt,
                    DATE_FORMAT(card_renewal_date, '%Y-%m-%d') AS cardRenewalDate,
                    ip_address AS ipAddress, amount, currency, status
             FROM provider_accounts WHERE id = ? LIMIT 1`,
            [id]
        );
        const existing = existingRows[0];
        if (!existing) return res.status(404).json({ message: "Cuenta de proveedor no encontrada." });

        const body = req.body || {};
        const renewalRequested = body.renew === true
            || body.renew === "true"
            || String(body.action || "").trim().toLowerCase() === "renew";
        const renewalDate = currentBogotaDateOnly();
        const merged = {
            providerId: body.providerId ?? body.provider_id ?? existing.providerId,
            platformId: body.platformId ?? body.platform_id ?? existing.platformId,
            accountEmail: body.accountEmail ?? body.account_email ?? existing.accountEmail,
            accountPassword: body.accountPassword ?? body.account_password ?? existing.accountPassword,
            purchaseDate: renewalRequested
                ? renewalDate
                : (body.purchaseDate ?? body.purchase_date ?? existing.purchaseDate),
            cardRenewalDate: body.cardRenewalDate ?? body.card_renewal_date ?? existing.cardRenewalDate,
            ipAddress: body.ipAddress ?? body.ip_address ?? existing.ipAddress,
            amount: body.amount ?? existing.amount,
            currency: body.currency ?? existing.currency,
        };
        const payload = accountPayload(merged);
        if (renewalRequested) {
            payload.expiresAt = calculateRenewedExpiry(existing.expiresAt, renewalDate);
        }
        const validationError = validateAccountPayload(payload, { passwordRequired: false });
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
                purchase_date = ?, expires_at = ?, card_renewal_date = ?, ip_address = ?, amount = ?, currency = ?, status = ?
             WHERE id = ?`,
            [
                payload.providerId,
                payload.platformId,
                payload.accountEmail,
                payload.accountPassword,
                payload.purchaseDate,
                payload.expiresAt,
                payload.cardRenewalDate,
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

router.post("/admin/provider-accounts/:id/replace", requireAuth, requireRole("admin"), async (req, res) => {
    const oldAccountId = parseId(req.params.id);
    const newAccountId = parseId(req.body?.replacementAccountId ?? req.body?.newAccountId);
    const reason = cleanText(req.body?.reason, 255);
    if (!oldAccountId || !newAccountId) {
        return res.status(400).json({ message: "Selecciona una cuenta válida para el reemplazo." });
    }
    if (oldAccountId === newAccountId) {
        return res.status(400).json({ message: "La cuenta nueva debe ser diferente a la cuenta reemplazada." });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [accountRows] = await conn.query(
            `SELECT id, provider_id AS providerId, platform_id AS platformId, status
               FROM provider_accounts
              WHERE id IN (?, ?)
              FOR UPDATE`,
            [oldAccountId, newAccountId]
        );
        const oldAccount = accountRows.find((row) => Number(row.id) === oldAccountId);
        const newAccount = accountRows.find((row) => Number(row.id) === newAccountId);
        if (!oldAccount || !newAccount) {
            await conn.rollback();
            return res.status(404).json({ message: "No se encontró una de las cuentas del reemplazo." });
        }
        if (String(oldAccount.status) !== "active") {
            await conn.rollback();
            return res.status(409).json({ message: "La cuenta seleccionada ya no está activa para reemplazo." });
        }
        if (String(newAccount.status) !== "active") {
            await conn.rollback();
            return res.status(409).json({ message: "La cuenta nueva debe estar activa y disponible." });
        }
        if (Number(oldAccount.platformId) !== Number(newAccount.platformId)) {
            await conn.rollback();
            return res.status(400).json({ message: "La cuenta nueva debe pertenecer a la misma plataforma." });
        }

        const [historyRows] = await conn.query(
            `SELECT old_account_id AS oldAccountId,
                    new_account_id AS newAccountId
               FROM provider_account_replacement_logs
              WHERE old_account_id IN (?, ?)
                 OR new_account_id IN (?, ?)
              FOR UPDATE`,
            [oldAccountId, newAccountId, oldAccountId, newAccountId]
        );
        if (historyRows.some((row) => Number(row.oldAccountId) === oldAccountId)) {
            await conn.rollback();
            return res.status(409).json({ message: "La cuenta seleccionada ya tiene un reemplazo registrado." });
        }
        if (historyRows.some((row) => Number(row.newAccountId) === newAccountId)) {
            await conn.rollback();
            return res.status(409).json({ message: "La cuenta nueva ya pertenece a otro historial." });
        }

        await conn.query(
            "UPDATE provider_accounts SET status = 'inactive' WHERE id = ?",
            [oldAccountId]
        );
        await conn.query(
            `INSERT INTO provider_account_replacement_logs
                (old_account_id, new_account_id, reason, admin_user_id)
             VALUES (?, ?, ?, ?)`,
            [oldAccountId, newAccountId, reason, req.user.id]
        );
        await conn.commit();
        return res.json({
            message: `Cuenta #${oldAccountId} reemplazada por la cuenta #${newAccountId}.`,
            oldAccountId,
            newAccountId,
            account: await getAccountById(newAccountId),
        });
    } catch (error) {
        try { await conn.rollback(); } catch { /* transaction may already be closed */ }
        console.error("[admin/provider-accounts] replacement error", error);
        return res.status(500).json({ message: "No se pudo registrar el reemplazo de la cuenta." });
    } finally {
        conn.release();
    }
});

router.delete("/admin/provider-accounts/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: "Cuenta de proveedor inválida." });

    try {
        const [historyRows] = await pool.query(
            `SELECT id
               FROM provider_account_replacement_logs
              WHERE old_account_id = ? OR new_account_id = ?
              LIMIT 1`,
            [id, id]
        );
        if (historyRows.length) {
            return res.status(409).json({ message: "No se puede eliminar una cuenta que tiene historial de reemplazo." });
        }
        const [result] = await pool.query("DELETE FROM provider_accounts WHERE id = ?", [id]);
        if (!result.affectedRows) return res.status(404).json({ message: "Cuenta de proveedor no encontrada." });
        return res.json({ ok: true, deletedId: id });
    } catch (error) {
        if (String(error?.code || "").startsWith("ER_ROW_IS_REFERENCED")) {
            return res.status(409).json({ message: "No se puede eliminar esta cuenta porque tiene información relacionada." });
        }
        console.error("[admin/provider-accounts] delete error", error);
        return res.status(500).json({ message: "No se pudo eliminar la cuenta del proveedor." });
    }
});

module.exports = router;
module.exports.__testing = {
    accountPayload,
    buildProviderAccountHistory,
    calculateRenewedExpiry,
    validateAccountPayload,
};
