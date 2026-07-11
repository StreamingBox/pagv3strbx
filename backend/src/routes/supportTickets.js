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
const { enqueueNotification } = require("../services/notificationOutbox.service");
const { replaceSubscriptionAccount } = require("../services/accountReplacement.service");
const { assertActiveSupportSubscription } = require("../services/supportSubscriptionEligibility.service");
const { findInactiveMasterForSubscription } = require("../services/masterAccounts.service");
const { insertCredentialLinkWithRetry } = require("../utils/tokens");
const {
    appendReplacementCredentialsMessage,
    buildReplacementCredentialsMessage,
} = require("../utils/supportReplacementMessage");

const router = express.Router();
const REOPEN_WINDOW_MS = 24 * 60 * 60 * 1000;

const RESOLUTION_SUBTYPE_LABELS = {
    password_updated: "Clave actualizada",
    login_approved: "Inicio aprobado",
    payment_issue_fixed: "Pago o bloqueo corregido",
    usage_guidance_sent: "Instrucciones enviadas",
    account_unlocked: "Cuenta desbloqueada",
    account_replaced: "Cuenta reemplazada",
    profile_reassigned: "Perfil reasignado",
    stock_replacement: "Reemplazo con stock",
    user_error: "Error de uso del cliente",
    warranty_denied: "Garantia no aplica",
    duplicate_request: "Solicitud duplicada",
    no_response_needed: "Sin accion adicional",
    other_solution: "Otro cierre",
};

const SUPPORT_EVENT_LABELS = {
    created: "Caso creado",
    in_progress: "En revision",
    resolved: "Caso resuelto",
    replaced: "Cuenta reemplazada",
    reopened: "Caso reabierto",
    auto_replaced: "Reemplazo automatico",
    auto_no_stock: "Sin stock automatico",
};

function normalizeResolutionSubtype(value) {
    const clean = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_/-]/g, "_").slice(0, 64);
    if (!clean) return null;
    return clean;
}

function resolutionSubtypeLabel(value) {
    return RESOLUTION_SUBTYPE_LABELS[value] || value || "";
}

function minutesBetween(start, end) {
    if (!start || !end) return null;
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return null;
    return Math.round((endMs - startMs) / 60000);
}

function mapEvent(row) {
    return {
        id: Number(row.id),
        type: row.event_type,
        label: SUPPORT_EVENT_LABELS[row.event_type] || row.event_type,
        message: row.message || "",
        actorUserId: row.actor_user_id ? Number(row.actor_user_id) : null,
        actorName: row.actor_name || "",
        actorEmail: row.actor_email || "",
        createdAt: row.created_at,
    };
}

function mapTemplate(row) {
    return {
        id: Number(row.id),
        title: row.title,
        resolutionType: row.resolution_type,
        resolutionSubtype: row.resolution_subtype || "",
        resolutionSubtypeLabel: resolutionSubtypeLabel(row.resolution_subtype),
        body: row.body || "",
        isActive: Number(row.is_active) === 1,
        sortOrder: Number(row.sort_order || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function getReopenUntil(value) {
    if (!value) return null;
    const closedAt = new Date(value);
    if (Number.isNaN(closedAt.getTime())) return null;
    return new Date(closedAt.getTime() + REOPEN_WINDOW_MS).toISOString();
}

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
    const reopenUntil = getReopenUntil(row.resolved_at);
    const canReopen = row.status === "resolved" && reopenUntil
        ? new Date(reopenUntil).getTime() > Date.now()
        : false;
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
        resolutionSubtype: row.resolution_subtype || null,
        resolutionSubtypeLabel: resolutionSubtypeLabel(row.resolution_subtype),
        resolutionMessage: row.resolution_message || "",
        oldAccountId: row.old_account_id ? Number(row.old_account_id) : null,
        newAccountId: row.new_account_id ? Number(row.new_account_id) : null,
        accountId: row.account_id ? Number(row.account_id) : null,
        accountEmail: row.account_email || "",
        accountStatus: row.account_status || "",
        profileNumber: row.profile_number ?? null,
        expiresAt: row.effective_expires_at || null,
        resolvedByName: row.resolved_by_name || "",
        resolvedByEmail: row.resolved_by_email || "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        resolvedAt: row.resolved_at || null,
        reopenUntil,
        canReopen,
    };
}

const TICKET_SELECT = `
    SELECT st.*,
           u.name AS user_name,
           u.email AS user_email,
            p.name AS platform_name,
            resolver.name AS resolved_by_name,
            resolver.email AS resolved_by_email,
            pa.id AS account_id,
            pa.email AS account_email,
            pa.status AS account_status,
            pa.profile_number,
            s.expires_at AS effective_expires_at
       FROM support_tickets st
       JOIN users u ON u.id = st.user_id
       JOIN platforms p ON p.id = st.platform_id
       JOIN subscriptions s ON s.id = st.subscription_id
       LEFT JOIN users resolver ON resolver.id = st.resolved_by_user_id
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

async function queueCreatedNotifications(conn, ticket, { masterAccount = null, noStock = false, eventKey = "created" } = {}) {
    await enqueueNotification(conn, {
        channel: "email",
        eventType: "support_created",
        dedupeKey: `support-${eventKey}-email:${ticket.id}`,
        payload: { ticket, customerName: ticket.userName },
    });
    await enqueueNotification(conn, {
        channel: "telegram",
        eventType: "support_created",
        dedupeKey: `support-${eventKey}-telegram:${ticket.id}`,
        payload: { ticket },
    });
    if (noStock) {
        await enqueueNotification(conn, {
            channel: "telegram",
            eventType: "support_no_stock",
            dedupeKey: `support-no-stock:${ticket.id}`,
            payload: { ticket, masterAccount },
        });
    }
}

async function queueResolvedNotification(conn, ticket) {
    await enqueueNotification(conn, {
        channel: "email",
        eventType: "support_resolved",
        dedupeKey: `support-resolved:${ticket.id}`,
        payload: { ticket, customerName: ticket.userName },
    });
}

async function getActiveCredentialToken(conn, { subscriptionId, createdByUserId = null }) {
    const [rows] = await conn.query(
        `SELECT token
           FROM credential_links
          WHERE subscription_id = ?
            AND revoked_at IS NULL
          ORDER BY id DESC
          LIMIT 1`,
        [subscriptionId]
    );
    if (rows?.[0]?.token) return rows[0].token;
    return insertCredentialLinkWithRetry(conn, { subscriptionId, createdByUserId });
}

async function buildReplacementResolutionMessage(conn, {
    ticket,
    replacement,
    resolutionMessage,
    createdByUserId = null,
}) {
    const token = await getActiveCredentialToken(conn, {
        subscriptionId: ticket.subscriptionId,
        createdByUserId,
    });
    const credentials = buildReplacementCredentialsMessage({
        orderCode: ticket.orderCode || (ticket.orderId ? `#${ticket.orderId}` : "-"),
        subscriptionId: ticket.subscriptionId,
        platformName: ticket.platformName,
        account: replacement?.newAccount,
        expiresAt: ticket.expiresAt,
        token,
        baseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:3000",
    });
    return appendReplacementCredentialsMessage(resolutionMessage, credentials);
}

function buildInClause(values) {
    const unique = [...new Set(values.map(Number).filter((value) => Number.isFinite(value) && value > 0))];
    return {
        values: unique,
        placeholders: unique.map(() => "?").join(", "),
    };
}

async function getSupportEvents(ticketId) {
    const [rows] = await pool.query(
        `SELECT ste.id,
                ste.ticket_id,
                ste.actor_user_id,
                ste.event_type,
                ste.message,
                ste.created_at,
                u.name AS actor_name,
                u.email AS actor_email
           FROM support_ticket_events ste
           LEFT JOIN users u ON u.id = ste.actor_user_id
          WHERE ste.ticket_id = ?
          ORDER BY ste.created_at ASC, ste.id ASC`,
        [ticketId]
    );
    return rows.map(mapEvent);
}

async function getAccountTrace(ticket) {
    const accountIds = buildInClause([ticket.accountId, ticket.oldAccountId, ticket.newAccountId]);
    const accountCondition = accountIds.values.length ? ` OR s.platform_account_id IN (${accountIds.placeholders})` : "";
    const replacementCondition = accountIds.values.length
        ? ` OR arl.old_account_id IN (${accountIds.placeholders}) OR arl.new_account_id IN (${accountIds.placeholders})`
        : "";
    const renewalCondition = accountIds.values.length
        ? ` OR srl.previous_account_id IN (${accountIds.placeholders}) OR srl.new_account_id IN (${accountIds.placeholders})`
        : "";
    const deliveryCondition = accountIds.values.length ? ` OR cd.platform_account_id IN (${accountIds.placeholders})` : "";
    const relatedTicketCondition = accountIds.values.length
        ? ` OR st.old_account_id IN (${accountIds.placeholders}) OR st.new_account_id IN (${accountIds.placeholders})`
        : "";

    const [salesRows, replacementRows, renewalRows, deliveryRows, relatedRows] = await Promise.all([
        pool.query(
            `SELECT s.id AS subscription_id,
                    s.status,
                    s.expires_at,
                    s.created_at,
                    s.updated_at,
                    o.order_code,
                    u.email AS buyer_email,
                    p.name AS platform_name,
                    pa.id AS account_id,
                    pa.email AS account_email,
                    pa.profile_number
               FROM subscriptions s
               JOIN users u ON u.id = s.user_id
               JOIN platforms p ON p.id = s.platform_id
               LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
               LEFT JOIN order_items oi ON oi.subscription_id = s.id
               LEFT JOIN orders o ON o.id = oi.order_id
              WHERE s.id = ?${accountCondition}
              ORDER BY s.created_at DESC, s.id DESC
              LIMIT 30`,
            [ticket.subscriptionId, ...accountIds.values]
        ),
        pool.query(
            `SELECT arl.id,
                    arl.subscription_id,
                    arl.order_code,
                    arl.old_account_id,
                    arl.old_account_email,
                    arl.new_account_id,
                    arl.new_account_email,
                    arl.previous_expires_at,
                    arl.created_at,
                    admin.email AS admin_email
               FROM account_replacement_logs arl
               LEFT JOIN users admin ON admin.id = arl.admin_user_id
              WHERE arl.subscription_id = ?${replacementCondition}
              ORDER BY arl.created_at DESC, arl.id DESC
              LIMIT 30`,
            [ticket.subscriptionId, ...accountIds.values, ...accountIds.values]
        ),
        pool.query(
            `SELECT srl.id,
                    srl.subscription_id,
                    srl.previous_order_code,
                    srl.renewal_order_code,
                    srl.previous_account_id,
                    srl.new_account_id,
                    srl.previous_expires_at,
                    srl.new_expires_at,
                    srl.amount_charged,
                    srl.currency,
                    srl.actor_role,
                    srl.created_at,
                    actor.email AS actor_email
               FROM subscription_renewal_logs srl
               LEFT JOIN users actor ON actor.id = srl.actor_user_id
              WHERE srl.subscription_id = ?${renewalCondition}
              ORDER BY srl.created_at DESC, srl.id DESC
              LIMIT 30`,
            [ticket.subscriptionId, ...accountIds.values, ...accountIds.values]
        ),
        pool.query(
            `SELECT cd.id,
                    cd.order_id,
                    cd.platform_slug,
                    cd.platform_account_id,
                    cd.status,
                    cd.message,
                    cd.created_at,
                    requester.email AS requester_email
               FROM code_deliveries cd
               LEFT JOIN users requester ON requester.id = cd.requested_by_user_id
              WHERE cd.order_id = ?${deliveryCondition}
              ORDER BY cd.created_at DESC, cd.id DESC
              LIMIT 30`,
            [ticket.subscriptionId, ...accountIds.values]
        ),
        pool.query(
            `${TICKET_SELECT}
              WHERE st.id <> ?
                AND (st.subscription_id = ?${relatedTicketCondition})
              ORDER BY st.created_at DESC, st.id DESC
              LIMIT 20`,
            [ticket.id, ticket.subscriptionId, ...accountIds.values, ...accountIds.values]
        ),
    ]);

    return {
        sales: salesRows[0].map((row) => ({
            subscriptionId: Number(row.subscription_id),
            status: row.status,
            orderCode: row.order_code || "",
            buyerEmail: row.buyer_email || "",
            platformName: row.platform_name || "",
            accountId: row.account_id ? Number(row.account_id) : null,
            accountEmail: row.account_email || "",
            profileNumber: row.profile_number ?? null,
            expiresAt: row.expires_at || null,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        })),
        replacements: replacementRows[0].map((row) => ({
            id: Number(row.id),
            subscriptionId: Number(row.subscription_id),
            orderCode: row.order_code || "",
            oldAccountId: row.old_account_id ? Number(row.old_account_id) : null,
            oldAccountEmail: row.old_account_email || "",
            newAccountId: row.new_account_id ? Number(row.new_account_id) : null,
            newAccountEmail: row.new_account_email || "",
            previousExpiresAt: row.previous_expires_at || null,
            adminEmail: row.admin_email || "",
            createdAt: row.created_at,
        })),
        renewals: renewalRows[0].map((row) => ({
            id: Number(row.id),
            subscriptionId: Number(row.subscription_id),
            previousOrderCode: row.previous_order_code || "",
            renewalOrderCode: row.renewal_order_code || "",
            previousAccountId: row.previous_account_id ? Number(row.previous_account_id) : null,
            newAccountId: row.new_account_id ? Number(row.new_account_id) : null,
            previousExpiresAt: row.previous_expires_at || null,
            newExpiresAt: row.new_expires_at || null,
            amountCharged: Number(row.amount_charged || 0),
            currency: row.currency || "",
            actorRole: row.actor_role || "",
            actorEmail: row.actor_email || "",
            createdAt: row.created_at,
        })),
        codeDeliveries: deliveryRows[0].map((row) => ({
            id: Number(row.id),
            orderId: Number(row.order_id),
            platformSlug: row.platform_slug || "",
            platformAccountId: row.platform_account_id ? Number(row.platform_account_id) : null,
            status: row.status || "",
            message: row.message || "",
            requesterEmail: row.requester_email || "",
            createdAt: row.created_at,
        })),
        relatedTickets: relatedRows[0].map(mapTicket),
    };
}

function getSupportMetrics(ticket, events) {
    const firstInProgress = events.find((event) => event.type === "in_progress") || null;
    const firstClose = events.find((event) => ["resolved", "replaced", "auto_replaced"].includes(event.type)) || null;
    const startAt = firstInProgress?.createdAt || null;
    const closeAt = ticket.resolvedAt || firstClose?.createdAt || null;
    const now = new Date().toISOString();

    return {
        createdAt: ticket.createdAt,
        firstResponseAt: startAt,
        resolvedAt: closeAt,
        waitMinutes: minutesBetween(ticket.createdAt, startAt),
        managementMinutes: minutesBetween(startAt || ticket.createdAt, closeAt || now),
        totalMinutes: minutesBetween(ticket.createdAt, closeAt || now),
        isRunning: ticket.status !== "resolved",
    };
}

async function attemptAutoMasterResolution(conn, { ticketId, subscriptionId }) {
    const masterAccount = await findInactiveMasterForSubscription(conn, subscriptionId);
    if (!masterAccount) return { matched: false };

    try {
        const replacement = await replaceSubscriptionAccount({
            conn,
            subscriptionId,
            replacementAccountId: null,
            adminUserId: null,
        });
        const baseResolutionMessage = [
            "Detectamos que la cuenta reportada estaba marcada como inactiva en soporte.",
            "El sistema hizo el reemplazo automatico con una cuenta disponible.",
        ].join(" ");
        const ticketForMessage = await getTicketById(conn, ticketId);
        const resolutionMessage = await buildReplacementResolutionMessage(conn, {
            ticket: ticketForMessage,
            replacement,
            resolutionMessage: baseResolutionMessage,
            createdByUserId: ticketForMessage.userId,
        });

        await conn.query(
            `UPDATE support_tickets
                SET status = 'resolved',
                    resolution_type = 'replaced',
                    resolution_subtype = 'account_replaced',
                    resolution_message = ?,
                    old_account_id = ?,
                    new_account_id = ?,
                    resolved_by_user_id = NULL,
                    resolved_at = NOW()
              WHERE id = ?`,
            [
                resolutionMessage,
                replacement?.oldAccountId || null,
                replacement?.newAccountId || null,
                ticketId,
            ]
        );
        await conn.query(
            `INSERT INTO support_ticket_events (ticket_id, actor_user_id, event_type, message)
             VALUES (?, NULL, 'auto_replaced', ?)`,
            [ticketId, resolutionMessage]
        );
        return { matched: true, resolved: true, masterAccount, replacement };
    } catch (error) {
        if (error?.code !== "NO_STOCK") throw error;
        const message = "Cuenta maestra inactiva detectada, pero no hay stock disponible para reemplazo automatico.";
        await conn.query(
            `INSERT INTO support_ticket_events (ticket_id, actor_user_id, event_type, message)
             VALUES (?, NULL, 'auto_no_stock', ?)`,
            [ticketId, message]
        );
        return { matched: true, resolved: false, noStock: true, masterAccount };
    }
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
    let transactionStarted = false;
    try {
        const [subscriptions] = await conn.query(
            `SELECT s.id, s.user_id, s.platform_id, s.status,
                    o.id AS order_id, o.order_code,
                    p.name AS platform_name,
                    u.name AS user_name, u.email AS user_email,
                    s.expires_at AS effective_expires_at
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
        try {
            assertActiveSupportSubscription(
                subscription,
                {
                    inactiveMessage: "Solo puedes reportar cuentas que se encuentren activas.",
                    expiredMessage: "No puedes reportar una cuenta cuyo pedido ya vencio.",
                }
            );
        } catch (error) {
            return res.status(error.status).json({
                code: error.code,
                message: error.message,
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

        await conn.beginTransaction();
        transactionStarted = true;
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

        let autoResult = { matched: false };
        autoResult = await attemptAutoMasterResolution(conn, {
            ticketId: result.insertId,
            subscriptionId,
        });

        const ticket = await getTicketById(conn, result.insertId);
        if (autoResult.resolved) {
            await queueResolvedNotification(conn, ticket);
        } else {
            await queueCreatedNotifications(conn, ticket, {
                masterAccount: autoResult.masterAccount || null,
                noStock: !!autoResult.noStock,
            });
        }
        await conn.commit();
        transactionStarted = false;

        res.status(201).json({
            ok: true,
            ticket,
            autoResolved: !!autoResult.resolved,
            autoNoStock: !!autoResult.noStock,
        });

    } catch (error) {
        if (transactionStarted) await conn.rollback().catch(() => {});
        if (storedFile) await removeSupportAttachment(storedFile).catch(() => {});
        console.error("[support] Create ticket error:", error);
        if (!res.headersSent) {
            return res.status(500).json({ message: "No se pudo crear la solicitud de soporte." });
        }
    } finally {
        conn.release();
    }
});

router.patch("/support/tickets/:id/reopen", requireAuth, async (req, res) => {
    const ticketId = Number(req.params.id);
    const message = String(req.body?.message || "El usuario reabrio el caso dentro de la ventana de 24 horas.").trim().slice(0, 1000);
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
        return res.status(400).json({ message: "Caso invalido." });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const ticket = await getTicketById(conn, ticketId, {
            userId: Number(req.user.id),
            forUpdate: true,
        });
        if (!ticket) {
            await conn.rollback();
            return res.status(404).json({ message: "Caso no encontrado." });
        }
        if (ticket.status !== "resolved") {
            await conn.rollback();
            return res.status(409).json({ message: "Solo puedes reabrir casos resueltos." });
        }
        if (!ticket.canReopen) {
            await conn.rollback();
            return res.status(409).json({ message: "La ventana de 24 horas para reabrir este caso ya termino." });
        }

        await conn.query(
            "UPDATE support_tickets SET status = 'open' WHERE id = ?",
            [ticketId]
        );
        await conn.query(
            `INSERT INTO support_ticket_events (ticket_id, actor_user_id, event_type, message)
             VALUES (?, ?, 'reopened', ?)`,
            [ticketId, req.user.id, message]
        );
        const reopened = await getTicketById(conn, ticketId, { userId: Number(req.user.id) });
        await queueCreatedNotifications(conn, {
            ...reopened,
            observation: `Caso reabierto: ${message}`,
        }, { eventKey: "reopened" });
        await conn.commit();

        res.json({ ok: true, ticket: reopened });
    } catch (error) {
        await conn.rollback().catch(() => {});
        console.error("[support] Reopen ticket error:", error);
        return res.status(500).json({ message: "No se pudo reabrir el caso." });
    } finally {
        conn.release();
    }
});

router.get("/support/tickets", requireAuth, async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 25);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    try {
        const [[summary], [rows]] = await Promise.all([
            pool.query(
                `SELECT COUNT(*) AS total,
                        SUM(CASE WHEN status IN ('open', 'in_progress') THEN 1 ELSE 0 END) AS open_count
                   FROM support_tickets
                  WHERE user_id = ?`,
                [Number(req.user.id)]
            ),
            pool.query(
            `${TICKET_SELECT}
              WHERE st.user_id = ?
              ORDER BY st.created_at DESC
              LIMIT ? OFFSET ?`,
                [Number(req.user.id), limit, offset]
            ),
        ]);
        const meta = summary?.[0] || {};
        return res.json({
            tickets: rows.map(mapTicket),
            total: Number(meta.total || 0),
            openCount: Number(meta.open_count || 0),
            limit,
            offset,
        });
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

router.get(
    "/admin/support-tickets/summary",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
        const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 10);
        try {
            const [[countRows], [latestRows]] = await Promise.all([
                pool.query(
                    `SELECT
                        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
                        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
                        SUM(CASE WHEN status IN ('open', 'in_progress') THEN 1 ELSE 0 END) AS pending_count,
                        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved_count,
                        COUNT(*) AS total_count
                       FROM support_tickets`
                ),
                pool.query(
                    `${TICKET_SELECT}
                      WHERE st.status IN ('open', 'in_progress')
                      ORDER BY st.created_at DESC
                      LIMIT ?`,
                    [limit]
                ),
            ]);
            const counts = countRows?.[0] || {};
            return res.json({
                counts: {
                    open: Number(counts.open_count || 0),
                    inProgress: Number(counts.in_progress_count || 0),
                    pending: Number(counts.pending_count || 0),
                    resolved: Number(counts.resolved_count || 0),
                    total: Number(counts.total_count || 0),
                },
                latest: latestRows.map(mapTicket),
            });
        } catch (error) {
            console.error("[support] Admin ticket summary error:", error);
            return res.status(500).json({ message: "No se pudo cargar el resumen de soporte." });
        }
    }
);

router.get(
    "/admin/support-tickets/:id/detail",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
        const ticketId = Number(req.params.id);
        if (!Number.isFinite(ticketId) || ticketId <= 0) {
            return res.status(400).json({ message: "Caso invalido." });
        }
        try {
            const ticket = await getTicketById(pool, ticketId);
            if (!ticket) return res.status(404).json({ message: "Caso no encontrado." });
            const [events, accountTrace] = await Promise.all([
                getSupportEvents(ticketId),
                getAccountTrace(ticket),
            ]);
            return res.json({
                ticket,
                events,
                metrics: getSupportMetrics(ticket, events),
                accountTrace,
            });
        } catch (error) {
            console.error("[support] Admin ticket detail error:", error);
            return res.status(500).json({ message: "No se pudo cargar la trazabilidad del caso." });
        }
    }
);

router.get(
    "/admin/support-templates",
    requireAuth,
    requireRole("admin"),
    async (_req, res) => {
        try {
            const [rows] = await pool.query(
                `SELECT *
                   FROM support_response_templates
                  WHERE is_active = 1
                  ORDER BY resolution_type ASC, sort_order ASC, title ASC`
            );
            return res.json({ templates: rows.map(mapTemplate) });
        } catch (error) {
            console.error("[support] Template list error:", error);
            return res.status(500).json({ message: "No se pudieron cargar las plantillas." });
        }
    }
);

router.post(
    "/admin/support-templates",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
        const title = String(req.body?.title || "").trim();
        const resolutionType = String(req.body?.resolutionType || "").trim().toLowerCase();
        const resolutionSubtype = normalizeResolutionSubtype(req.body?.resolutionSubtype);
        const body = String(req.body?.body || "").trim();

        if (title.length < 3 || title.length > 120) {
            return res.status(400).json({ message: "El nombre de la plantilla debe tener entre 3 y 120 caracteres." });
        }
        if (!["repaired", "replaced", "other"].includes(resolutionType)) {
            return res.status(400).json({ message: "Selecciona el tipo de cierre de la plantilla." });
        }
        if (body.length < 10 || body.length > 3000) {
            return res.status(400).json({ message: "La plantilla debe tener entre 10 y 3000 caracteres." });
        }

        try {
            const [result] = await pool.query(
                `INSERT INTO support_response_templates
                    (title, resolution_type, resolution_subtype, body, created_by_user_id)
                 VALUES (?, ?, ?, ?, ?)`,
                [title, resolutionType, resolutionSubtype, body, req.user.id]
            );
            const [rows] = await pool.query(
                "SELECT * FROM support_response_templates WHERE id = ? LIMIT 1",
                [result.insertId]
            );
            return res.status(201).json({ ok: true, template: mapTemplate(rows[0]) });
        } catch (error) {
            console.error("[support] Template create error:", error);
            return res.status(500).json({ message: "No se pudo guardar la plantilla." });
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
            const [subscriptionRows] = await conn.query(
                "SELECT id, status, expires_at FROM subscriptions WHERE id = ? FOR UPDATE",
                [ticket.subscriptionId]
            );
            try {
                assertActiveSupportSubscription(
                    subscriptionRows[0],
                    {
                        inactiveMessage: "No se puede escalar el caso: el pedido ya no esta activo.",
                        expiredMessage: "No se puede escalar el caso: el pedido ya vencio.",
                    }
                );
            } catch (error) {
                await conn.rollback();
                return res.status(error.status).json({
                    code: error.code,
                    message: error.message,
                });
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
        const resolutionSubtype = normalizeResolutionSubtype(req.body?.resolutionSubtype);
        let resolutionMessage = String(req.body?.resolutionMessage || "").trim();
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
        if (resolutionType === "replaced" && !resolutionMessage) {
            resolutionMessage = "Tu cuenta ha sido reemplazada por:";
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
                resolutionMessage = await buildReplacementResolutionMessage(conn, {
                    ticket: current,
                    replacement,
                    resolutionMessage,
                    createdByUserId: req.user.id,
                });
            }

            await conn.query(
                `UPDATE support_tickets
                    SET status = 'resolved',
                        resolution_type = ?,
                        resolution_subtype = ?,
                        resolution_message = ?,
                        old_account_id = ?,
                        new_account_id = ?,
                        resolved_by_user_id = ?,
                        resolved_at = NOW()
                  WHERE id = ?`,
                [
                    resolutionType,
                    resolutionSubtype,
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
            const ticket = await getTicketById(conn, ticketId);
            await queueResolvedNotification(conn, ticket);
            await conn.commit();

            return res.json({ ok: true, ticket, mail: { ok: true, delivery: "queued" } });
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
