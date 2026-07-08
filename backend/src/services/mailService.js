const nodemailer = require("nodemailer");
const crypto = require("crypto");
const {
    activationServiceName,
    isAssistedActivationProduct,
    salesContactPhone,
} = require("../utils/deliveryMessage");

let transporterPromise = null;
let salesTransporterPromise = null;
let topupTransporterPromise = null;
let stockTransporterPromise = null;
let supportTransporterPromise = null;

function redactResetUrlForLog(resetUrl) {
    const s = String(resetUrl || "");
    try {
        const u = new URL(s, "http://local.invalid");
        const t = u.searchParams.get("token");
        if (t) {
            const hash = crypto.createHash("sha256").update(t).digest("hex").slice(0, 8);
            u.searchParams.set("token", `[redacted:${hash}]`);
            return u.toString();
        }
    } catch {
        // ignore
    }
    return "[reset URL redacted]";
}

function buildMailConfig(prefix = "") {
    const smtpHost = String(process.env[`${prefix}SMTP_HOST`] || "").trim();
    const smtpPort = Number(process.env[`${prefix}SMTP_PORT`] || 587);
    const smtpUser = String(process.env[`${prefix}SMTP_USER`] || "").trim();
    const smtpPass = String(process.env[`${prefix}SMTP_PASS`] || "").trim();
    const smtpSecure = String(process.env[`${prefix}SMTP_SECURE`] || "").trim().toLowerCase() === "true";
    const rejectUnauthorized = String(
        process.env[`${prefix}SMTP_TLS_REJECT_UNAUTHORIZED`] ??
        process.env.SMTP_TLS_REJECT_UNAUTHORIZED ??
        "true"
    ).trim().toLowerCase() !== "false";
    const from = String(
        process.env[`${prefix}MAIL_FROM`] ||
        process.env.MAIL_FROM ||
        `${process.env.APP_NAME || "Streaming Box"} <${smtpUser}>`
    ).trim();

    if (smtpHost && smtpUser && smtpPass) {
        return {
            from,
            transport: {
                host: smtpHost,
                port: smtpPort,
                secure: smtpSecure,
                auth: {
                    user: smtpUser,
                    pass: smtpPass,
                },
                tls: {
                    rejectUnauthorized,
                    servername: smtpHost,
                },
                connectionTimeout: Number(process.env[`${prefix}SMTP_CONNECTION_TIMEOUT_MS`] || process.env.SMTP_CONNECTION_TIMEOUT_MS || 30000),
                greetingTimeout: Number(process.env[`${prefix}SMTP_GREETING_TIMEOUT_MS`] || process.env.SMTP_GREETING_TIMEOUT_MS || 30000),
                socketTimeout: Number(process.env[`${prefix}SMTP_SOCKET_TIMEOUT_MS`] || process.env.SMTP_SOCKET_TIMEOUT_MS || 60000),
            },
        };
    }

    const gmailUser = String(process.env.GMAIL_EMAIL || "").trim();
    const gmailPass = String(process.env.GMAIL_IMAP_PASS || "").trim();
    if (gmailUser && gmailPass) {
        return {
            from: String(
                process.env[`${prefix}MAIL_FROM`] ||
                process.env.MAIL_FROM ||
                `${process.env.APP_NAME || "Streaming Box"} <${gmailUser}>`
            ).trim(),
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

function getMailConfig() {
    return buildMailConfig("");
}

function getSalesMailConfig() {
    return buildMailConfig("SALES_") || getMailConfig();
}

function getTopupMailConfig() {
    const config = buildMailConfig("TOPUP_") || getMailConfig();
    if (!config) return null;
    return {
        ...config,
        from: String(process.env.TOPUP_MAIL_FROM || config.from || "Streaming Box Recargas <recargas@strbx.com.co>").trim(),
    };
}

function getStockMailConfig() {
    const config = buildMailConfig("STOCK_") || getMailConfig();
    if (!config) return null;
    return {
        ...config,
        from: String(process.env.STOCK_MAIL_FROM || config.from || "Streaming Box Stock <stock@strbx.com.co>").trim(),
    };
}

function getSupportMailConfig() {
    const config = buildMailConfig("SUPPORT_") || getMailConfig();
    if (!config) return null;
    return {
        ...config,
        from: String(
            process.env.SUPPORT_MAIL_FROM ||
            config.from ||
            "Streaming Box Soporte <soporte@strbx.com.co>"
        ).trim(),
    };
}

async function getTransporter(kind = "default") {
    const isSales = kind === "sales";
    const isTopup = kind === "topup";
    const isStock = kind === "stock";
    const isSupport = kind === "support";
    if (isSales) {
        if (!salesTransporterPromise) {
            const config = getSalesMailConfig();
            if (!config) return null;
            salesTransporterPromise = Promise.resolve(nodemailer.createTransport(config.transport));
        }
        return salesTransporterPromise;
    }

    if (isTopup) {
        if (!topupTransporterPromise) {
            const config = getTopupMailConfig();
            if (!config) return null;
            topupTransporterPromise = Promise.resolve(nodemailer.createTransport(config.transport));
        }
        return topupTransporterPromise;
    }

    if (isStock) {
        if (!stockTransporterPromise) {
            const config = getStockMailConfig();
            if (!config) return null;
            stockTransporterPromise = Promise.resolve(nodemailer.createTransport(config.transport));
        }
        return stockTransporterPromise;
    }

    if (isSupport) {
        if (!supportTransporterPromise) {
            const config = getSupportMailConfig();
            if (!config) return null;
            supportTransporterPromise = Promise.resolve(nodemailer.createTransport(config.transport));
        }
        return supportTransporterPromise;
    }

    if (!transporterPromise) {
        const config = getMailConfig();
        if (!config) return null;
        transporterPromise = Promise.resolve(nodemailer.createTransport(config.transport));
    }
    return transporterPromise;
}

function formatDateTime(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("es-CO", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "America/Bogota",
    }).format(date);
}

function formatDateOnly(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("es-CO", {
        dateStyle: "long",
        timeZone: "America/Bogota",
    }).format(date);
}

function formatMoney(value, currency = "COP") {
    return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: currency || "COP",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Number(value || 0));
}

function formatTopupAmount(value, currency) {
    const normalized = String(currency || "").trim().toUpperCase();
    if (normalized === "USD") {
        return `${Number(value || 0).toLocaleString("es-CO")} USDT`;
    }
    return formatMoney(value, normalized || "COP");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function buildCredentialFields(result) {
    const account = result?.account || {};
    const fields = [];

    fields.push({
        label: "ID de entrega",
        value: result?.subscriptionId ? String(result.subscriptionId) : null,
    });

    if (account.email) fields.push({ label: "Correo", value: account.email, type: "email" });
    if (account.password) fields.push({ label: "Contrasena", value: account.password, type: "code" });

    if (account.profile_number !== null && account.profile_number !== undefined && String(account.profile_number).trim() !== "") {
        fields.push({ label: "Perfil", value: String(account.profile_number) });
    }

    if (account.pin !== null && account.pin !== undefined && String(account.pin).trim() !== "") {
        fields.push({ label: "PIN", value: String(account.pin), type: "code" });
    }

    if (account.access_url) {
        fields.push({ label: "URL de acceso", value: account.access_url, type: "link" });
    }

    if (result?.expiresAt) {
        fields.push({ label: "Expira", value: formatDateTime(result.expiresAt) || formatDateOnly(result.expiresAt) });
    }

    if (!fields.some((field) => field.label === "Correo" || field.label === "Contrasena")) {
        fields.push({
            label: "Entrega",
            value: "Tu entrega fue registrada. Si este producto requiere activacion manual, revisa tu panel o contacta soporte.",
        });
    }

    return fields.filter((field) => field.value);
}

function renderHtmlField(field) {
    const label = escapeHtml(field.label);
    const value = String(field.value || "");

    if (field.type === "link") {
        const safeHref = escapeHtml(value);
        return `<div style="margin:0 0 10px;font-size:15px;color:#334155"><strong style="color:#0f172a">${label}:</strong> <a href="${safeHref}" style="color:#2563eb;text-decoration:none;word-break:break-all">${safeHref}</a></div>`;
    }

    if (field.type === "email") {
        const safeMail = escapeHtml(value);
        return `<div style="margin:0 0 10px;font-size:15px;color:#334155"><strong style="color:#0f172a">${label}:</strong> <a href="mailto:${safeMail}" style="color:#2563eb;text-decoration:none;word-break:break-all">${safeMail}</a></div>`;
    }

    if (field.type === "code") {
        return `<div style="margin:0 0 10px;font-size:15px;color:#334155"><strong style="color:#0f172a">${label}:</strong> <span style="display:inline-block;background:#e2e8f0;border-radius:8px;padding:4px 8px;font-family:Consolas,Monaco,'Courier New',monospace;color:#0f172a;word-break:break-all">${escapeHtml(value)}</span></div>`;
    }

    return `<div style="margin:0 0 10px;font-size:15px;color:#334155"><strong style="color:#0f172a">${label}:</strong> ${escapeHtml(value)}</div>`;
}

function renderTextField(field) {
    return `${field.label}: ${field.value}`;
}

async function sendPasswordResetEmail({ to, name, resetUrl, expiresMinutes }) {
    const safeTo = String(to || "").trim();
    if (!safeTo) throw new Error("Destino de correo invalido.");

    const appName = process.env.APP_NAME || "Streaming Box";
    const config = getMailConfig();
    if (!config) {
        console.warn(`[mail] No hay SMTP configurado. Link de reseteo para ${safeTo}: ${redactResetUrlForLog(resetUrl)}`);
        return { ok: true, delivery: "log" };
    }

    const transporter = await getTransporter();
    const greetingName = String(name || "").trim() || "usuario";
    const subject = `${appName}: restablece tu contrasena`;
    const text = [
        `Hola ${greetingName},`,
        "",
        "Recibimos una solicitud para restablecer tu contrasena.",
        `Usa este enlace dentro de los proximos ${expiresMinutes} minutos:`,
        resetUrl,
        "",
        "Si no solicitaste este cambio, puedes ignorar este mensaje.",
    ].join("\n");

    const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6">
            <h2 style="margin:0 0 16px;color:#1d4ed8">${appName}</h2>
            <p>Hola ${escapeHtml(greetingName)},</p>
            <p>Recibimos una solicitud para restablecer tu contrasena.</p>
            <p>
                <a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700">
                    Restablecer contrasena
                </a>
            </p>
            <p>Este enlace vence en ${escapeHtml(expiresMinutes)} minutos.</p>
            <p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
            <p style="font-size:12px;color:#64748b;word-break:break-all">${escapeHtml(resetUrl)}</p>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: config.from,
            to: safeTo,
            replyTo: config.from,
            subject,
            text,
            html,
            headers: {
                "Auto-Submitted": "auto-generated",
                "X-Auto-Response-Suppress": "All",
            },
        });
        return { ok: true, delivery: "email" };
    } catch (err) {
        console.error("[mail] Error enviando correo:", err?.message || err);
        console.warn(`[mail] Fallback a log. Link de reseteo para ${safeTo}: ${redactResetUrlForLog(resetUrl)}`);
        return { ok: true, delivery: "log" };
    }
}

async function sendOrderDeliveryEmail({ to, name, orderCode, total, currency, results, paymentMethod = "Balance de cuenta" }) {
    const safeTo = String(to || "").trim();
    if (!safeTo) throw new Error("Destino de correo invalido.");

    const appName = process.env.APP_NAME || "Streaming Box";
    const baseUrl = String(process.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
    const config = getSalesMailConfig();

    if (!config) {
        console.warn(`[mail] No hay SMTP configurado para ventas. Orden ${orderCode} para ${safeTo} no enviada por email.`);
        return { ok: true, delivery: "log" };
    }

    const transporter = await getTransporter("sales");
    const greetingName = String(name || "").trim() || "cliente";
    const subject = `${appName} | Orden ${orderCode} entregada`;
    const totalText = formatMoney(total, currency);
    const orderDateText = formatDateTime(new Date());
    const contactPhone = salesContactPhone();

    const normalizedResults = Array.isArray(results) ? results : [];
    const itemCount = normalizedResults.length;

    const itemBlocksText = normalizedResults.map((result, index) => {
        const plan = result?.plan || {};
        const platformLabel = result?.purchasedPlatformName || result?.platformName || plan.platform_name || "Producto";
        const assistedActivation = isAssistedActivationProduct(platformLabel);
        const credentialUrl = !assistedActivation && result?.token ? `${baseUrl}/s/${result.token}` : null;
        const fields = assistedActivation
            ? [{
                label: "Activación",
                value: `Comunícate al WhatsApp ${contactPhone} para que te ayuden con la activación. Indica la orden ${orderCode}.`,
            }]
            : buildCredentialFields(result);
        const lines = [`🆔 ID: ${result?.subscriptionId || "-"} | 🖥️ ${platformLabel}`];
        for (const field of fields) {
            if (field.label === "Correo") lines.push(`📧 ${renderTextField(field)}`);
            else if (field.label === "Contrasena") lines.push(`🔑 ${renderTextField(field)}`);
            else if (field.label === "Perfil") lines.push(`👤 ${renderTextField(field)}`);
            else if (field.label === "PIN") lines.push(`🔐 ${renderTextField(field)}`);
            else if (field.label === "Expira") lines.push(`📅 ${renderTextField(field)}`);
            else lines.push(renderTextField(field));
        }
        if (credentialUrl) lines.push(`🔗 Acceso seguro: ${credentialUrl}`);
        return lines.join("\n");
    }).join("\n\n");

    const text = [
        `Hola ${greetingName},`,
        "",
        "Tu compra fue entregada correctamente. Guarda esta informacion en un lugar seguro.",
        "",
        `🧾 Orden: ${orderCode}`,
        `📦 Pedido multiple (${itemCount} item${itemCount === 1 ? "" : "s"})`,
        `💳 Metodo de pago: ${paymentMethod}`,
        `💰 Total pagado: ${totalText}`,
        "",
        itemBlocksText,
        "",
        contactPhone ? `📞 Ventas y soporte: ${contactPhone}` : "",
        "Si no reconoces esta compra, responde a este correo.",
    ].join("\n");

    const itemBlocksHtml = normalizedResults.map((result, index) => {
        const plan = result?.plan || {};
        const platformLabel = result?.purchasedPlatformName || result?.platformName || plan.platform_name || "Producto";
        const assistedActivation = isAssistedActivationProduct(platformLabel);
        const credentialUrl = !assistedActivation && result?.token ? `${baseUrl}/s/${result.token}` : null;
        const fields = assistedActivation
            ? [{
                label: "Activación",
                value: `Comunícate al WhatsApp ${contactPhone} para que te ayuden con la activación. Indica la orden ${orderCode} y el producto ${activationServiceName(platformLabel)}.`,
            }]
            : buildCredentialFields(result);

        return `
            <div style="border:1px solid #cfd8ea;border-radius:16px;padding:18px 18px 14px;margin:0 0 18px;background:#f8fbff">
                <div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#2557d6;margin:0 0 10px">📦 Licencia #${index + 1}</div>
                <div style="font-size:19px;font-weight:800;color:#0f172a;margin:0 0 8px">${escapeHtml(platformLabel)}</div>
                <div style="font-size:15px;color:#334155;margin:0 0 12px"><strong style="color:#0f172a">🆔 ID:</strong> ${escapeHtml(result?.subscriptionId || "-")}</div>
                ${fields.map(renderHtmlField).join("")}
                ${credentialUrl ? `<div style="margin-top:12px"><a href="${escapeHtml(credentialUrl)}" style="display:inline-block;background:#2557d6;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 14px;border-radius:10px">🔗 Abrir acceso seguro</a></div>` : ""}
            </div>
        `;
    }).join("");

    const html = `
        <div style="margin:0;padding:28px;background:#eaf0ff;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
            <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #dbe4f5;border-radius:20px;overflow:hidden">
                <div style="background:#131a2a;padding:28px 30px;color:#ffffff">
                    <div style="font-size:18px;font-weight:700;opacity:.92;margin:0 0 8px">${escapeHtml(appName)}</div>
                    <div style="font-size:30px;font-weight:900;line-height:1.1;margin:0 0 6px">Compra exitosa</div>
                    <div style="font-size:15px;color:#cbd5e1">Tu orden fue entregada correctamente.</div>
                </div>
                <div style="padding:30px">
                    <div style="font-size:16px;font-weight:700;margin:0 0 10px">Hola ${escapeHtml(greetingName)},</div>
                    <div style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 22px">
                        Tu orden fue entregada correctamente. Guarda esta informacion en un lugar seguro.
                    </div>

                    <div style="border:1px solid #d8e1f0;border-radius:16px;background:#f8fbff;padding:16px 18px;margin:0 0 20px">
                        <div style="font-size:15px;color:#334155;margin:0 0 8px"><strong style="color:#0f172a">🧾 Orden:</strong> ${escapeHtml(orderCode)}</div>
                        <div style="font-size:15px;color:#334155;margin:0 0 8px"><strong style="color:#0f172a">📦 Pedido multiple:</strong> ${escapeHtml(String(itemCount))} item${itemCount === 1 ? "" : "s"}</div>
                        <div style="font-size:15px;color:#334155;margin:0 0 8px"><strong style="color:#0f172a">💳 Metodo de pago:</strong> ${escapeHtml(paymentMethod)}</div>
                        <div style="font-size:15px;color:#334155;margin:0 0 8px"><strong style="color:#0f172a">💰 Total pagado:</strong> ${escapeHtml(totalText)}</div>
                        <div style="font-size:14px;color:#64748b"><strong style="color:#334155">🕒 Fecha de entrega:</strong> ${escapeHtml(orderDateText)}</div>
                    </div>

                    ${itemBlocksHtml}

                    <div style="border:1px solid #d8e1f0;border-radius:16px;background:#ffffff;padding:16px 18px;margin-top:8px">
                        <div style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 8px">📞 Contacto de ventas</div>
                        <div style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 10px">
                            Si necesitas ayuda con esta entrega o con una renovacion, puedes comunicarte con ventas.
                        </div>
                        <div style="font-size:15px;color:#334155;margin:0 0 10px"><strong>Telefono:</strong> ${escapeHtml(contactPhone)}</div>
                    </div>

                    <div style="font-size:13px;line-height:1.6;color:#64748b;margin-top:8px">
                        Este es un correo transaccional relacionado con tu compra. Si no reconoces esta orden, responde a este mensaje.
                    </div>
                </div>
            </div>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: config.from,
            to: safeTo,
            replyTo: config.from,
            subject,
            text,
            html,
            headers: {
                "Auto-Submitted": "auto-generated",
                "X-Auto-Response-Suppress": "All",
                "X-Entity-Ref-ID": String(orderCode || ""),
            },
        });
        return { ok: true, delivery: "email" };
    } catch (err) {
        console.error("[mail] Error enviando correo de venta:", err?.message || err);
        return { ok: false, delivery: "error", message: err?.message || "No se pudo enviar el correo." };
    }
}

function buildTopupEmailShell({ title, subtitle, bodyHtml }) {
    const appName = process.env.APP_NAME || "Streaming Box";
    return `
        <div style="margin:0;padding:28px;background:#eaf0ff;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
            <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dbe4f5;border-radius:20px;overflow:hidden">
                <div style="background:#131a2a;padding:28px 30px;color:#ffffff">
                    <div style="font-size:18px;font-weight:700;opacity:.92;margin:0 0 8px">${escapeHtml(appName)}</div>
                    <div style="font-size:28px;font-weight:900;line-height:1.1;margin:0 0 6px">${escapeHtml(title)}</div>
                    <div style="font-size:15px;color:#cbd5e1">${escapeHtml(subtitle)}</div>
                </div>
                <div style="padding:30px">${bodyHtml}</div>
            </div>
        </div>
    `;
}

async function sendTopupLifecycleEmail({ to, subject, greetingName, title, subtitle, intro, amount, currency, requestCode, statusLabel, adminNote }) {
    const safeTo = String(to || "").trim();
    if (!safeTo) throw new Error("Destino de correo invalido.");

    const config = getTopupMailConfig();
    if (!config) {
        console.warn(`[mail] No hay SMTP configurado para recargas. Solicitud ${requestCode} para ${safeTo} no enviada por email.`);
        return { ok: true, delivery: "log" };
    }

    const transporter = await getTransporter("topup");
    const amountText = formatTopupAmount(amount, currency || "USD");
    const text = [
        `Hola ${greetingName || "cliente"},`,
        "",
        intro,
        "",
        `Solicitud: ${requestCode}`,
        `Estado: ${statusLabel}`,
        `Monto: ${amountText}`,
        adminNote ? `Nota: ${adminNote}` : "",
    ].filter(Boolean).join("\n");

    const bodyHtml = `
        <div style="font-size:16px;font-weight:700;margin:0 0 10px">Hola ${escapeHtml(greetingName || "cliente")},</div>
        <div style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 20px">${escapeHtml(intro)}</div>
        <div style="border:1px solid #d8e1f0;border-radius:16px;background:#f8fbff;padding:16px 18px;margin:0 0 18px">
            <div style="font-size:15px;color:#334155;margin:0 0 8px"><strong style="color:#0f172a">Solicitud:</strong> ${escapeHtml(requestCode)}</div>
            <div style="font-size:15px;color:#334155;margin:0 0 8px"><strong style="color:#0f172a">Estado:</strong> ${escapeHtml(statusLabel)}</div>
            <div style="font-size:15px;color:#334155;margin:0 0 8px"><strong style="color:#0f172a">Monto:</strong> ${escapeHtml(amountText)}</div>
            ${adminNote ? `<div style="font-size:15px;color:#334155"><strong style="color:#0f172a">Nota:</strong> ${escapeHtml(adminNote)}</div>` : ""}
        </div>
        <div style="font-size:13px;line-height:1.6;color:#64748b">
            Este es un correo transaccional relacionado con tu recarga. Si no reconoces esta solicitud, responde a este mensaje.
        </div>
    `;

    try {
        await transporter.sendMail({
            from: config.from,
            to: safeTo,
            replyTo: config.from,
            subject,
            text,
            html: buildTopupEmailShell({ title, subtitle, bodyHtml }),
            headers: {
                "Auto-Submitted": "auto-generated",
                "X-Auto-Response-Suppress": "All",
                "X-Entity-Ref-ID": String(requestCode || ""),
            },
        });
        return { ok: true, delivery: "email" };
    } catch (err) {
        console.error("[mail] Error enviando correo de recarga:", err?.message || err);
        return { ok: false, delivery: "error", message: err?.message || "No se pudo enviar el correo." };
    }
}

async function sendTopupSubmittedEmail({ to, name, requestCode, amount, currency }) {
    return sendTopupLifecycleEmail({
        to,
        greetingName: name,
        requestCode,
        amount,
        currency,
        subject: `Streaming Box | Recarga recibida ${requestCode}`,
        title: "Comprobante recibido",
        subtitle: "Tu recarga fue cargada exitosamente y esta en revision.",
        intro: "Recibimos tu comprobante de recarga. Nuestro equipo lo va a revisar y te avisaremos cuando cambie de estado.",
        statusLabel: "En revision inicial",
    });
}

async function sendTopupReviewingEmail({ to, name, requestCode, amount, currency, adminNote }) {
    return sendTopupLifecycleEmail({
        to,
        greetingName: name,
        requestCode,
        amount,
        currency,
        adminNote,
        subject: `Streaming Box | Estamos revisando tu recarga ${requestCode}`,
        title: "Recarga en revision",
        subtitle: "Ya estamos manejando tu transaccion.",
        intro: "Tu recarga ya fue tomada por un administrador y esta siendo revisada.",
        statusLabel: "Revisando",
    });
}

async function sendTopupApprovedEmail({ to, name, requestCode, amount, currency, adminNote }) {
    return sendTopupLifecycleEmail({
        to,
        greetingName: name,
        requestCode,
        amount,
        currency,
        adminNote,
        subject: `Streaming Box | Recarga exitosa ${requestCode}`,
        title: "Recarga aprobada",
        subtitle: "Tu saldo ya fue acreditado correctamente.",
        intro: "La recarga fue aprobada y el saldo ya esta disponible para usar dentro de la plataforma.",
        statusLabel: "Aprobada",
    });
}

async function sendTopupRejectedEmail({ to, name, requestCode, amount, currency, adminNote }) {
    return sendTopupLifecycleEmail({
        to,
        greetingName: name,
        requestCode,
        amount,
        currency,
        adminNote,
        subject: `Streaming Box | Recarga rechazada ${requestCode}`,
        title: "Recarga rechazada",
        subtitle: "Tu solicitud no pudo ser aprobada.",
        intro: "La recarga fue revisada pero no pudo aprobarse. Revisa la nota del administrador y vuelve a cargar el comprobante si hace falta.",
        statusLabel: "Rechazada",
    });
}

function buildStockAvailableEmail({ greetingName, platformName, durationName, dashboardUrl }) {
    const appName = process.env.APP_NAME || "Streaming Box";
    const productLabel = String(platformName || "este producto").trim();
    const durationLabel = String(durationName || "").trim();
    const safeDashboardUrl = String(dashboardUrl || "").trim();
    const subject = `${appName} | Ya hay stock de ${productLabel}`;

    const text = [
        `Hola ${greetingName || "cliente"},`,
        "",
        "Ya volvio el stock del producto que solicitaste:",
        "",
        `Producto: ${productLabel}`,
        durationLabel ? `Duracion: ${durationLabel}` : "",
        "Estado: Disponible nuevamente",
        "",
        safeDashboardUrl
            ? `Puedes entrar y comprarlo antes de que se agote: ${safeDashboardUrl}`
            : "Puedes entrar a Streaming Box y comprarlo antes de que se agote.",
        "",
        "Este aviso se envia porque pediste que te notificaramos cuando hubiera stock disponible.",
        "",
        appName,
    ].filter(Boolean).join("\n");

    const html = `
        <div style="margin:0;padding:28px;background:#eaf0ff;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
            <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dbe4f5;border-radius:20px;overflow:hidden">
                <div style="background:#111827;padding:28px 30px;color:#ffffff">
                    <div style="font-size:18px;font-weight:700;opacity:.92;margin:0 0 8px">${escapeHtml(appName)}</div>
                    <div style="font-size:28px;font-weight:900;line-height:1.1;margin:0 0 6px">Stock disponible</div>
                    <div style="font-size:15px;color:#cbd5e1">El producto que pediste ya volvio a estar disponible.</div>
                </div>
                <div style="padding:30px">
                    <div style="font-size:16px;font-weight:700;margin:0 0 10px">Hola ${escapeHtml(greetingName || "cliente")},</div>
                    <div style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 20px">
                        Ya volvio el stock del producto que solicitaste. Puedes comprarlo antes de que se agote nuevamente.
                    </div>
                    <div style="border:1px solid #d8e1f0;border-radius:16px;background:#f8fbff;padding:16px 18px;margin:0 0 20px">
                        <div style="font-size:15px;color:#334155;margin:0 0 8px"><strong style="color:#0f172a">Producto:</strong> ${escapeHtml(productLabel)}</div>
                        ${durationLabel ? `<div style="font-size:15px;color:#334155;margin:0 0 8px"><strong style="color:#0f172a">Duracion:</strong> ${escapeHtml(durationLabel)}</div>` : ""}
                        <div style="font-size:15px;color:#16a34a;font-weight:800">Disponible nuevamente</div>
                    </div>
                    ${safeDashboardUrl ? `
                        <div style="margin:0 0 20px">
                            <a href="${escapeHtml(safeDashboardUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;padding:12px 18px;border-radius:12px">
                                Comprar ahora
                            </a>
                        </div>
                    ` : ""}
                    <div style="font-size:13px;line-height:1.6;color:#64748b">
                        Este aviso se envia porque pediste que te notificaramos cuando hubiera stock disponible.
                    </div>
                </div>
            </div>
        </div>
    `;

    return { subject, text, html };
}

async function sendStockAvailableEmail({ to, name, platformName, durationName }) {
    const safeTo = String(to || "").trim();
    if (!safeTo) throw new Error("Destino de correo invalido.");

    const config = getStockMailConfig();
    if (!config) {
        console.warn(`[mail] No hay SMTP configurado para stock. Aviso de ${platformName || "producto"} para ${safeTo} no enviado por email.`);
        return { ok: true, delivery: "log" };
    }

    const transporter = await getTransporter("stock");
    const baseUrl = String(process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || "https://strbx.com.co").replace(/\/+$/, "");
    const dashboardUrl = `${baseUrl}/dashboard`;
    const greetingName = String(name || "").trim() || "cliente";
    const { subject, text, html } = buildStockAvailableEmail({
        greetingName,
        platformName,
        durationName,
        dashboardUrl,
    });

    try {
        await transporter.sendMail({
            from: config.from,
            to: safeTo,
            replyTo: config.from,
            subject,
            text,
            html,
            headers: {
                "Auto-Submitted": "auto-generated",
                "X-Auto-Response-Suppress": "All",
                "X-Entity-Ref-ID": `stock-${String(platformName || "producto").slice(0, 80)}`,
            },
        });
        return { ok: true, delivery: "email" };
    } catch (err) {
        console.error("[mail] Error enviando correo de stock:", err?.message || err);
        return { ok: false, delivery: "error", message: err?.message || "No se pudo enviar el correo." };
    }
}

function buildSupportEmailFrame({ title, subtitle, greetingName, body, details, footer }) {
    const appName = process.env.APP_NAME || "Streaming Box";
    const detailRows = details
        .filter((item) => item?.value !== null && item?.value !== undefined && String(item.value).trim())
        .map((item) => `
            <div style="margin:0 0 9px;font-size:15px;color:#334155">
                <strong style="color:#0f172a">${escapeHtml(item.label)}:</strong>
                ${escapeHtml(item.value)}
            </div>
        `)
        .join("");

    return `
        <div style="margin:0;padding:28px;background:#eaf0ff;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
            <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dbe4f5;border-radius:18px;overflow:hidden">
                <div style="background:#111827;padding:28px 30px;color:#ffffff">
                    <div style="font-size:18px;font-weight:700;opacity:.92;margin:0 0 8px">${escapeHtml(appName)}</div>
                    <div style="font-size:28px;font-weight:900;line-height:1.1;margin:0 0 6px">${escapeHtml(title)}</div>
                    <div style="font-size:15px;color:#cbd5e1">${escapeHtml(subtitle)}</div>
                </div>
                <div style="padding:30px">
                    <div style="font-size:16px;font-weight:700;margin:0 0 12px">Hola ${escapeHtml(greetingName || "cliente")},</div>
                    <div style="font-size:15px;line-height:1.65;color:#475569;margin:0 0 20px">${escapeHtml(body)}</div>
                    <div style="border:1px solid #d8e1f0;border-radius:14px;background:#f8fbff;padding:17px 18px;margin:0 0 20px">
                        ${detailRows}
                    </div>
                    <div style="font-size:13px;line-height:1.6;color:#64748b">${escapeHtml(footer)}</div>
                </div>
            </div>
        </div>
    `;
}

function buildSupportCreatedEmail({ ticket, customerName, forAdmin = false }) {
    const appName = process.env.APP_NAME || "Streaming Box";
    const subject = forAdmin
        ? `${appName} | Nueva solicitud ${ticket.ticketCode}`
        : `${appName} | Recibimos tu solicitud ${ticket.ticketCode}`;
    const body = forAdmin
        ? "Se registro una nueva novedad de soporte. Revisa la evidencia y atiende el caso desde el panel administrador."
        : "Recibimos tu reporte y el equipo de soporte lo revisara. Te enviaremos otro correo cuando el caso quede resuelto.";
    const details = [
        { label: "Caso", value: ticket.ticketCode },
        { label: "ID de cuenta", value: `#${ticket.subscriptionId}` },
        { label: "Plataforma", value: ticket.platformName },
        { label: "Cliente", value: forAdmin ? `${customerName} (${ticket.userEmail})` : null },
        { label: "Novedad", value: ticket.observation },
    ];
    const text = [
        `Hola ${forAdmin ? "equipo de soporte" : customerName || "cliente"},`,
        "",
        body,
        "",
        ...details.filter((item) => item.value).map((item) => `${item.label}: ${item.value}`),
    ].join("\n");
    const html = buildSupportEmailFrame({
        title: forAdmin ? "Nueva solicitud de soporte" : "Solicitud recibida",
        subtitle: forAdmin ? "Hay una novedad pendiente por revisar." : "Tu caso ya esta en nuestra bandeja.",
        greetingName: forAdmin ? "equipo de soporte" : customerName,
        body,
        details,
        footer: forAdmin
            ? "La evidencia solo puede abrirse desde una sesion administrativa."
            : "Conserva el numero del caso para consultar su estado.",
    });
    return { subject, text, html };
}

async function sendSupportTicketCreatedEmails({ ticket, customerName }) {
    const config = getSupportMailConfig();
    if (!config) {
        console.warn(`[mail] No hay SMTP configurado para soporte. Caso ${ticket.ticketCode} no enviado.`);
        return { ok: true, delivery: "log" };
    }

    const transporter = await getTransporter("support");
    const inbox = String(
        process.env.SUPPORT_INBOX ||
        process.env.SUPPORT_SMTP_USER ||
        "soporte@strbx.com.co"
    ).trim();
    const customer = buildSupportCreatedEmail({ ticket, customerName });
    const admin = buildSupportCreatedEmail({ ticket, customerName, forAdmin: true });

    const results = await Promise.allSettled([
        transporter.sendMail({
            from: config.from,
            to: ticket.userEmail,
            replyTo: inbox,
            ...customer,
        }),
        transporter.sendMail({
            from: config.from,
            to: inbox,
            replyTo: ticket.userEmail,
            ...admin,
        }),
    ]);
    const failed = results.filter((item) => item.status === "rejected");
    if (failed.length) {
        failed.forEach((item) => console.error("[mail] Error enviando correo de soporte:", item.reason?.message || item.reason));
        return { ok: false, delivery: "partial" };
    }
    return { ok: true, delivery: "email" };
}

async function sendSupportTicketResolvedEmail({ ticket, customerName }) {
    const config = getSupportMailConfig();
    if (!config) {
        console.warn(`[mail] No hay SMTP configurado para soporte. Cierre ${ticket.ticketCode} no enviado.`);
        return { ok: true, delivery: "log" };
    }

    const transporter = await getTransporter("support");
    const inbox = String(
        process.env.SUPPORT_INBOX ||
        process.env.SUPPORT_SMTP_USER ||
        "soporte@strbx.com.co"
    ).trim();
    const resolutionLabels = {
        repaired: "Cuenta reparada",
        replaced: "Cuenta reemplazada",
        other: "Caso resuelto",
    };
    const resultLabel = resolutionLabels[ticket.resolutionType] || "Caso resuelto";
    const details = [
        { label: "Caso", value: ticket.ticketCode },
        { label: "ID de cuenta", value: `#${ticket.subscriptionId}` },
        { label: "Plataforma", value: ticket.platformName },
        { label: "Resultado", value: resultLabel },
        { label: "Respuesta de soporte", value: ticket.resolutionMessage },
    ];
    const subject = `${process.env.APP_NAME || "Streaming Box"} | ${resultLabel} ${ticket.ticketCode}`;
    const text = [
        `Hola ${customerName || "cliente"},`,
        "",
        "Tu solicitud de soporte fue atendida.",
        "",
        ...details.map((item) => `${item.label}: ${item.value}`),
    ].join("\n");
    const html = buildSupportEmailFrame({
        title: resultLabel,
        subtitle: "Tu solicitud de soporte fue atendida.",
        greetingName: customerName,
        body: "Revisamos la novedad reportada. A continuacion encuentras el resultado de la gestion realizada.",
        details,
        footer: `Si la novedad continua, responde este correo o crea un nuevo caso. Correo de soporte: ${inbox}`,
    });

    try {
        await transporter.sendMail({
            from: config.from,
            to: ticket.userEmail,
            replyTo: inbox,
            subject,
            text,
            html,
        });
        return { ok: true, delivery: "email" };
    } catch (error) {
        console.error("[mail] Error enviando cierre de soporte:", error?.message || error);
        return { ok: false, delivery: "error", message: error?.message };
    }
}

module.exports = {
    sendPasswordResetEmail,
    sendOrderDeliveryEmail,
    sendTopupSubmittedEmail,
    sendTopupReviewingEmail,
    sendTopupApprovedEmail,
    sendTopupRejectedEmail,
    sendStockAvailableEmail,
    sendSupportTicketCreatedEmails,
    sendSupportTicketResolvedEmail,
};
