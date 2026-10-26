const express = require("express");
const rateLimit = require("express-rate-limit");
const pool = require("../db");
const { withTransaction } = require("../dbHelpers");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const referrals = require("../services/referrals.service");
const { sendReferralInvitationEmail } = require("../services/mailService");

const router = express.Router();
const admin = [requireAuth, requireRole("admin")];
const publicLimiter = rateLimit({ windowMs: 60000, limit: 60, standardHeaders: true, legacyHeaders: false });
const inviteIpLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const inviteSendLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false,
    keyGenerator: req => "referral-user:" + String(req.user.id),
    message: { message: "Alcanzaste el límite de invitaciones por ahora. Intenta más tarde." },
});

function handler(callback) {
    return async (req, res) => {
        res.set("Cache-Control", "no-store");
        try { await callback(req, res); }
        catch (error) {
            if (!error.status) console.error("[referrals] request_failed", { code: error.code || "internal" });
            res.status(error.status || 500).json({ message: error.status ? error.message : "No se pudo procesar la operación de referidos." });
        }
    };
}

function recordId(req) {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw referrals.domainError("ID no válido.");
    return id;
}

router.get("/referrals/campaign", publicLimiter, handler(async (_req, res) => {
    res.json({ ok: true, campaign: referrals.campaignStatus(await referrals.getSettings()) });
}));

router.get("/referrals/invite/validate", publicLimiter, handler(async (req, res) => {
    const invite = await referrals.getEmailInvite(req.query?.token);
    if (!invite) throw referrals.domainError("Esta invitación ya se usó, venció o no está disponible.", 404);
    res.json({ ok: true, invite });
}));

router.post("/referrals/invite", requireAuth, inviteIpLimiter, inviteSendLimiter, handler(async (req, res) => {
    const email = referrals.normalizeInvitationEmail(req.body?.email);
    const invite = await withTransaction(db => referrals.createEmailInvite(db, { referrerUserId: req.user.id, email }));
    let base;
    try {
        base = new URL(process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || "https://strbx.com.co");
        if (!/[\s]/.test(base.origin) && ["http:", "https:"].includes(base.protocol)) {
            base = base.origin;
        } else throw new Error("invalid origin");
    } catch {
        await withTransaction(db => referrals.revokeEmailInvite(db, invite.id, invite.tokenHash));
        throw referrals.domainError("No se pudo preparar el enlace de invitación.", 503);
    }
    const inviteUrl = base + "/register#invite=" + invite.token;
    try {
        await sendReferralInvitationEmail({
            to: invite.email, inviterName: invite.inviterName, inviteUrl,
            campaign: invite.campaign, expiresAt: invite.expiresAt,
        });
    } catch {
        await withTransaction(db => referrals.revokeEmailInvite(db, invite.id, invite.tokenHash));
        throw referrals.domainError("No se pudo enviar el correo. Verifica el SMTP e inténtalo de nuevo.", 503);
    }
    try {
        await referrals.markEmailInviteSent(pool, invite.id, invite.tokenHash);
    } catch (error) {
        console.error("[referrals] invite_sent_marker_failed", { code: error?.code || "db_error" });
    }
    res.status(202).json({
        ok: true, email: invite.email, expiresAt: invite.expiresAt,
        message: "Enviamos la invitación. El enlace es único y solo sirve para ese correo.",
    });
}));

router.get("/referrals/me", requireAuth, handler(async (req, res) => {
    const userId = req.user.id;
    const [[user]] = await pool.query("SELECT id, status, role, currency FROM users WHERE id = ? LIMIT 1", [userId]);
    const eligible = referrals.isEligibleUser(user);
    const settings = await referrals.getSettings();
    const code = eligible ? await referrals.ensureReferralCode(userId) : null;
    const base = new URL(process.env.PUBLIC_BASE_URL || "https://strbx.com.co").origin;
    const history = await referrals.listReferrals(req.query, { userId });
    const [[invitation]] = await pool.query("SELECT id, progress_amount AS progressAmount, minimum_topup AS targetAmount, expires_at AS expiresAt, contact_consent_at AS contactConsentAt FROM referrals WHERE referred_user_id = ? LIMIT 1", [userId]);
    res.json({ ok: true, eligible, campaign: referrals.campaignStatus(settings), code, shareUrl: code ? base + "/register?ref=" + code : null, ...history, invitation: invitation ? { ...invitation, progressAmount: Number(invitation.progressAmount), targetAmount: Number(invitation.targetAmount), contactSharing: Boolean(invitation.contactConsentAt) } : null });
}));

router.put("/referrals/contact-consent", requireAuth, handler(async (req, res) => {
    if (typeof req.body?.consent !== "boolean") throw referrals.domainError("El consentimiento debe ser verdadero o falso.");
    await withTransaction(async db => {
        const [[row]] = await db.query("SELECT id FROM referrals WHERE referred_user_id = ? FOR UPDATE", [req.user.id]);
        if (!row) throw referrals.domainError("No tienes una invitación registrada.", 404);
        await db.query("UPDATE referrals SET contact_consent_at = ? WHERE id = ?", [req.body.consent ? new Date() : null, row.id]);
        await referrals.audit(db, row.id, req.user.id, req.body.consent ? "contact_authorized" : "contact_revoked");
    });
    res.json({ ok: true });
}));

router.get("/admin/referrals/settings", ...admin, handler(async (_req, res) => {
    const settings = await referrals.getSettings();
    const month = referrals.monthBounds(new Date());
    const [[usage]] = await pool.query("SELECT total_awarded FROM referral_budget_usage WHERE month_key = ?", [month.key]);
    const [audit] = await pool.query("SELECT actor_user_id AS actorUserId, action, detail, created_at AS createdAt FROM referral_audit_log WHERE referral_id IS NULL ORDER BY id DESC LIMIT 10");
    res.json({ ok: true, settings, campaign: referrals.campaignStatus(settings), month: month.key, monthlyAwarded: Number(usage?.total_awarded || 0), audit });
}));

router.put("/admin/referrals/settings", ...admin, handler(async (req, res) => {
    const input = req.body;
    if (!input || typeof input !== "object" || Array.isArray(input)) throw referrals.domainError("Configuración no válida.");
    const allowed = [...Object.keys(referrals.DEFAULT_SETTINGS).filter(key => key !== "version"), "expectedVersion"];
    if (Object.keys(input).some(key => !allowed.includes(key))) throw referrals.domainError("La configuración contiene campos no permitidos.");
    const settings = await withTransaction(db => referrals.saveSettings(db, input, req.user.id));
    res.json({ ok: true, settings, campaign: referrals.campaignStatus(settings) });
}));

router.get("/admin/referrals", ...admin, handler(async (req, res) => {
    res.json({ ok: true, ...await referrals.listReferrals(req.query) });
}));

router.get("/admin/referrals/export", ...admin, handler(async (req, res) => {
    res.json({ ok: true, ...await referrals.listReferrals(req.query, { exportAll: true }) });
}));

router.get("/admin/referrals/:id", ...admin, handler(async (req, res) => {
    const id = recordId(req);
    const [rows] = await pool.query("SELECT r.*, inviter.name AS referrer_name, inviter.email AS referrer_email, invitee.name AS referred_name, invitee.email AS referred_email, CASE WHEN r.status = 'pending' AND r.expires_at <= UTC_TIMESTAMP() THEN 'expired' ELSE r.status END AS effective_status FROM referrals r JOIN users inviter ON inviter.id = r.referrer_user_id JOIN users invitee ON invitee.id = r.referred_user_id WHERE r.id = ?", [id]);
    if (!rows.length) throw referrals.domainError("Referido no encontrado.", 404);
    const [events] = await pool.query("SELECT actor_user_id AS actorUserId, action, detail, created_at AS createdAt FROM referral_audit_log WHERE referral_id = ? ORDER BY id DESC LIMIT 100", [id]);
    const [topups] = await pool.query("SELECT topup_id AS topupId, amount, approved_at AS approvedAt FROM referral_topups WHERE referral_id = ? ORDER BY approved_at DESC, topup_id DESC LIMIT 50", [id]);
    const [[count]] = await pool.query("SELECT COUNT(*) AS total FROM referral_topups WHERE referral_id = ?", [id]);
    res.json({ ok: true, item: referrals.mapReferral(rows[0], true), events, topups, topupsTotal: Number(count.total) });
}));

router.post("/admin/referrals/:id/cancel", ...admin, handler(async (req, res) => {
    const id = recordId(req);
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 5 || reason.length > 500) throw referrals.domainError("Escribe un motivo de entre 5 y 500 caracteres.");
    await withTransaction(async db => {
        const [[row]] = await db.query("SELECT id, status FROM referrals WHERE id = ? FOR UPDATE", [id]);
        if (!row) throw referrals.domainError("Referido no encontrado.", 404);
        if (!["pending", "review"].includes(row.status)) throw referrals.domainError("Solo se pueden cancelar premios pendientes o en revisión.", 409);
        await db.query("UPDATE referrals SET status = 'cancelled', reason = 'admin_cancelled' WHERE id = ?", [id]);
        await referrals.audit(db, id, req.user.id, "cancelled", { reason });
    });
    res.json({ ok: true });
}));

router.post("/admin/referrals/:id/retry", ...admin, handler(async (req, res) => {
    const id = recordId(req);
    const result = await withTransaction(async db => {
        const [[row]] = await db.query("SELECT referred_user_id, qualifying_topup_id, status FROM referrals WHERE id = ?", [id]);
        if (!row) throw referrals.domainError("Referido no encontrado.", 404);
        if (row.status !== "review" || !row.qualifying_topup_id) throw referrals.domainError("Este premio no está pendiente de revisión.", 409);
        const [[topup]] = await db.query("SELECT id, user_id, amount, currency, status FROM manual_topup_requests WHERE id = ? FOR UPDATE", [row.qualifying_topup_id]);
        if (!topup || Number(topup.user_id) !== Number(row.referred_user_id)) throw referrals.domainError("Recarga vinculada no válida.", 409);
        await db.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [row.referred_user_id]);
        await db.query("SELECT id FROM wallets WHERE user_id = ? FOR UPDATE", [row.referred_user_id]);
        const outcome = await referrals.processTopupReferral(db, topup, { retry: true, actorUserId: req.user.id });
        if (outcome.status === "unchanged") throw referrals.domainError("El referido cambió de estado. Actualiza la lista.", 409);
        return outcome;
    });
    res.json({ ok: true, result });
}));

router.post("/admin/referrals/:id/reverse", ...admin, handler(async (req, res) => {
    const id = recordId(req);
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 5 || reason.length > 500) throw referrals.domainError("Escribe un motivo de entre 5 y 500 caracteres.");
    const result = await withTransaction(db => referrals.reverseReferral(db, id, req.user.id, reason));
    res.json({ ok: true, result });
}));

module.exports = router;
