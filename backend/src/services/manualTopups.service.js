const pool = require("../db");
const {
    sendTopupReviewingEmail,
    sendTopupApprovedEmail,
    sendTopupRejectedEmail,
} = require("./mailService");

function mapManualTopupRow(row) {
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

function getPublicBaseUrl() {
    return String(process.env.PUBLIC_BASE_URL || "https://strbx.com.co").replace(/\/+$/, "");
}

function buildTopupProofUrl(proofFileUrl) {
    if (!proofFileUrl) return null;
    if (/^https?:\/\//i.test(String(proofFileUrl))) return proofFileUrl;
    return `${getPublicBaseUrl()}${String(proofFileUrl).startsWith("/") ? "" : "/"}${proofFileUrl}`;
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

            if (String(wallet.currency || "").toUpperCase() !== String(requestRow.currency || "").toUpperCase()) {
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
    buildTopupProofUrl,
    getManualTopupById,
    updateManualTopupStatus,
};
