const crypto = require("crypto");
const express = require("express");
const multer = require("multer");

const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const {
    saveSupportAttachment,
    resolveSupportAttachment,
    removeSupportAttachment,
} = require("../utils/supportAttachmentStorage");
const {
    sendSupportTicketCreatedEmails,
    sendSupportTicketResolvedEmail,
} = require("../services/mailService");
const { notifySupportTicketCreated } = require("../services/telegramBot");
const { replaceSubscriptionAccount } = require("../services/accountReplacement.service");

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 6 * 1024 * 1024 },
    fileFilter(_req, file, callback) {
        const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
        if (!allowed.has(String(file?.mimetype || "").toLowerCase())) {
            return callback(new Error("La evidencia debe ser una imagen JPG, PNG o WEBP."));
        }
        callback(null, true);
    },
});

function uploadEvidence(req, res, next) {
    upload.single("evidence")(req, res, (error) => {
        if (!error) return next();
        const tooLarge = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
        return res.status(tooLarge ? 413 : 400).json({
            message: tooLarge
                ? "La imagen supera el limite de 6 MB."
                : (error?.message || "No se pudo leer la imagen."),
        });
    });
}

function createTicketCode() {
    const date = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const random = crypto.randomBytes(3).toString("hex").toUpperCase();
    return `SOP-${date}-${random}`;
}

function mapTicket(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        ticketCode: row.ticket_code,
        subscriptionId: Number(row.subscription_id),
        userId: Number(row.user_id),
        userName: row.user_name || "",
        userEmail: row.user_email || "",
        platformId: Number(row.platform_id),
        platformName: row.platform_name || "",
        orderId: row.order_id ? Number(row.order_id) : null,
        orderCode: row.order_code || "",
        status: row.status,
        observation: row.observation,
        attachmentName: row.attachment_name,
        attachmentMime: row.attachment_mime,
        attachmentSize: Number(row.attachment_size || 0),
        attachmentUrl: `/support/tickets/${row.id}/attachment`,
        resolutionType: row.resolution_type || null,
        resolutionMessage: row.resolution_message || "",
        oldAccountId: row.old_account_id ? Number(row.old_account_id) : null,
        newAccountId: row.new_account_id ? Number(row.new_account_id) : null,
        accountEmail: row.account_email || "",
        profileNumber: row.profile_number ?? null,
        expiresAt: row.effective_expires_at || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        resolvedAt: row.resolved_at || null,
    };
}

const TICKET_SELECT = `
    SELECT st.*,
           u.name AS user_name,
           u.email AS user_email,
           p.name AS platform_name,
           pa.email AS account_email,
           pa.profile_number,
           COALESCE(pa.expires_at, s.expires_at) AS effective_expires_at
      FROM support_tickets st
      JOIN users u ON u.id = st.user_id
      JOIN platforms p ON p.id = st.platform_id
      JOIN subscriptions s ON s.id = st.subscription_id
      LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
`;

async function getTicketById(conn, ticketId, { userId = null, forUpdate = false } = {}) {
    const params = [ticketId];
    let where = "WHERE st.id = ?";
    if (userId) {
        where += " AND st.user_id = ?";
        params.push(userId);
    }
    const [rows] = await conn.query(
        `${TICKET_SELECT} ${where} LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
        params
    );
    return mapTicket(rows[0]);
}

async function deliverCreatedNotifications(ticket) {
    const results = await Promise.allSettled([
        sendSupportTicketCreatedEmails({
            ticket,
            customerName: ticket.userName,
        }),
        notifySupportTicketCreated(ticket),
    ]);
    results.forEach((result) => {
        if (result.status === "rejected") {
            console.error("[support] Notification error:", result.reason?.message || result.reason);
        }
    });
}

router.post("/support/tickets", requireAuth, uploadEvidence, async (req, res) => {
    const userId = Number(req.user.id);
    const subscriptionId = Number(req.body?.subscriptionId);
    const observation = String(req.body?.observation || "").trim();

    if (!Number.isFinite(subscriptionId) || subscriptionId <= 0) {
        return res.status(400).json({ message: "Ingresa un ID de cuenta valido." });
    }
    if (observation.length < 10 || observation.length > 2000) {
        return res.status(400).json({
            message: "La observacion debe tener entre 10 y 2000 caracteres.",
        });
    }
    if (!req.file) {
        return res.status(400).json({ message: "Adjunta una foto donde se vea el error." });
    }

    const conn = await pool.getConnection();
    let storedFile = "";
    try {
        const [subscriptions] = await conn.query(
            `SELECT s.id, s.user_id, s.platform_id, s.status,
                    o.id AS order_id, o.order_code,
                    p.name AS platform_name,
                    u.name AS user_name, u.email AS user_email,
                    COALESCE(pa.expires_at, s.expires_at) AS effective_expires_at
               FROM subscriptions s
               JOIN users u ON u.id = s.user_id
               JOIN platforms p ON p.id = s.platform_id
               LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
               LEFT JOIN order_items oi ON oi.subscription_id = s.id
               LEFT JOIN orders o ON o.id = oi.order_id
              WHERE s.id = ? AND s.user_id = ?
              ORDER BY oi.id DESC
              LIMIT 1`,
            [subscriptionId, userId]
        );
        const subscription = subscriptions[0];
        if (!subscription) {
            return res.status(404).json({
                message: "No encontramos ese ID entre tus cuentas compradas.",
            });
        }
        if (subscription.status !== "active") {
            return res.status(409).json({
                message: "Solo puedes reportar cuentas que se encuentren activas.",
            });
        }

        const [openRows] = await conn.query(
            `SELECT id, ticket_code
               FROM support_tickets
              WHERE subscription_id = ? AND user_id = ? AND status IN ('open', 'in_progress')
              ORDER BY id DESC
              LIMIT 1`,
            [subscriptionId, userId]
        );
        if (openRows.length) {
            return res.status(409).json({
                message: `Ya existe una solicitud abierta para este ID: ${openRows[0].ticket_code}.`,
                ticketId: Number(openRows[0].id),
            });
        }

        storedFile = await saveSupportAttachment(req.file);
        const ticketCode = createTicketCode();
        const [result] = await conn.query(
            `INSERT INTO support_tickets
                (ticket_code, subscription_id, user_id, platform_id, order_id, order_code,
                 observation, attachment_name, attachment_file, attachment_mime, attachment_size)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                ticketCode,
                subscriptionId,
                userId,
                subscription.platform_id,
                subscription.order_id || null,
                subscription.order_code || null,
                observation,
                String(req.file.originalname || "evidencia").slice(0, 255),
                storedFile,
                req.file.mimetype,
                req.file.size,
            ]
        );
        await conn.query(
            `INSERT INTO support_ticket_events (ticket_id, actor_user_id, event_type, message)
             VALUES (?, ?, 'created', ?)`,
            [result.insertId, userId, observation]
        );

        const ticket = await getTicketById(conn, result.insertId);
        res.status(201).json({ ok: true, ticket });
        void deliverCreatedNotifications(ticket);
    } catch (error) {
        if (storedFile) await removeSupportAttachment(storedFile).catch(() => {});
        console.error("[support] Create ticket error:", error);
        if (!res.headersSent) {
            return res.status(500).json({ message: "No se pudo crear la solicitud de soporte." });
        }
    } finally {
        conn.release();
    }
});

router.get("/support/tickets", requireAuth, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `${TICKET_SELECT}
              WHERE st.user_id = ?
              ORDER BY st.created_at DESC
              LIMIT 100`,
            [Number(req.user.id)]
        );
        return res.json({ tickets: rows.map(mapTicket) });
    } catch (error) {
        console.error("[support] User ticket list error:", error);
        return res.status(500).json({ message: "No se pudieron cargar tus solicitudes." });
    }
});

router.get("/support/tickets/:id/attachment", requireAuth, async (req, res) => {
    const ticketId = Number(req.params.id);
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
        return res.status(400).json({ message: "Caso invalido." });
    }
    try {
        const isAdmin = String(req.user.role || "").toLowerCase() === "admin";
        const params = isAdmin ? [ticketId] : [ticketId, Number(req.user.id)];
        const [rows] = await pool.query(
            `SELECT attachment_file, attachment_name, attachment_mime
               FROM support_tickets
              WHERE id = ?${isAdmin ? "" : " AND user_id = ?"}
              LIMIT 1`,
            params
        );
        if (!rows.length) return res.status(404).json({ message: "Evidencia no encontrada." });
        const ticket = rows[0];
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("Content-Type", ticket.attachment_mime);
        res.setHeader(
            "Content-Disposition",
            `inline; filename="${String(ticket.attachment_name || "evidencia").replace(/["\r\n]/g, "")}"`
        );
        return res.sendFile(resolveSupportAttachment(ticket.attachment_file));
    } catch (error) {
        console.error("[support] Attachment error:", error);
        return res.status(404).json({ message: "La evidencia ya no esta disponible." });
    }
});

router.get(
    "/admin/support-tickets",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
        const status = String(req.query.status || "pending").trim().toLowerCase();
        const search = String(req.query.q || "").trim();
        const params = [];
        const conditions = [];

        if (status === "pending") {
            conditions.push("st.status IN ('open', 'in_progress')");
        } else if (["open", "in_progress", "resolved"].includes(status)) {
            conditions.push("st.status = ?");
            params.push(status);
        }
        if (search) {
            conditions.push(
                "(st.ticket_code LIKE ? OR st.subscription_id = ? OR u.email LIKE ? OR p.name LIKE ?)"
            );
            const like = `%${search}%`;
            params.push(like, Number(search) || 0, like, like);
        }

        try {
            const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
            const [rows] = await pool.query(
                `${TICKET_SELECT} ${where} ORDER BY st.created_at DESC LIMIT 250`,
                params
            );
            return res.json({ tickets: rows.map(mapTicket) });
        } catch (error) {
            console.error("[support] Admin ticket list error:", error);
            return res.status(500).json({ message: "No se pudieron cargar las solicitudes." });
        }
    }
);

router.get(
    "/admin/support-tickets/count",
    requireAuth,
    requireRole("admin"),
    async (_req, res) => {
        try {
            const [[row]] = await pool.query(
                "SELECT COUNT(*) AS count FROM support_tickets WHERE status IN ('open', 'in_progress')"
            );
            return res.json({ count: Number(row?.count || 0) });
        } catch {
            return res.json({ count: 0 });
        }
    }
);

router.patch(
    "/admin/support-tickets/:id/start",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
        const ticketId = Number(req.params.id);
        if (!Number.isFinite(ticketId) || ticketId <= 0) {
            return res.status(400).json({ message: "Caso invalido." });
        }
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const ticket = await getTicketById(conn, ticketId, { forUpdate: true });
            if (!ticket) {
                await conn.rollback();
                return res.status(404).json({ message: "Caso no encontrado." });
            }
            if (ticket.status === "resolved") {
                await conn.rollback();
                return res.status(409).json({ message: "El caso ya fue resuelto." });
            }
            await conn.query(
                "UPDATE support_tickets SET status = 'in_progress' WHERE id = ?",
                [ticketId]
            );
            await conn.query(
                `INSERT INTO support_ticket_events (ticket_id, actor_user_id, event_type, message)
                 VALUES (?, ?, 'in_progress', 'Caso tomado por soporte')`,
                [ticketId, req.user.id]
            );
            await conn.commit();
            return res.json({ ok: true, ticket: await getTicketById(conn, ticketId) });
        } catch (error) {
            await conn.rollback().catch(() => {});
            console.error("[support] Start ticket error:", error);
            return res.status(500).json({ message: "No se pudo tomar el caso." });
        } finally {
            conn.release();
        }
    }
);

router.post(
    "/admin/support-tickets/:id/resolve",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
        const ticketId = Number(req.params.id);
        const resolutionType = String(req.body?.resolutionType || "").trim().toLowerCase();
        const resolutionMessage = String(req.body?.resolutionMessage || "").trim();
        const replacementAccountIdRaw = req.body?.replacementAccountId;
        const replacementAccountId = replacementAccountIdRaw
            ? Number(replacementAccountIdRaw)
            : null;

        if (!Number.isFinite(ticketId) || ticketId <= 0) {
            return res.status(400).json({ message: "Caso invalido." });
        }
        if (!["repaired", "replaced", "other"].includes(resolutionType)) {
            return res.status(400).json({ message: "Selecciona el resultado de la gestion." });
        }
        if (resolutionMessage.length < 10 || resolutionMessage.length > 3000) {
            return res.status(400).json({
                message: "La respuesta final debe tener entre 10 y 3000 caracteres.",
            });
        }
        if (
            replacementAccountId !== null &&
            (!Number.isFinite(replacementAccountId) || replacementAccountId <= 0)
        ) {
            return res.status(400).json({ message: "Cuenta de reemplazo invalida." });
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const current = await getTicketById(conn, ticketId, { forUpdate: true });
            if (!current) {
                await conn.rollback();
                return res.status(404).json({ message: "Caso no encontrado." });
            }
            if (current.status === "resolved") {
                await conn.rollback();
                return res.status(409).json({ message: "El caso ya fue resuelto." });
            }

            let replacement = null;
            if (resolutionType === "replaced") {
                replacement = await replaceSubscriptionAccount({
                    conn,
                    subscriptionId: current.subscriptionId,
                    replacementAccountId,
                    adminUserId: req.user.id,
                });
            }

            await conn.query(
                `UPDATE support_tickets
                    SET status = 'resolved',
                        resolution_type = ?,
                        resolution_message = ?,
                        old_account_id = ?,
                        new_account_id = ?,
                        resolved_by_user_id = ?,
                        resolved_at = NOW()
                  WHERE id = ?`,
                [
                    resolutionType,
                    resolutionMessage,
                    replacement?.oldAccountId || null,
                    replacement?.newAccountId || null,
                    req.user.id,
                    ticketId,
                ]
            );
            await conn.query(
                `INSERT INTO support_ticket_events (ticket_id, actor_user_id, event_type, message)
                 VALUES (?, ?, ?, ?)`,
                [
                    ticketId,
                    req.user.id,
                    resolutionType === "replaced" ? "replaced" : "resolved",
                    resolutionMessage,
                ]
            );
            await conn.commit();

            const ticket = await getTicketById(conn, ticketId);
            const mailResult = await sendSupportTicketResolvedEmail({
                ticket,
                customerName: ticket.userName,
            });
            return res.json({ ok: true, ticket, mail: mailResult });
        } catch (error) {
            await conn.rollback().catch(() => {});
            console.error("[support] Resolve ticket error:", error);
            return res.status(error?.status || 500).json({
                code: error?.code || undefined,
                message: error?.status ? error.message : "No se pudo cerrar el caso.",
            });
        } finally {
            conn.release();
        }
    }
);

module.exports = router;
