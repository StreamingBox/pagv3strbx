function buildWhatsappMessage({ orderCode, results, baseUrl }) {
    // ✅ Limpiar baseUrl para evitar doble slash (//)
    const cleanBaseUrl = String(baseUrl || "").replace(/\/+$/, "");

    const lines = [];
    lines.push(`🧾 Orden: ${orderCode}`);
    lines.push(`📦 Pedido múltiple (${results.length} items)`);
    lines.push("");

    for (const r of results) {
        const credentialUrl = `${cleanBaseUrl}/s/${r.token}`;
        const plan = r.plan || {};

        // Extracción de booleanos (por defecto true si undefined/null)
        const showId = plan.wa_show_id !== 0;
        const showEmail = plan.wa_show_email !== 0;
        const showPass = plan.wa_show_pass !== 0;
        const showProfile = plan.wa_show_profile !== 0;
        const showPin = plan.wa_show_pin !== 0;
        const showExpire = plan.wa_show_expire !== 0;
        const showUrl = plan.wa_show_url !== 0;

        // Construcción condicional
        if (showId) {
            lines.push(`🆔 ID: ${r.subscriptionId} | 🖥️ ${plan.platform_name}`);
        } else {
            lines.push(`🖥️ ${plan.platform_name}`);
        }

        if (showEmail) {
            lines.push(`📧 Correo: ${r.account.email}`);
        }

        if (showPass) {
            lines.push(`🔑 Contraseña: ${r.account.password}`);
        }

        if (showProfile) {
            const profile = r?.account?.profile_number;
            if (profile !== null && profile !== undefined && String(profile).trim() !== "") {
                lines.push(`👤 Perfil: ${profile}`);
            }
        }

        if (showPin) {
            const pin = r?.account?.pin;
            if (pin !== null && pin !== undefined && String(pin).trim() !== "") {
                lines.push(`🔢 Pin: ${pin}`);
            }
        }

        if (showExpire) {
            const yyyy = r.expiresAt.toISOString().slice(0, 10);
            lines.push(`📅 Expira: ${yyyy}`);
        }

        if (showUrl) {
            lines.push(`*🔗⚠️ Debido a que en ocasiones se bloquea o cambia la clave, en este enlace ${credentialUrl} puedes consultar la contraseña hasta tu último día contratado. 💻🔑:*`);
        }

        const customInstructions = plan.whatsapp_instructions;
        if (customInstructions && String(customInstructions).trim() !== "") {
            const finalInstruction = String(customInstructions)
                .replace(/{URL}/gi, credentialUrl)
                .replace(/{ENLACE}/gi, credentialUrl);

            lines.push(finalInstruction);
        }

        lines.push("");
        lines.push("");
    }

    return lines.join("\n").trim();
}

module.exports = { buildWhatsappMessage };
