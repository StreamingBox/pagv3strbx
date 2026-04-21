const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const {
    sendTopupSubmittedEmail,
    sendTopupReviewingEmail,
    sendTopupApprovedEmail,
    sendTopupRejectedEmail,
} = require("../services/mailService");

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        const allowed = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
        if (!allowed.has(String(file.mimetype || "").toLowerCase())) {
            return cb(new Error("Solo se permiten JPG, PNG, WEBP o PDF."));
        }
        cb(null, true);
    },
});

async function ensureSettingsTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
            setting_key   VARCHAR(128) PRIMARY KEY,
            setting_value TEXT         NOT NULL,
            updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
}

function getTopupConfigDefaults() {
    return {
        methodKey: "binance",
        methodLabel: "Binance",
        accountName: String(process.env.MANUAL_TOPUP_BINANCE_NAME || "SCREEN").trim(),
        binanceId: String(process.env.MANUAL_TOPUP_BINANCE_ID || "920604097").trim(),
        binanceAlias: String(process.env.MANUAL_TOPUP_BINANCE_ALIAS || "SCREEN").trim(),
        minAmount: Number(process.env.MANUAL_TOPUP_MIN_AMOUNT_USD || 10),
        currency: "USD",
        instructions: "Transfiere por Binance usando el ID o alias y luego sube el comprobante.",
    };
}

async function getTopupConfig() {
    const defaults = getTopupConfigDefaults();
    await ensureSettingsTable();
    const [rows] = await pool.query(
        `SELECT setting_key, setting_value
         FROM app_settings
         WHERE setting_key IN (?, ?, ?, ?, ?, ?, ?)`,
        [
            "topup_method_label",
            "topup_account_name",
            "topup_binance_id",
            "topup_binance_alias",
            "topup_min_amount_usd",
            "topup_currency",
            "topup_instructions",
        ]
    );

    const values = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
    return {
        methodKey: "binance",
        methodLabel: String(values.topup_method_label || defaults.methodLabel).trim(),
        accountName: String(values.topup_account_name || defaults.accountName).trim(),
        binanceId: String(values.topup_binance_id || defaults.binanceId).trim(),
        binanceAlias: String(values.topup_binance_alias || defaults.binanceAlias).trim(),
        minAmount: Number(values.topup_min_amount_usd || defaults.minAmount),
        currency: String(values.topup_currency || defaults.currency).trim().toUpperCase() || "USD",
        instructions: String(values.topup_instructions || defaults.instructions).trim(),
    };
}

function buildRequestCode() {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `REC-${stamp}-${rand}`;
}

function extFor(file) {
    const mime = String(file?.mimetype || "").toLowerCase();
    if (mime === "image/jpeg") return ".jpg";
    if (mime === "image/png") return ".png";
    if (mime === "image/webp") return ".webp";
    if (mime === "application/pdf") return ".pdf";
    return path.extname(String(file?.originalname || "")).toLowerCase() || ".bin";
}

function ensureProofDirs() {
    const frontEndBase = path.join(__dirname, "../../../frontend");
    const publicDir = path.join(frontEndBase, "public/topup-proofs");
    const distDir = path.join(frontEndBase, "dist/topup-proofs");
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
    return { publicDir, distDir };
}

function saveProofFile({ file, requestCode }) {
    const { publicDir, distDir } = ensureProofDirs();
    const filename = `${String(requestCode || "proof").toLowerCase()}${extFor(file)}`;
    const publicPath = path.join(publicDir, filename);
    const distPath = path.join(distDir, filename);
    fs.writeFileSync(publicPath, file.buffer);
    if (fs.existsSync(path.join(distDir, ".."))) {
        fs.copyFileSync(publicPath, distPath);
    }
    return `/topup-proofs/${filename}`;
}

function mapTopupRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        requestCode: row.request_code,
        userId: row.user_id,
        userEmail: row.user_email || null,
        userName: row.user_name || null,
        amount: Number(row.amount || 0),
        currency: row.currency || "USD",
        methodKey: row.method_key,
        methodLabel: row.method_label,
        proofFileUrl: row.proof_file_url,
        status: row.status,
        adminNote: row.admin_note || "",
        adminUserId: row.admin_user_id || null,
        balanceBefore: row.balance_before != null ? Number(row.balance_before) : null,
        balanceAfter: row.balance_after != null ? Number(row.balance_after) : null,
        createdAt: row.created_at,
        reviewingAt: row.reviewing_at,
        approvedAt: row.approved_at,
        rejectedAt: row.rejected_at,
        submittedEmailSentAt: row.submitted_email_sent_at,
        reviewingEmailSentAt: row.reviewing_email_sent_at,
        approvedEmailSentAt: row.approved_email_sent_at,
        rejectedEmailSentAt: row.rejected_email_sent_at,
    };
}

async function ensureWalletForUser(conn, userId, currency) {
    const [rows] = await conn.query(
        "SELECT id, balance, currency FROM wallets WHERE user_id = ? LIMIT 1 FOR UPDATE",
        [userId]
    );
    if (rows.length) {
        return {
            id: rows[0].id,
            balance: Number(rows[0].balance || 0),
            currency: String(rows[0].currency || currency || "USD").toUpperCase(),
        };
    }

    const [ins] = await conn.query(
        "INSERT INTO wallets (user_id, balance, currency) VALUES (?, 0.00, ?)",
        [userId, String(currency || "USD").toUpperCase()]
    );
    return { id: ins.insertId, balance: 0, currency: String(currency || "USD").toUpperCase() };
}

router.get("/wallet/manual-topups/config", requireAuth, async (_req, res) => {
    return res.json({ ok: true, config: await getTopupConfig() });
});

router.get("/wallet/manual-topups", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.query(
            `SELECT *
             FROM manual_topup_requests
             WHERE user_id = ?
             ORDER BY id DESC
             LIMIT 20`,
            [userId]
        );
        return res.json({ ok: true, items: rows.map(mapTopupRow) });
    } catch (err) {
        console.error("Error GET /wallet/manual-topups:", err);
        return res.status(500).json({ message: "No se pudieron cargar las recargas." });
    }
});

router.post("/wallet/manual-topups", requireAuth, upload.single("proof"), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const userId = req.user.id;
        const amount = Number(req.body?.amount || 0);
        const config = await getTopupConfig();

        const [[userRow]] = await conn.query(
            "SELECT id, name, email, currency FROM users WHERE id = ? LIMIT 1",
            [userId]
        );

        if (!userRow) {
            return res.status(404).json({ message: "Usuario no encontrado." });
        }

        if (String(userRow.currency || "").toUpperCase() !== "USD") {
            return res.status(400).json({ message: "La recarga internacional solo está habilitada para usuarios con moneda USD." });
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ message: "Ingresa un monto válido." });
        }

        if (amount < config.minAmount) {
            return res.status(400).json({ message: `La recarga mínima internacional es de ${config.minAmount} USD.` });
        }

        if (!req.file) {
            return res.status(400).json({ message: "Debes adjuntar el comprobante." });
        }

        const requestCode = buildRequestCode();
        const proofFileUrl = saveProofFile({ file: req.file, requestCode });

        await conn.beginTransaction();
        const [ins] = await conn.query(
            `INSERT INTO manual_topup_requests
                (request_code, user_id, method_key, method_label, amount, currency, proof_file_url, status)
             VALUES (?, ?, ?, ?, ?, 'USD', ?, 'submitted')`,
            [requestCode, userId, config.methodKey, config.methodLabel, amount, proofFileUrl]
        );
        await conn.commit();

        sendTopupSubmittedEmail({
            to: userRow.email,
            name: userRow.name,
            requestCode,
            amount,
            currency: "USD",
        }).then(() => {
            pool.query(
                "UPDATE manual_topup_requests SET submitted_email_sent_at = UTC_TIMESTAMP() WHERE id = ?",
                [ins.insertId]
            ).catch(() => { });
        }).catch((mailErr) => {
            console.error("[mail] sendTopupSubmittedEmail:", mailErr?.message || mailErr);
        });

        return res.json({
            ok: true,
            request: mapTopupRow({
                id: ins.insertId,
                request_code: requestCode,
                user_id: userId,
                amount,
                currency: "USD",
                method_key: config.methodKey,
                method_label: config.methodLabel,
                proof_file_url: proofFileUrl,
                status: "submitted",
                created_at: new Date().toISOString(),
            }),
        });
    } catch (err) {
        try { await conn.rollback(); } catch { }
        console.error("Error POST /wallet/manual-topups:", err);
        return res.status(500).json({ message: err?.message || "No se pudo crear la solicitud de recarga." });
    } finally {
        conn.release();
    }
});

router.get("/admin/manual-topups/config", requireAuth, requireRole("admin"), async (_req, res) => {
    try {
        return res.json({ ok: true, config: await getTopupConfig() });
    } catch (err) {
        console.error("Error GET /admin/manual-topups/config:", err);
        return res.status(500).json({ message: "No se pudo cargar la configuracion." });
    }
});

router.put("/admin/manual-topups/config", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const methodLabel = String(req.body?.methodLabel || "").trim() || "Binance";
        const accountName = String(req.body?.accountName || "").trim() || "SCREEN";
        const binanceId = String(req.body?.binanceId || "").trim();
        const binanceAlias = String(req.body?.binanceAlias || "").trim();
        const instructions = String(req.body?.instructions || "").trim();
        const currency = String(req.body?.currency || "USD").trim().toUpperCase() || "USD";
        const minAmount = Number(req.body?.minAmount || 0);

        if (!binanceId && !binanceAlias) {
            return res.status(400).json({ message: "Debes guardar al menos ID Binance o alias." });
        }
        if (!Number.isFinite(minAmount) || minAmount <= 0) {
            return res.status(400).json({ message: "El monto minimo debe ser mayor a 0." });
        }

        await ensureSettingsTable();
        const pairs = [
            ["topup_method_label", methodLabel],
            ["topup_account_name", accountName],
            ["topup_binance_id", binanceId],
            ["topup_binance_alias", binanceAlias],
            ["topup_min_amount_usd", String(minAmount)],
            ["topup_currency", currency],
            ["topup_instructions", instructions],
        ];

        for (const [key, value] of pairs) {
            await pool.query(
                `INSERT INTO app_settings (setting_key, setting_value)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
                [key, value]
            );
        }

        return res.json({ ok: true, config: await getTopupConfig() });
    } catch (err) {
        console.error("Error PUT /admin/manual-topups/config:", err);
        return res.status(500).json({ message: "No se pudo guardar la configuracion." });
    }
});

router.get("/admin/manual-topups", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { page = 1, limit = 20, status = "", q = "" } = req.query;
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
        const offset = (pageNum - 1) * limitNum;

        const where = [];
        const params = [];

        if (status) {
            where.push("m.status = ?");
            params.push(String(status).trim().toLowerCase());
        }

        if (q) {
            const like = `%${String(q).trim()}%`;
            where.push("(m.request_code LIKE ? OR u.email LIKE ? OR u.name LIKE ?)");
            params.push(like, like, like);
        }

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
        const [countRows] = await pool.query(
            `SELECT COUNT(*) AS total
             FROM manual_topup_requests m
             JOIN users u ON u.id = m.user_id
             ${whereSql}`,
            params
        );
        const total = Number(countRows[0]?.total || 0);

        const [rows] = await pool.query(
            `SELECT m.*, u.email AS user_email, u.name AS user_name
             FROM manual_topup_requests m
             JOIN users u ON u.id = m.user_id
             ${whereSql}
             ORDER BY m.id DESC
             LIMIT ? OFFSET ?`,
            [...params, limitNum, offset]
        );

        return res.json({
            ok: true,
            items: rows.map(mapTopupRow),
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.max(Math.ceil(total / limitNum), 1),
        });
    } catch (err) {
        console.error("Error GET /admin/manual-topups:", err);
        return res.status(500).json({ message: "No se pudieron cargar las solicitudes." });
    }
});

router.patch("/admin/manual-topups/:id/status", requireAuth, requireRole("admin"), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const id = Number(req.params.id);
        const status = String(req.body?.status || "").trim().toLowerCase();
        const adminNote = String(req.body?.adminNote || "").trim() || null;
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ message: "ID inválido." });
        }
        if (!["reviewing", "approved", "rejected"].includes(status)) {
            return res.status(400).json({ message: "Estado inválido." });
        }

        await conn.beginTransaction();

        const [rows] = await conn.query(
            `SELECT m.*, u.email AS user_email, u.name AS user_name, u.currency AS user_currency
             FROM manual_topup_requests m
             JOIN users u ON u.id = m.user_id
             WHERE m.id = ?
             LIMIT 1
             FOR UPDATE`,
            [id]
        );
        if (!rows.length) {
            await conn.rollback();
            return res.status(404).json({ message: "Solicitud no encontrada." });
        }

        const requestRow = rows[0];
        const currentStatus = String(requestRow.status || "").toLowerCase();
        if (["approved", "rejected"].includes(currentStatus)) {
            await conn.rollback();
            return res.status(400).json({ message: "La solicitud ya fue cerrada." });
        }

        const updateFields = [
            "status = ?",
            "admin_user_id = ?",
            "admin_note = ?",
        ];
        const updateParams = [status, req.user.id, adminNote];

        if (status === "reviewing") {
            updateFields.push("reviewing_at = UTC_TIMESTAMP()");
        }

        let wallet = null;
        if (status === "approved") {
            if (String(requestRow.user_currency || "").toUpperCase() !== "USD") {
                await conn.rollback();
                return res.status(400).json({ message: "La wallet del usuario no está en USD." });
            }

            wallet = await ensureWalletForUser(conn, requestRow.user_id, requestRow.user_currency || "USD");
            const newBalance = wallet.balance + Number(requestRow.amount || 0);

            await conn.query("UPDATE wallets SET balance = ? WHERE id = ?", [newBalance, wallet.id]);
            await conn.query(
                `INSERT INTO wallet_transactions
                    (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
                 VALUES (?, 'topup', ?, ?, 'manual_topup', ?, ?)`,
                [
                    wallet.id,
                    Number(requestRow.amount || 0),
                    newBalance,
                    id,
                    `Recarga internacional aprobada ${requestRow.request_code}`,
                ]
            );

            updateFields.push("wallet_id = ?");
            updateParams.push(wallet.id);
            updateFields.push("balance_before = ?");
            updateParams.push(wallet.balance);
            updateFields.push("balance_after = ?");
            updateParams.push(newBalance);
            updateFields.push("approved_at = UTC_TIMESTAMP()");
        }

        if (status === "rejected") {
            updateFields.push("rejected_at = UTC_TIMESTAMP()");
        }

        await conn.query(
            `UPDATE manual_topup_requests
             SET ${updateFields.join(", ")}
             WHERE id = ?`,
            [...updateParams, id]
        );

        await conn.commit();

        const mailPayload = {
            to: requestRow.user_email,
            name: requestRow.user_name,
            requestCode: requestRow.request_code,
            amount: Number(requestRow.amount || 0),
            currency: requestRow.currency || "USD",
            adminNote,
        };

        if (status === "reviewing") {
            sendTopupReviewingEmail(mailPayload).then(() => {
                pool.query(
                    "UPDATE manual_topup_requests SET reviewing_email_sent_at = UTC_TIMESTAMP() WHERE id = ?",
                    [id]
                ).catch(() => { });
            }).catch((mailErr) => console.error("[mail] sendTopupReviewingEmail:", mailErr?.message || mailErr));
        } else if (status === "approved") {
            sendTopupApprovedEmail(mailPayload).then(() => {
                pool.query(
                    "UPDATE manual_topup_requests SET approved_email_sent_at = UTC_TIMESTAMP() WHERE id = ?",
                    [id]
                ).catch(() => { });
            }).catch((mailErr) => console.error("[mail] sendTopupApprovedEmail:", mailErr?.message || mailErr));
        } else if (status === "rejected") {
            sendTopupRejectedEmail(mailPayload).then(() => {
                pool.query(
                    "UPDATE manual_topup_requests SET rejected_email_sent_at = UTC_TIMESTAMP() WHERE id = ?",
                    [id]
                ).catch(() => { });
            }).catch((mailErr) => console.error("[mail] sendTopupRejectedEmail:", mailErr?.message || mailErr));
        }

        const [freshRows] = await pool.query(
            `SELECT m.*, u.email AS user_email, u.name AS user_name
             FROM manual_topup_requests m
             JOIN users u ON u.id = m.user_id
             WHERE m.id = ?
             LIMIT 1`,
            [id]
        );

        return res.json({ ok: true, item: mapTopupRow(freshRows[0]) });
    } catch (err) {
        try { await conn.rollback(); } catch { }
        console.error("Error PATCH /admin/manual-topups/:id/status:", err);
        return res.status(500).json({ message: err?.message || "No se pudo actualizar la solicitud." });
    } finally {
        conn.release();
    }
});

module.exports = router;
