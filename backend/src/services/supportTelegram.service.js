const pool = require("../db");
const { enqueueNotification } = require("./notificationOutbox.service");
const { assertActiveSupportSubscription } = require("./supportSubscriptionEligibility.service");
const { grantManagementExtension } = require("./supportManagement.service");

const TICKET_SELECT = `
    SELECT st.*,
           u.name AS user_name,
           u.email AS user_email,
           p.name AS platform_name,
           p.slug AS platform_slug,
           pa.id AS account_id,
           pa.email AS account_email,
           pa.password AS account_password,
           pa.status AS account_status,
           pa.profile_number,
           s.status AS subscription_status,
           s.expires_at AS effective_expires_at
      FROM support_tickets st
      JOIN users u ON u.id = st.user_id
      JOIN platforms p ON p.id = st.platform_id
      JOIN subscriptions s ON s.id = st.subscription_id
      LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
 `;

function getReopenUntil(value) {
    if (!value) return null;
    const closedAt = new Date(value);
    if (Number.isNaN(closedAt.getTime())) return null;
    return new Date(closedAt.getTime() + 24 * 60 * 60 * 1000).toISOString();
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
        platformSlug: row.platform_slug || "",
        orderId: row.order_id ? Number(row.order_id) : null,
        orderCode: row.order_code || "",
        status: row.status,
        observation: row.observation || "",
        attachmentName: row.attachment_name || "",
        attachmentMime: row.attachment_mime || "",
        attachmentSize: Number(row.attachment_size || 0),
        resolutionType: row.resolution_type || null,
        resolutionSubtype: row.resolution_subtype || null,
        resolutionSubtypeLabel: row.resolution_subtype === "other_solution" ? "Otro cierre" : (row.resolution_subtype || ""),
        resolutionMessage: row.resolution_message || "",
        accountId: row.account_id ? Number(row.account_id) : null,
        accountEmail: row.account_email || "",
        accountPassword: row.account_password || "",
        accountStatus: row.account_status || "",
        profileNumber: row.profile_number ?? null,
        expiresAt: row.effective_expires_at || null,
        resolvedAt: row.resolved_at || null,
        managementExtensionDays: Number(row.management_extension_days || 0),
        reopenUntil: getReopenUntil(row.resolved_at),
    };
}

async function getTicket(conn, ticketId, { forUpdate = false } = {}) {
    const [rows] = await conn.query(
        `${TICKET_SELECT} WHERE st.id = ? LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
        [ticketId]
    );
    return mapTicket(rows[0]);
}

function actorLabel(from = {}) {
    if (from.username) return `@${from.username}`;
    return from.first_name || "Admin Telegram";
}

async function assertTicketIsActive(conn, ticket) {
    const [rows] = await conn.query(
        "SELECT id, status, expires_at FROM subscriptions WHERE id = ? FOR UPDATE",
        [ticket.subscriptionId]
    );
    assertActiveSupportSubscription(rows[0], {
        inactiveMessage: "No se puede gestionar el caso: el pedido ya no esta activo.",
        expiredMessage: "No se puede gestionar el caso: el pedido ya vencio.",
    });
}

async function takeSupportTicketFromTelegram({ ticketId, from }) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const ticket = await getTicket(conn, ticketId, { forUpdate: true });
        if (!ticket) {
            const error = new Error("Caso no encontrado.");
            error.status = 404;
            throw error;
        }
        if (ticket.status === "resolved") {
            const error = new Error("El caso ya fue resuelto.");
            error.status = 409;
            throw error;
        }

        await assertTicketIsActive(conn, ticket);
        if (ticket.status !== "in_progress") {
            await conn.query("UPDATE support_tickets SET status = 'in_progress' WHERE id = ?", [ticketId]);
            await conn.query(
                `INSERT INTO support_ticket_events (ticket_id, actor_user_id, event_type, message)
                 VALUES (?, NULL, 'in_progress', ?)`,
                [ticketId, `Caso tomado desde Telegram por ${actorLabel(from)}.`]
            );
        }
        const updated = await getTicket(conn, ticketId);
        await conn.commit();
        return updated;
    } catch (error) {
        await conn.rollback().catch(() => {});
        throw error;
    } finally {
        conn.release();
    }
}

async function resolveSupportTicketFromTelegram({ ticketId, message, from }) {
    const resolutionMessage = String(message || "").trim().slice(0, 3000);
    if (resolutionMessage.length < 10) {
        const error = new Error("La respuesta debe tener al menos 10 caracteres.");
        error.status = 400;
        throw error;
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        let current = await getTicket(conn, ticketId, { forUpdate: true });
        if (!current) {
            const error = new Error("Caso no encontrado.");
            error.status = 404;
            throw error;
        }
        if (current.status === "resolved") {
            const error = new Error("El caso ya fue resuelto.");
            error.status = 409;
            throw error;
        }

        await assertTicketIsActive(conn, current);
        if (current.status !== "in_progress") {
            await conn.query("UPDATE support_tickets SET status = 'in_progress' WHERE id = ?", [ticketId]);
            await conn.query(
                `INSERT INTO support_ticket_events (ticket_id, actor_user_id, event_type, message)
                 VALUES (?, NULL, 'in_progress', ?)`,
                [ticketId, `Caso tomado y respondido desde Telegram por ${actorLabel(from)}.`]
            );
        }

        const managementExtension = await grantManagementExtension(conn, {
            ticketId,
            subscriptionId: current.subscriptionId,
            closedAt: new Date(),
        });
        await conn.query(
            `UPDATE support_tickets
                SET status = 'resolved',
                    resolution_type = 'other',
                    resolution_subtype = 'other_solution',
                    resolution_message = ?,
                    resolved_by_user_id = NULL,
                    resolved_at = NOW()
              WHERE id = ?`,
            [resolutionMessage, ticketId]
        );
        await conn.query(
            `INSERT INTO support_ticket_events (ticket_id, actor_user_id, event_type, message)
             VALUES (?, NULL, 'resolved', ?)`,
            [ticketId, `${resolutionMessage}\nGestionado desde Telegram por ${actorLabel(from)}.`]
        );

        current = await getTicket(conn, ticketId);
        await enqueueNotification(conn, {
            channel: "email",
            eventType: "support_resolved",
            dedupeKey: `support-resolved:${ticketId}`,
            payload: { ticket: current, customerName: current.userName },
        });
        await conn.commit();
        return { ticket: current, managementExtension };
    } catch (error) {
        await conn.rollback().catch(() => {});
        throw error;
    } finally {
        conn.release();
    }
}

module.exports = {
    takeSupportTicketFromTelegram,
    resolveSupportTicketFromTelegram,
};
