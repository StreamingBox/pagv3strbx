const nodemailer = require("nodemailer");

const TEST_SUBJECT = "[PRUEBA] Actualización de tarifas Netflix | Streaming Box";
const TEST_TEXT = [
    "Hola, cliente.",
    "",
    "Netflix actualizó sus tarifas en Colombia. Desde el 23 de octubre, Streaming Box ajustará en $6.000 COP sus tarifas de Netflix por pantalla y Netflix Internacional.",
    "",
    "Este es un correo de prueba para revisión; no se ha enviado a clientes.",
    "",
    "Equipo Streaming Box",
].join("\n");

const TEST_HTML = `
<div style="margin:0;background:#eef1f6;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#172033">
  <div style="max-width:620px;margin:0 auto 12px;color:#566176;font-size:12px;font-weight:700">CORREO DE PRUEBA · SOLO PARA REVISIÓN</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
    <tr><td style="background:#111a2e;padding:22px 30px;color:#fff">
      <img src="https://strbx.com.co/favicon.svg" width="40" height="40" alt="" style="vertical-align:middle;margin-right:10px">
      <strong style="font-size:18px;vertical-align:middle">Streaming Box</strong>
      <span style="float:right;color:#c4d0e8;font-size:11px;font-weight:700">COMUNICADO A CLIENTES</span>
    </td></tr>
    <tr><td style="padding:32px 30px 12px">
      <div style="display:inline-block;padding:7px 11px;background:#fff0f0;color:#c81e2b;font-size:11px;font-weight:700">ACTUALIZACIÓN DE TARIFAS</div>
      <h1 style="margin:17px 0 10px;font-size:32px;line-height:1.12;color:#172033">Netflix se actualiza.<br>Te contamos desde cuándo.</h1>
      <p style="margin:0;color:#596579;font-size:16px;line-height:1.6">Hola, <strong style="color:#172033">cliente</strong>. Netflix ajustó sus tarifas en Colombia y queremos avisarte con tiempo sobre el cambio en nuestros servicios.</p>
    </td></tr>
    <tr><td style="padding:18px 30px 8px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#171a24;border-left:4px solid #e50914;border-radius:8px">
        <tr><td style="padding:22px 24px;color:#fff">
          <div style="color:#c8ced9;font-size:12px;font-weight:700">NUEVO AJUSTE</div>
          <div style="margin-top:4px;font-size:40px;font-weight:800">+$6.000 <span style="font-size:16px">COP</span></div>
          <div style="margin-top:12px;display:inline-block;padding:9px 12px;background:#e50914;font-size:16px;font-weight:800">VIGENTE DESDE EL 23 DE OCTUBRE</div>
          <p style="margin:14px 0 0;color:#e2e6ee;font-size:14px;line-height:1.55">El ajuste se aplicará a nuestras tarifas de Netflix por pantalla y Netflix Internacional.</p>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:18px 30px 8px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700">El ajuste aplica a estas modalidades:</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td width="50%" style="padding:12px;border:1px solid #e2e7ef;border-radius:8px"><span style="color:#e50914;font-size:11px;font-weight:700">NETFLIX</span><br><strong>Por pantalla</strong></td>
        <td width="50%" style="padding:12px;border:1px solid #e2e7ef;border-radius:8px"><span style="color:#e50914;font-size:11px;font-weight:700">NETFLIX</span><br><strong>Internacional</strong></td>
      </tr></table>
      <p style="margin:16px 0 0;color:#596579;font-size:14px;line-height:1.6">El aumento oficial de Netflix varía según el plan y alcanza los $6.000 COP en Premium. En Streaming Box, el ajuste indicado para las dos modalidades anteriores será de $6.000 COP.</p>
    </td></tr>
    <tr><td style="padding:22px 30px 28px"><p style="margin:0;font-size:15px;line-height:1.55">Gracias por tu confianza y por seguir disfrutando tus contenidos con nosotros.</p><p style="margin:14px 0 0;font-size:14px;font-weight:700">Equipo Streaming Box</p></td></tr>
    <tr><td style="padding:14px;background:#f3f5f8;color:#788397;text-align:center;font-size:11px">Streaming Box · Comunicado de actualización de precios</td></tr>
  </table>
</div>`;

function getNewsletterMailConfig(env = process.env) {
    const newsletterHost = String(env.NEWSLETTER_SMTP_HOST || "").trim();
    const newsletterUser = String(env.NEWSLETTER_SMTP_USER || "").trim();
    const newsletterPass = String(env.NEWSLETTER_SMTP_PASS || "").trim();
    const newsletterOverride = Boolean(newsletterHost || newsletterUser || newsletterPass);
    if (newsletterOverride && !(newsletterUser && newsletterPass && (newsletterHost || env.SMTP_HOST))) {
        throw new Error("Configura NEWSLETTER_SMTP_USER y NEWSLETTER_SMTP_PASS; el host puede reutilizar SMTP_HOST.");
    }

    const smtpHost = String(newsletterHost || env.SMTP_HOST || "").trim();
    const smtpUser = String(newsletterUser || env.SMTP_USER || "").trim();
    const smtpPass = String(newsletterPass || env.SMTP_PASS || "").trim();
    const gmailUser = String(env.GMAIL_EMAIL || "").trim();
    const gmailPass = String(env.GMAIL_IMAP_PASS || "").trim();
    const hasSmtp = Boolean(smtpHost && smtpUser && smtpPass);
    const hasGmail = Boolean(gmailUser && gmailPass);
    if (!hasSmtp && !hasGmail) {
        throw new Error("No hay transporte SMTP configurado para Newsletter.");
    }

    const port = Number(env.NEWSLETTER_SMTP_PORT || env.SMTP_PORT || 587);
    if (hasSmtp && (!Number.isInteger(port) || port < 1 || port > 65535)) {
        throw new Error("El puerto SMTP de Newsletter debe ser válido.");
    }

    const user = hasSmtp ? smtpUser : gmailUser;
    return {
        from: String(env.NEWSLETTER_MAIL_FROM || "Newsletter <novedades@strbx.com.co>").trim(),
        transport: hasSmtp
            ? {
                host: smtpHost,
                port,
                secure: String(env.NEWSLETTER_SMTP_SECURE || env.SMTP_SECURE || "false").trim().toLowerCase() === "true",
                auth: { user, pass: smtpPass },
                tls: {
                    rejectUnauthorized: String(env.NEWSLETTER_SMTP_TLS_REJECT_UNAUTHORIZED || env.SMTP_TLS_REJECT_UNAUTHORIZED || "true").trim().toLowerCase() !== "false",
                    servername: smtpHost,
                },
                connectionTimeout: Number(env.NEWSLETTER_SMTP_CONNECTION_TIMEOUT_MS || env.SMTP_CONNECTION_TIMEOUT_MS || 30000),
                greetingTimeout: Number(env.NEWSLETTER_SMTP_GREETING_TIMEOUT_MS || env.SMTP_GREETING_TIMEOUT_MS || 30000),
                socketTimeout: Number(env.NEWSLETTER_SMTP_SOCKET_TIMEOUT_MS || env.SMTP_SOCKET_TIMEOUT_MS || 60000),
            }
            : {
                service: "gmail",
                auth: { user: gmailUser, pass: gmailPass },
            },
    };
}

function getTestRecipient(env = process.env) {
    const recipient = String(env.NEWSLETTER_TEST_TO || "").trim();
    if (!recipient || /[,;\s]/.test(recipient) || !/^[^@]+@[^@]+\.[^@]+$/.test(recipient)) {
        throw new Error("NEWSLETTER_TEST_TO debe ser una sola dirección de correo válida.");
    }
    return recipient;
}

async function sendNewsletterTestEmail({ env = process.env, createTransport = nodemailer.createTransport } = {}) {
    const config = getNewsletterMailConfig(env);
    const recipient = getTestRecipient(env);
    const transporter = createTransport(config.transport);
    try {
        await transporter.sendMail({
            from: config.from,
            to: recipient,
            subject: TEST_SUBJECT,
            text: TEST_TEXT,
            html: TEST_HTML,
        });
        return { ok: true };
    } finally {
        transporter.close?.();
    }
}

module.exports = {
    getNewsletterMailConfig,
    getTestRecipient,
    sendNewsletterTestEmail,
};
