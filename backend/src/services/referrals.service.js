const crypto = require("crypto");
const pool = require("../db");

const SETTINGS_KEY = "referral_program_json";
const EMAIL_INVITE_TTL_DAYS = 7;
const DEFAULT_SETTINGS = Object.freeze({
    enabled: false, rewardAmount: 10000, minimumTopup: 50000, attributionDays: 30,
    monthlyRewardLimit: 0, monthlyBudget: 0, startsAt: null, endsAt: null, version: 1,
});
const STATES = ["pending", "review", "credited", "ineligible", "expired", "cancelled", "reversed"];
const EFFECTIVE_STATE = "CASE WHEN r.status = 'pending' AND r.expires_at <= UTC_TIMESTAMP() THEN 'expired' ELSE r.status END";

function domainError(message, status = 400) {
    return Object.assign(new Error(message), { status });
}

function normalizeSettings(raw) {
    let value = raw;
    if (typeof value === "string") {
        try { value = JSON.parse(value); } catch { value = {}; }
    }
    return { ...DEFAULT_SETTINGS, ...(value && typeof value === "object" ? value : {}) };
}

function validateSettings(input) {
    const value = normalizeSettings(input);
    if (typeof value.enabled !== "boolean") throw domainError("El estado de la campaña no es válido.");
    for (const [key, minimum, maximum] of [
        ["rewardAmount", 0, 100000000], ["minimumTopup", 1, 100000000],
        ["attributionDays", 1, 365], ["monthlyRewardLimit", 0, 10000], ["monthlyBudget", 0, 1000000000],
    ]) {
        if (!Number.isSafeInteger(value[key]) || value[key] < minimum || value[key] > maximum) {
            throw domainError("Revisa los montos, días y límites: deben ser números enteros dentro del rango permitido.");
        }
    }
    if (value.rewardAmount > value.minimumTopup) throw domainError("El premio no puede superar la recarga mínima.");
    if (value.enabled && value.rewardAmount <= 0) throw domainError("Configura un premio mayor a cero antes de activar.");
    for (const key of ["startsAt", "endsAt"]) {
        if (value[key] == null || value[key] === "") value[key] = null;
        else if (typeof value[key] !== "string" || Number.isNaN(Date.parse(value[key]))) {
            throw domainError("La fecha de la campaña no es válida.");
        } else value[key] = new Date(value[key]).toISOString();
    }
    if (value.startsAt && value.endsAt && value.startsAt >= value.endsAt) throw domainError("El fin debe ser posterior al inicio.");
    return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(key => [key, value[key]]));
}

function campaignStatus(settings, now = new Date()) {
    const value = normalizeSettings(settings);
    return {
        active: value.enabled && value.rewardAmount > 0
            && (!value.startsAt || now >= new Date(value.startsAt))
            && (!value.endsAt || now < new Date(value.endsAt)),
        rewardAmount: value.rewardAmount, minimumTopup: value.minimumTopup,
        attributionDays: value.attributionDays, currency: "COP",
        startsAt: value.startsAt, endsAt: value.endsAt,
    };
}

async function getSettings(db = pool, lock = false) {
    const [rows] = await db.query("SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1" + (lock ? " FOR UPDATE" : ""), [SETTINGS_KEY]);
    return normalizeSettings(rows[0]?.setting_value);
}

async function audit(db, referralId, actorUserId, action, detail = {}) {
    await db.query("INSERT INTO referral_audit_log (referral_id, actor_user_id, action, detail) VALUES (?, ?, ?, ?)",
        [referralId, actorUserId, action, JSON.stringify(detail)]);
}

async function saveSettings(db, input, actorUserId) {
    const current = await getSettings(db, true);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== Number(current.version)) {
        throw domainError("La campaña cambió en otra sesión. Actualiza antes de guardar.", 409);
    }
    const next = validateSettings({ ...current, ...input, version: Number(current.version) + 1 });
    await db.query("UPDATE app_settings SET setting_value = ? WHERE setting_key = ?", [JSON.stringify(next), SETTINGS_KEY]);
    await audit(db, null, actorUserId, "settings_updated", { before: current, after: next });
    return next;
}

function isEligibleUser(user) {
    return user?.status === "active" && user?.role === "user" && user?.currency === "COP";
}

function normalizeInvitationEmail(value) {
    const email = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw domainError("Escribe un correo válido.");
    return email;
}

function hashEmailInviteToken(value) {
    const token = String(value || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(token)) throw domainError("La invitación no está disponible.", 404);
    return crypto.createHash("sha256").update(token).digest("hex");
}

async function createEmailInvite(db, { referrerUserId, email }) {
    const recipientEmail = normalizeInvitationEmail(email);
    const [[clock]] = await db.query("SELECT UTC_TIMESTAMP() AS now_utc");
    const now = new Date(clock.now_utc);
    const [[referrer]] = await db.query("SELECT id, name, email, status, role, currency FROM users WHERE id = ? LIMIT 1 FOR UPDATE", [referrerUserId]);
    if (!isEligibleUser(referrer)) throw domainError("Solo los clientes activos en COP pueden enviar invitaciones.", 403);
    if (normalizeInvitationEmail(referrer.email) === recipientEmail) throw domainError("No puedes invitar tu propio correo.");

    const settings = await getSettings(db);
    if (!campaignStatus(settings, now).active) throw domainError("La campaña de referidos está pausada.", 409);
    const [[existingUser]] = await db.query("SELECT id FROM users WHERE email = ? LIMIT 1 FOR UPDATE", [recipientEmail]);
    if (existingUser) throw domainError("Ese correo ya tiene una cuenta y no puede participar como nuevo referido.", 409);

    const code = await ensureReferralCode(referrerUserId, db);
    const [[existingInvite]] = await db.query(
        "SELECT id, referrer_user_id, used_at, revoked_at, expires_at FROM referral_email_invites WHERE recipient_email_key = ? LIMIT 1 FOR UPDATE",
        [recipientEmail]
    );
    if (existingInvite?.used_at) throw domainError("Ese correo ya usó una invitación.", 409);
    if (existingInvite && !existingInvite.revoked_at && new Date(existingInvite.expires_at) > now
        && Number(existingInvite.referrer_user_id) !== Number(referrerUserId)) {
        throw domainError("Ese correo ya tiene una invitación vigente.", 409);
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashEmailInviteToken(token);
    const expiresAt = new Date(now.getTime() + EMAIL_INVITE_TTL_DAYS * 86400000);
    const values = [referrerUserId, recipientEmail, recipientEmail, tokenHash, code, settings.version,
        settings.rewardAmount, settings.minimumTopup, settings.attributionDays, expiresAt];
    let inviteId;
    if (existingInvite) {
        inviteId = existingInvite.id;
        await db.query(`UPDATE referral_email_invites
            SET referrer_user_id = ?, recipient_email = ?, recipient_email_key = ?, token_hash = ?, referral_code = ?,
                settings_version = ?, reward_amount = ?, minimum_topup = ?, attribution_days = ?, expires_at = ?,
                sent_at = NULL, revoked_at = NULL, registered_user_id = NULL
            WHERE id = ?`, [...values, inviteId]);
    } else {
        const [created] = await db.query(`INSERT INTO referral_email_invites
            (referrer_user_id, recipient_email, recipient_email_key, token_hash, referral_code,
             settings_version, reward_amount, minimum_topup, attribution_days, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, values);
        inviteId = created.insertId;
    }
    await audit(db, null, referrerUserId, "email_invite_created", {
        inviteId, rewardAmount: settings.rewardAmount, minimumTopup: settings.minimumTopup,
        attributionDays: settings.attributionDays, expiresAt,
    });
    return {
        id: inviteId, token, tokenHash, email: recipientEmail, inviterName: String(referrer.name || "").trim(),
        expiresAt, campaign: {
            rewardAmount: Number(settings.rewardAmount), minimumTopup: Number(settings.minimumTopup),
            attributionDays: Number(settings.attributionDays), currency: "COP",
        },
    };
}

async function getEmailInvite(token, db = pool) {
    const tokenHash = hashEmailInviteToken(token);
    const [rows] = await db.query(`SELECT i.recipient_email, i.recipient_email_key, i.reward_amount, i.minimum_topup,
            i.attribution_days, i.expires_at, u.name AS referrer_name
        FROM referral_email_invites i
        JOIN users u ON u.id = i.referrer_user_id
        WHERE i.token_hash = ? AND i.used_at IS NULL AND i.revoked_at IS NULL
            AND i.expires_at > UTC_TIMESTAMP() AND u.status = 'active' AND u.role = 'user' AND u.currency = 'COP'
        LIMIT 1`, [tokenHash]);
    const invite = rows[0];
    if (!invite) return null;
    const [[existingUser]] = await db.query("SELECT id FROM users WHERE email = ? LIMIT 1", [invite.recipient_email_key]);
    if (existingUser) return null;
    return {
        email: invite.recipient_email,
        inviterName: String(invite.referrer_name || "").trim(),
        expiresAt: invite.expires_at,
        campaign: {
            active: true, rewardAmount: Number(invite.reward_amount), minimumTopup: Number(invite.minimum_topup),
            attributionDays: Number(invite.attribution_days), currency: "COP",
        },
    };
}

async function markEmailInviteSent(db, inviteId, tokenHash) {
    const [result] = await db.query(`UPDATE referral_email_invites SET sent_at = UTC_TIMESTAMP()
        WHERE id = ? AND token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()`,
    [inviteId, tokenHash]);
    return Number(result.affectedRows) === 1;
}

async function revokeEmailInvite(db, inviteId, tokenHash) {
    await db.query(`UPDATE referral_email_invites SET revoked_at = UTC_TIMESTAMP()
        WHERE id = ? AND token_hash = ? AND used_at IS NULL AND revoked_at IS NULL`, [inviteId, tokenHash]);
}

async function consumeEmailInviteForExistingUser(db, { token, email, userId }) {
    const recipientEmail = normalizeInvitationEmail(email);
    const tokenHash = hashEmailInviteToken(token);
    const [rows] = await db.query(`SELECT id FROM referral_email_invites
        WHERE token_hash = ? AND recipient_email_key = ? AND used_at IS NULL AND revoked_at IS NULL
            AND expires_at > UTC_TIMESTAMP() LIMIT 1 FOR UPDATE`, [tokenHash, recipientEmail]);
    if (!rows.length) return false;
    const [result] = await db.query(`UPDATE referral_email_invites SET used_at = UTC_TIMESTAMP(), registered_user_id = ?
        WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL`, [userId, rows[0].id]);
    return Number(result.affectedRows) === 1;
}

async function attachEmailInvite(db, { userId, token, email, contactConsent }) {
    if (contactConsent !== true) throw domainError("Para participar con un referido, autoriza compartir tu nombre, correo y avance con quien te invita.");
    const recipientEmail = normalizeInvitationEmail(email);
    const tokenHash = hashEmailInviteToken(token);
    const [rows] = await db.query(`SELECT * FROM referral_email_invites
        WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()
        LIMIT 1 FOR UPDATE`, [tokenHash]);
    const invite = rows[0];
    if (!invite) throw domainError("La invitación ya se usó, venció o no está disponible.", 409);
    if (String(invite.recipient_email_key).toLowerCase() !== recipientEmail) throw domainError("Regístrate con el correo al que se envió esta invitación.");
    const [[clock]] = await db.query("SELECT UTC_TIMESTAMP() AS now_utc");
    const now = new Date(clock.now_utc);
    const [[referrer]] = await db.query("SELECT id, status, role, currency FROM users WHERE id = ? LIMIT 1 FOR UPDATE", [invite.referrer_user_id]);
    if (!isEligibleUser(referrer) || Number(referrer.id) === Number(userId)) throw domainError("La invitación no está disponible.", 409);
    const expiresAt = new Date(now.getTime() + Number(invite.attribution_days) * 86400000);
    const [created] = await db.query(`INSERT INTO referrals
        (referrer_user_id, referred_user_id, referral_code, settings_version, reward_amount, minimum_topup,
         currency, created_at, expires_at, contact_consent_at)
        VALUES (?, ?, ?, ?, ?, ?, 'COP', ?, ?, ?)`,
    [invite.referrer_user_id, userId, invite.referral_code, invite.settings_version, invite.reward_amount,
        invite.minimum_topup, now, expiresAt, now]);
    const [consumed] = await db.query(`UPDATE referral_email_invites
        SET used_at = ?, registered_user_id = ?
        WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
    [now, userId, invite.id, now]);
    if (Number(consumed.affectedRows) !== 1) throw domainError("La invitación ya se usó o venció. Solicita un enlace nuevo.", 409);
    await audit(db, created.insertId, userId, "registered", {
        settingsVersion: invite.settings_version, contactConsent: true, viaEmailInvite: true,
    });
    return true;
}

async function ensureReferralCode(userId, db = pool) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const [rows] = await db.query("SELECT code FROM referral_codes WHERE user_id = ? LIMIT 1", [userId]);
        if (rows.length) return rows[0].code;
        const code = "SB" + crypto.randomBytes(5).toString("hex").toUpperCase();
        await db.query("INSERT IGNORE INTO referral_codes (user_id, code) VALUES (?, ?)", [userId, code]);
        const [created] = await db.query("SELECT code FROM referral_codes WHERE user_id = ? LIMIT 1", [userId]);
        if (created.length) return created[0].code;
    }
    throw domainError("No se pudo generar el enlace. Intenta nuevamente.", 503);
}

// Only called for a newly inserted registration, within the same transaction.
async function attachReferral(db, { userId, code, inviteToken, email, contactConsent = false }) {
    if (inviteToken) {
        if (String(code || "").trim()) throw domainError("Usa una sola invitación por registro.");
        return attachEmailInvite(db, { userId, token: inviteToken, email, contactConsent });
    }
    const normalizedCode = String(code || "").trim().toUpperCase();
    if (!normalizedCode) return false;
    const settings = await getSettings(db);
    const [[clock]] = await db.query("SELECT UTC_TIMESTAMP() AS now_utc");
    const now = new Date(clock.now_utc);
    if (!campaignStatus(settings, now).active) return false;
    if (contactConsent !== true) throw domainError("Para participar con un referido, autoriza compartir tu nombre, correo y avance con quien te invita, o deja el código vacío.");
    if (!/^SB[A-F0-9]{10}$/.test(normalizedCode)) throw domainError("El código de referido no está disponible. Revísalo o déjalo vacío.");
    const [rows] = await db.query("SELECT u.id, u.status, u.role, u.currency FROM referral_codes c JOIN users u ON u.id = c.user_id WHERE c.code = ? LIMIT 1", [normalizedCode]);
    const referrer = rows[0];
    if (!isEligibleUser(referrer) || Number(referrer.id) === Number(userId)) throw domainError("El código de referido no está disponible. Revísalo o déjalo vacío.");
    const expiresAt = new Date(now.getTime() + settings.attributionDays * 86400000);
    const [result] = await db.query("INSERT INTO referrals (referrer_user_id, referred_user_id, referral_code, settings_version, reward_amount, minimum_topup, currency, created_at, expires_at, contact_consent_at) VALUES (?, ?, ?, ?, ?, ?, 'COP', ?, ?, ?)",
        [referrer.id, userId, normalizedCode, settings.version, settings.rewardAmount, settings.minimumTopup, now, expiresAt, now]);
    await audit(db, result.insertId, userId, "registered", { settingsVersion: settings.version, contactConsent: true });
    return true;
}

function monthBounds(now) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", year: "numeric", month: "2-digit" }).formatToParts(now).map(p => [p.type, p.value]));
    const key = parts.year + "-" + parts.month;
    const start = new Date(key + "-01T00:00:00-05:00");
    const nextMonth = new Date(Date.UTC(Number(parts.year), Number(parts.month), 1, 5));
    return { key, start, end: nextMonth };
}

async function transition(db, referral, status, reason, actorUserId = null) {
    await db.query("UPDATE referrals SET status = ?, reason = ? WHERE id = ?", [status, reason, referral.id]);
    await audit(db, referral.id, actorUserId, status, { reason });
    return { status, reason };
}

// The caller owns the top-up transaction and already holds the invited wallet lock.
async function processTopupReferral(db, topup, { retry = false, actorUserId = null } = {}) {
    const [rows] = await db.query("SELECT * FROM referrals WHERE referred_user_id = ? LIMIT 1 FOR UPDATE", [topup.user_id]);
    const referral = rows[0];
    if (!referral || (retry ? referral.status !== "review" : referral.status !== "pending")) return { status: "unchanged" };
    const [[clock]] = await db.query("SELECT UTC_TIMESTAMP() AS now_utc");
    const now = new Date(clock.now_utc);
    if (retry) {
        if (Number(referral.qualifying_topup_id) !== Number(topup.id) || topup.status !== "approved") throw domainError("La recarga vinculada no está aprobada.", 409);
        const [sources] = await db.query("SELECT p.amount AS contribution_amount, p.approved_at AS contribution_approved_at, t.id, t.user_id, t.amount, t.currency, t.status FROM referral_topups p LEFT JOIN manual_topup_requests t ON t.id = p.topup_id WHERE p.referral_id = ? ORDER BY p.topup_id FOR UPDATE", [referral.id]);
        const total = Number(sources.reduce((sum, row) => sum + Number(row.contribution_amount), 0).toFixed(2));
        const valid = sources.length > 0 && sources.every(row => row.id && row.status === "approved" && row.currency === "COP"
            && Number(row.user_id) === Number(referral.referred_user_id) && Number(row.amount) === Number(row.contribution_amount)
            && new Date(row.contribution_approved_at) >= new Date(referral.created_at)
            && new Date(row.contribution_approved_at) < new Date(referral.expires_at));
        if (!valid || total !== Number(referral.progress_amount) || total < Number(referral.minimum_topup) || !referral.qualified_at
            || new Date(referral.qualified_at) >= new Date(referral.expires_at)) {
            return transition(db, referral, "review", "source_changed", actorUserId);
        }
    } else {
        if (now >= new Date(referral.expires_at)) return transition(db, referral, "expired", "expired");
        if (topup.currency !== "COP") return { status: "unchanged" };
        const amount = Number(topup.amount);
        const progress = Number((Number(referral.progress_amount || 0) + amount).toFixed(2));
        if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(progress) || progress > 9999999999.99) throw domainError("Importe de recarga no válido para la meta.", 409);
        const [added] = await db.query("INSERT IGNORE INTO referral_topups (topup_id, referral_id, amount, approved_at) VALUES (?, ?, ?, ?)", [topup.id, referral.id, amount, now]);
        if (!added.affectedRows) return { status: "unchanged" };
        await db.query("UPDATE referrals SET progress_amount = ? WHERE id = ?", [progress, referral.id]);
        referral.progress_amount = progress;
        await audit(db, referral.id, actorUserId, "progress", { topupId: topup.id, amount, progress });
        if (progress < Number(referral.minimum_topup)) return { status: "pending", progressAmount: progress, remainingAmount: Number(referral.minimum_topup) - progress };
        await db.query("UPDATE referrals SET qualifying_topup_id = ?, qualified_at = ? WHERE id = ?", [topup.id, now, referral.id]);
    }
    const [users] = await db.query("SELECT id, status, role, currency FROM users WHERE id IN (?, ?) ORDER BY id FOR UPDATE", [referral.referrer_user_id, referral.referred_user_id]);
    if (Number(referral.referrer_user_id) === Number(referral.referred_user_id) || users.length !== 2 || !users.every(isEligibleUser)) {
        return transition(db, referral, "review", "user_not_eligible", actorUserId);
    }
    const [wallets] = await db.query("SELECT id, balance, currency FROM wallets WHERE user_id = ? LIMIT 1 FOR UPDATE", [referral.referrer_user_id]);
    let wallet = wallets[0];
    if (!wallet) {
        const [created] = await db.query("INSERT INTO wallets (user_id, balance, currency) VALUES (?, 0, 'COP')", [referral.referrer_user_id]);
        wallet = { id: created.insertId, balance: 0, currency: "COP" };
    }
    if (wallet.currency !== "COP") return transition(db, referral, "review", "wallet_currency", actorUserId);
    const settings = await getSettings(db, true);
    const month = monthBounds(now);
    if (settings.monthlyRewardLimit > 0) {
        const [credited] = await db.query("SELECT id FROM referrals WHERE referrer_user_id = ? AND status IN ('credited', 'reversed') AND credited_at >= ? AND credited_at < ? FOR UPDATE", [referral.referrer_user_id, month.start, month.end]);
        if (credited.length >= settings.monthlyRewardLimit) return transition(db, referral, "review", "monthly_limit", actorUserId);
    }
    await db.query("INSERT IGNORE INTO referral_budget_usage (month_key, total_awarded) VALUES (?, 0)", [month.key]);
    const [[usage]] = await db.query("SELECT total_awarded FROM referral_budget_usage WHERE month_key = ? FOR UPDATE", [month.key]);
    const amount = Number(referral.reward_amount);
    if (settings.monthlyBudget > 0 && Number(usage.total_awarded) + amount > settings.monthlyBudget) return transition(db, referral, "review", "monthly_budget", actorUserId);
    const balance = Number((Number(wallet.balance) + amount).toFixed(2));
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(balance) || balance > 9999999999.99) throw domainError("No se pudo acreditar el premio. Revisa la billetera.", 409);
    await db.query("UPDATE wallets SET balance = ? WHERE id = ?", [balance, wallet.id]);
    const [credit] = await db.query("INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, reference_type, reference_id, note) VALUES (?, 'referral_bonus', ?, ?, 'referral', ?, ?)",
        [wallet.id, amount, balance, referral.id, "Premio por referido #" + referral.id]);
    await db.query("UPDATE referrals SET status = 'credited', reason = NULL, wallet_transaction_id = ?, credited_at = ? WHERE id = ?", [credit.insertId, now, referral.id]);
    await db.query("UPDATE referral_budget_usage SET total_awarded = total_awarded + ? WHERE month_key = ?", [amount, month.key]);
    await db.query("INSERT INTO user_notifications (user_id, message) VALUES (?, ?)", [referral.referrer_user_id, "Recibiste " + amount.toLocaleString("es-CO") + " COP por tu referido #" + referral.id + ". El premio ya está en tu saldo."]);
    await audit(db, referral.id, actorUserId, "credited", { amount, topupId: topup.id, transactionId: credit.insertId });
    return { status: "credited", amount };
}

async function reverseReferral(db, id, actorUserId, reason) {
    if (typeof reason !== "string" || reason.trim().length < 5 || reason.length > 500) throw domainError("El motivo de reversión no es válido.");
    const [[source]] = await db.query("SELECT referrer_user_id FROM referrals WHERE id = ?", [id]);
    if (!source) throw domainError("Referido no encontrado.", 404);
    // Match reward lock order: beneficiary user, wallet, then already credited records.
    await db.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [source.referrer_user_id]);
    const [[wallet]] = await db.query("SELECT id, balance, currency FROM wallets WHERE user_id = ? LIMIT 1 FOR UPDATE", [source.referrer_user_id]);
    const [[referral]] = await db.query("SELECT * FROM referrals WHERE id = ? FOR UPDATE", [id]);
    if (!referral || referral.status !== "credited" || !referral.wallet_transaction_id) throw domainError("Solo se puede revertir un premio acreditado, una sola vez.", 409);
    const amount = Number(referral.reward_amount);
    if (!Number.isFinite(amount) || amount <= 0) throw domainError("El valor del premio no es válido.", 409);
    if (!wallet || wallet.currency !== "COP" || !Number.isFinite(Number(wallet.balance)) || Number(wallet.balance) < amount) throw domainError("La billetera no tiene saldo COP suficiente. No se creará un saldo negativo; revisa el caso manualmente.", 409);
    const balance = Number((Number(wallet.balance) - amount).toFixed(2));
    await db.query("UPDATE wallets SET balance = ? WHERE id = ?", [balance, wallet.id]);
    const [debit] = await db.query("INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, reference_type, reference_id, note) VALUES (?, 'referral_reversal', ?, ?, 'referral', ?, ?)", [wallet.id, -amount, balance, id, "Reversión de premio por referido #" + id]);
    await db.query("UPDATE referrals SET status = 'reversed', reason = 'admin_reversed', reversal_transaction_id = ?, reversed_at = UTC_TIMESTAMP() WHERE id = ?", [debit.insertId, id]);
    await audit(db, id, actorUserId, "reversed", { reason, amount, transactionId: debit.insertId });
    await db.query("INSERT INTO user_notifications (user_id, message) VALUES (?, ?)", [referral.referrer_user_id, "Se revirtió el premio del referido #" + id + " por " + amount.toLocaleString("es-CO") + " COP. Puedes consultar el movimiento en tu billetera."]);
    return { status: "reversed", amount };
}

function buildFilters(input = {}, userId = null) {
    const clauses = ["1 = 1"];
    const params = [];
    if (userId != null) { clauses.push("r.referrer_user_id = ?"); params.push(userId); }
    if (input.status) {
        if (!STATES.includes(input.status)) throw domainError("Estado de referido no válido.");
        clauses.push("(" + EFFECTIVE_STATE + ") = ?"); params.push(input.status);
    }
    for (const key of ["from", "to"]) {
        if (!input[key]) continue;
        const day = String(input[key]);
        const parsed = new Date(day + "T00:00:00Z");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) throw domainError("Fecha no válida.");
        const date = new Date(day + "T00:00:00-05:00");
        if (key === "to") date.setTime(date.getTime() + 86400000);
        clauses.push("r.created_at " + (key === "from" ? ">=" : "<") + " ?"); params.push(date);
    }
    if (input.from && input.to && input.from > input.to) throw domainError("El rango de fechas no es válido.");
    if (userId == null && input.search) {
        const search = String(input.search).trim().slice(0, 120);
        clauses.push("(inviter.email LIKE ? OR invitee.email LIKE ? OR inviter.name LIKE ? OR invitee.name LIKE ? OR r.referral_code = ? OR r.id = ?)");
        params.push(...Array(4).fill("%" + search + "%"), search, /^\d+$/.test(search) ? search : 0);
    }
    return { where: " WHERE " + clauses.join(" AND "), params };
}

function mapReferral(row, admin = false) {
    const result = {
        id: row.id, status: row.effective_status || row.status, reason: row.reason,
        rewardAmount: Number(row.reward_amount), minimumTopup: Number(row.minimum_topup), currency: row.currency,
        createdAt: row.created_at, expiresAt: row.expires_at, creditedAt: row.credited_at,
    };
    const sharing = Boolean(row.contact_consent_at);
    Object.assign(result, {
        contactSharing: sharing,
        referredName: admin || sharing ? row.referred_name : null,
        referredEmail: admin || sharing ? row.referred_email : null,
        progressAmount: admin || sharing ? Number(row.progress_amount || 0) : null,
        remainingAmount: admin || sharing ? Math.max(0, Number(row.minimum_topup) - Number(row.progress_amount || 0)) : null,
    });
    if (admin) Object.assign(result, {
        referrerId: row.referrer_user_id, referrerName: row.referrer_name, referrerEmail: row.referrer_email,
        referredId: row.referred_user_id, referredName: row.referred_name, referredEmail: row.referred_email,
        code: row.referral_code, settingsVersion: row.settings_version, qualifyingTopupId: row.qualifying_topup_id,
        contactConsentAt: row.contact_consent_at,
        transactionId: row.wallet_transaction_id, qualifiedAt: row.qualified_at,
        reversalTransactionId: row.reversal_transaction_id, reversedAt: row.reversed_at,
    });
    return result;
}

async function listReferrals(input = {}, { userId = null, exportAll = false, db = pool } = {}) {
    const admin = userId == null;
    const { where, params } = buildFilters(input, userId);
    const joins = " JOIN users invitee ON invitee.id = r.referred_user_id" + (admin ? " JOIN users inviter ON inviter.id = r.referrer_user_id" : "");
    const [[summary]] = await db.query("SELECT COUNT(*) AS total, COALESCE(SUM(r.status = 'credited'), 0) AS credited, COALESCE(SUM(r.status = 'review'), 0) AS review, COALESCE(SUM(r.status = 'pending' AND r.expires_at > UTC_TIMESTAMP()), 0) AS pending, COALESCE(SUM(CASE WHEN r.status = 'credited' THEN r.reward_amount ELSE 0 END), 0) AS awarded FROM referrals r" + joins + where, params);
    const total = Number(summary.total);
    if (exportAll && total > 10000) throw domainError("Reduce el rango a un máximo de 10.000 referidos para exportar.", 422);
    const limit = exportAll ? Math.max(total, 1) : Math.min(100, Math.max(1, parseInt(input.limit, 10) || 20));
    const page = exportAll ? 1 : Math.min(Math.max(1, Math.ceil(total / limit)), Math.max(1, parseInt(input.page, 10) || 1));
    const fields = ", invitee.name AS referred_name, invitee.email AS referred_email" + (admin ? ", inviter.name AS referrer_name, inviter.email AS referrer_email" : "");
    const [rows] = await db.query("SELECT r.*, " + EFFECTIVE_STATE + " AS effective_status" + fields + " FROM referrals r" + joins + where + " ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?", [...params, limit, (page - 1) * limit]);
    return { items: rows.map(row => mapReferral(row, admin)), total, page, totalPages: Math.max(1, Math.ceil(total / limit)), summary: { total, credited: Number(summary.credited), review: Number(summary.review), pending: Number(summary.pending), awarded: Number(summary.awarded) } };
}

module.exports = {
    DEFAULT_SETTINGS, SETTINGS_KEY, STATES, EMAIL_INVITE_TTL_DAYS, domainError, normalizeSettings,
    validateSettings, campaignStatus, getSettings, saveSettings, audit, isEligibleUser, ensureReferralCode,
    normalizeInvitationEmail, hashEmailInviteToken, createEmailInvite, getEmailInvite, markEmailInviteSent,
    revokeEmailInvite, consumeEmailInviteForExistingUser, attachReferral, monthBounds, processTopupReferral,
    reverseReferral, buildFilters, mapReferral, listReferrals,
};
