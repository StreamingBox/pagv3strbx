const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const pool = require("../db");
const {
    sendTopupReviewingEmail,
    sendTopupApprovedEmail,
    sendTopupRejectedEmail,
} = require("./mailService");
const {
    sanitizeAdminNote,
    sanitizeMatchedSenderName,
} = require("../utils/manualTopupText");
const { normalizeCurrency, sameCurrency } = require("../utils/currency");

const PROOF_TOKEN_TTL_MINUTES = 10;

function mapManualTopupRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        requestCode: row.request_code,
        userId: row.user_id,
        userEmail: row.user_email || null,
        userName: row.user_name || null,
        amount: Number(row.amount || 0),
        currency: normalizeCurrency(row.currency || "USD", "USD"),
        methodKey: row.method_key,
        methodLabel: row.method_label,
        proofFileUrl: row.proof_file_url,
        payerName: row.payer_name || "",
        declaredPaidAt: row.declared_paid_at,
        status: row.status,
        adminNote: sanitizeAdminNote(row.admin_note || ""),
        autoValidationStatus: row.auto_validation_status || "pending",
        autoValidationNote: row.auto_validation_note || "",
        lastAutoCheckedAt: row.last_auto_checked_at,
        matchedEmailUid: row.matched_email_uid || null,
        matchedEmailSubject: row.matched_email_subject || null,
        matchedSenderName: sanitizeMatchedSenderName(row.matched_sender_name || "") || null,
        matchedEmailAmount: row.matched_email_amount != null ? Number(row.matched_email_amount) : null,
        matchedEmailReceivedAt: row.matched_email_received_at || null,
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

function sanitizeManualTopupForClient(rowOrItem) {
    const item = rowOrItem?.requestCode ? rowOrItem : mapManualTopupRow(rowOrItem);
    if (!item) return null;
    const { proofFileUrl, ...rest } = item;
    return {
        ...rest,
        hasProof: Boolean(proofFileUrl),
    };
}

async function ensureWalletForUser(conn, userId, currency) {
    const targetCurrency = normalizeCurrency(currency || "USD", "USD");
    const [rows] = await conn.query(
        "SELECT id, balance, currency FROM wallets WHERE user_id = ? LIMIT 1 FOR UPDATE",
        [userId]
    );
    if (rows.length) {
        const currentCurrency = normalizeCurrency(rows[0].currency || targetCurrency, targetCurrency);
        if (!sameCurrency(currentCurrency, targetCurrency)) {
            await conn.query("UPDATE wallets SET currency = ? WHERE id = ?", [targetCurrency, rows[0].id]);
        }
        return {
            id: rows[0].id,
            balance: Number(rows[0].balance || 0),
            currency: targetCurrency,
        };
    }

    const [ins] = await conn.query(
        "INSERT INTO wallets (user_id, balance, currency) VALUES (?, 0.00, ?)",
        [userId, targetCurrency]
    );
    return { id: ins.insertId, balance: 0, currency: targetCurrency };
}

function getPublicBaseUrl() {
    return String(process.env.PUBLIC_BASE_URL || "https://strbx.com.co").replace(/\/+$/, "");
}

function getProofStoragePath(proofFileUrl) {
    const raw = String(proofFileUrl || "").trim();
    if (!raw) return null;
    const filename = path.basename(raw);
    const candidates = [
        path.join(__dirname, "../../../frontend/public/topup-proofs", filename),
        path.join(__dirname, "../../../frontend/dist/topup-proofs", filename),
        path.join(__dirname, "../../frontend/public/topup-proofs", filename),
        path.join(__dirname, "../../frontend/dist/topup-proofs", filename),
    ];
    for (const filePath of candidates) {
        if (fs.existsSync(filePath)) return filePath;
    }
    return null;
}

function getProofContentType(filePath) {
    const ext = String(path.extname(filePath || "")).toLowerCase();
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    if (ext === ".png") return "image/png";
    if (ext === ".webp") return "image/webp";
    if (ext === ".pdf") return "application/pdf";
    return "application/octet-stream";
}

async function cleanupManualTopupProofTokens() {
    await pool.query(
        "DELETE FROM manual_topup_proof_tokens WHERE revoked_at IS NOT NULL OR expires_at <= UTC_TIMESTAMP()"
    );
}

async function createManualTopupProofToken({ topupId, proofFileUrl, actorUserId = null, actorRole = null }) {
    if (!proofFileUrl) return null;
    await cleanupManualTopupProofTokens();
    const token = crypto.randomUUID();
    await pool.query(
        `INSERT INTO manual_topup_proof_tokens
            (token, topup_id, proof_file_url, created_by_user_id, created_by_role, expires_at)
         VALUES (?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))`,
        [token, topupId, proofFileUrl, actorUserId, actorRole, PROOF_TOKEN_TTL_MINUTES]
    );
    return {
        token,
        viewerUrl: `${getPublicBaseUrl()}/api/topup-proofs/view/${token}`,
    };
}

async function getManualTopupProofAccess(token) {
    const safeToken = String(token || "").trim();
    if (!safeToken) return null;
    const [rows] = await pool.query(
        `SELECT token, topup_id, proof_file_url, opened_at, revoked_at, expires_at
         FROM manual_topup_proof_tokens
         WHERE token = ?
           AND revoked_at IS NULL
           AND expires_at > UTC_TIMESTAMP()
         LIMIT 1`,
        [safeToken]
    );
    if (!rows.length) return null;
    const row = rows[0];
    const filePath = getProofStoragePath(row.proof_file_url);
    if (!filePath) return null;
    return {
        token: row.token,
        topupId: row.topup_id,
        proofFileUrl: row.proof_file_url,
        filePath,
        contentType: getProofContentType(filePath),
    };
}

async function markManualTopupProofTokenOpened(token) {
    await pool.query(
        "UPDATE manual_topup_proof_tokens SET opened_at = COALESCE(opened_at, UTC_TIMESTAMP()) WHERE token = ?",
        [String(token || "").trim()]
    );
}

async function revokeManualTopupProofToken(token) {
    await pool.query(
        "UPDATE manual_topup_proof_tokens SET revoked_at = UTC_TIMESTAMP() WHERE token = ? AND revoked_at IS NULL",
        [String(token || "").trim()]
    );
}

function buildTopupProofUrl(proofFileUrl, topupId) {
    if (!proofFileUrl || !topupId) return null;
    return createManualTopupProofToken({
        topupId: Number(topupId),
        proofFileUrl,
        actorRole: "telegram",
    }).then((tokenInfo) => tokenInfo?.viewerUrl || null);
}

async function getManualTopupById(id, conn = pool) {
    const [rows] = await conn.query(
        `SELECT m.*, u.email AS user_email, u.name AS user_name
         FROM manual_topup_requests m
         JOIN users u ON u.id = m.user_id
         WHERE m.id = ?
         LIMIT 1`,
        [id]
    );
    return mapManualTopupRow(rows[0]);
}

async function updateManualTopupStatus({ id, status, adminUserId = null, adminNote = null }) {
    const conn = await pool.getConnection();
    try {
        const normalizedStatus = String(status || "").trim().toLowerCase();
        const note = String(adminNote || "").trim() || null;
        if (!Number.isFinite(Number(id)) || Number(id) <= 0) {
            throw new Error("ID invalido.");
        }
        if (!["reviewing", "approved", "rejected"].includes(normalizedStatus)) {
            throw new Error("Estado invalido.");
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
            throw new Error("Solicitud no encontrada.");
        }

        const requestRow = rows[0];
        const currentStatus = String(requestRow.status || "").toLowerCase();
        if (["approved", "rejected"].includes(currentStatus)) {
            throw new Error("La solicitud ya fue cerrada.");
        }

        const updateFields = ["status = ?", "admin_user_id = ?", "admin_note = ?"];
        const updateParams = [normalizedStatus, adminUserId, note];

        if (normalizedStatus === "reviewing") {
            updateFields.push("reviewing_at = UTC_TIMESTAMP()");
        }

        if (normalizedStatus === "approved") {
            const wallet = await ensureWalletForUser(
                conn,
                requestRow.user_id,
                requestRow.user_currency || requestRow.currency || "COP"
            );

            if (!sameCurrency(wallet.currency, requestRow.currency)) {
                throw new Error(`La wallet del usuario esta en ${wallet.currency} y la solicitud esta en ${requestRow.currency}.`);
            }

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
                    `Recarga manual aprobada ${requestRow.request_code} (${requestRow.method_label})`,
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

        if (normalizedStatus === "rejected") {
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
            currency: requestRow.currency || "COP",
            adminNote: note,
        };

        if (normalizedStatus === "reviewing") {
            sendTopupReviewingEmail(mailPayload).then(() => {
                pool.query(
                    "UPDATE manual_topup_requests SET reviewing_email_sent_at = UTC_TIMESTAMP() WHERE id = ?",
                    [id]
                ).catch(() => { });
            }).catch((mailErr) => console.error("[mail] sendTopupReviewingEmail:", mailErr?.message || mailErr));
        } else if (normalizedStatus === "approved") {
            sendTopupApprovedEmail(mailPayload).then(() => {
                pool.query(
                    "UPDATE manual_topup_requests SET approved_email_sent_at = UTC_TIMESTAMP() WHERE id = ?",
                    [id]
                ).catch(() => { });
            }).catch((mailErr) => console.error("[mail] sendTopupApprovedEmail:", mailErr?.message || mailErr));
        } else if (normalizedStatus === "rejected") {
            sendTopupRejectedEmail(mailPayload).then(() => {
                pool.query(
                    "UPDATE manual_topup_requests SET rejected_email_sent_at = UTC_TIMESTAMP() WHERE id = ?",
                    [id]
                ).catch(() => { });
            }).catch((mailErr) => console.error("[mail] sendTopupRejectedEmail:", mailErr?.message || mailErr));
        }

        return getManualTopupById(id);
    } catch (err) {
        try { await conn.rollback(); } catch { }
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = {
    mapManualTopupRow,
    sanitizeManualTopupForClient,
    buildTopupProofUrl,
    createManualTopupProofToken,
    getManualTopupProofAccess,
    markManualTopupProofTokenOpened,
    revokeManualTopupProofToken,
    getManualTopupById,
    updateManualTopupStatus,
};
