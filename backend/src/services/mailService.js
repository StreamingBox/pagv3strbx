const nodemailer = require("nodemailer");

let transporterPromise = null;

function getMailConfig() {
    const smtpHost = String(process.env.SMTP_HOST || "").trim();
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpUser = String(process.env.SMTP_USER || "").trim();
    const smtpPass = String(process.env.SMTP_PASS || "").trim();
    const smtpSecure = String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true";

    if (smtpHost && smtpUser && smtpPass) {
        return {
            from: String(process.env.MAIL_FROM || `${process.env.APP_NAME || "Streaming Box"} <${smtpUser}>`).trim(),
            transport: {
                host: smtpHost,
                port: smtpPort,
                secure: smtpSecure,
                auth: {
                    user: smtpUser,
                    pass: smtpPass,
                },
            },
        };
    }

    const gmailUser = String(process.env.GMAIL_EMAIL || "").trim();
    const gmailPass = String(process.env.GMAIL_IMAP_PASS || "").trim();
    if (gmailUser && gmailPass) {
        return {
            from: String(process.env.MAIL_FROM || `${process.env.APP_NAME || "Streaming Box"} <${gmailUser}>`).trim(),
            transport: {
                service: "gmail",
                auth: {
                    user: gmailUser,
                    pass: gmailPass,
                },
            },
        };
    }

    return null;
}

async function getTransporter() {
    if (!transporterPromise) {
        const config = getMailConfig();
        if (!config) return null;
        transporterPromise = Promise.resolve(nodemailer.createTransport(config.transport));
    }
    return transporterPromise;
}

async function sendPasswordResetEmail({ to, name, resetUrl, expiresMinutes }) {
    const safeTo = String(to || "").trim();
    if (!safeTo) throw new Error("Destino de correo inválido.");

    const appName = process.env.APP_NAME || "Streaming Box";
    const config = getMailConfig();
    if (!config) {
        console.warn(`[mail] No hay SMTP configurado. Link de reseteo para ${safeTo}: ${resetUrl}`);
        return { ok: true, delivery: "log" };
    }

    const transporter = await getTransporter();
    const greetingName = String(name || "").trim() || "usuario";
    const subject = `${appName}: restablece tu contraseña`;
    const text = [
        `Hola ${greetingName},`,
        "",
        "Recibimos una solicitud para restablecer tu contraseña.",
        `Usa este enlace dentro de los próximos ${expiresMinutes} minutos:`,
        resetUrl,
        "",
        "Si no solicitaste este cambio, puedes ignorar este mensaje.",
    ].join("\n");

    const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6">
            <h2 style="margin:0 0 16px;color:#1d4ed8">${appName}</h2>
            <p>Hola ${greetingName},</p>
            <p>Recibimos una solicitud para restablecer tu contraseña.</p>
            <p>
                <a href="${resetUrl}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700">
                    Restablecer contraseña
                </a>
            </p>
            <p>Este enlace vence en ${expiresMinutes} minutos.</p>
            <p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
            <p style="font-size:12px;color:#64748b;word-break:break-all">${resetUrl}</p>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: config.from,
            to: safeTo,
            subject,
            text,
            html,
        });
        return { ok: true, delivery: "email" };
    } catch (err) {
        console.error("[mail] Error enviando correo:", err?.message || err);
        console.warn(`[mail] Fallback a log. Link de reseteo para ${safeTo}: ${resetUrl}`);
        return { ok: true, delivery: "log" };
    }
}

module.exports = {
    sendPasswordResetEmail,
};
