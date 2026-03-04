function buildWhatsappMessage({ orderCode, results, baseUrl }) {
    // ✅ Limpiar baseUrl para evitar doble slash (//)
    const cleanBaseUrl = String(baseUrl || "").replace(/\/+$/, "");

    const lines = [];
    lines.push(`🧾 Orden: ${orderCode}`);
    lines.push(`📦 Pedido múltiple (${results.length} items)`);
    lines.push("");

    for (const r of results) {
        const yyyy = r.expiresAt.toISOString().slice(0, 10);
        const credentialUrl = `${cleanBaseUrl}/s/${r.token}`;

        const template = r?.plan?.whatsapp_template;

        if (template && String(template).trim() !== "") {
            // Flujo Opción 2: Plantilla absoluta
            const pinVal = r?.account?.pin || "";
            const profVal = r?.account?.profile_number || "";
            const emailVal = r?.account?.email || "";
            const passVal = r?.account?.password || "";
            const platName = r?.plan?.platform_name || "";

            let finalMsg = String(template)
                .replace(/{PLATAFORMA}/gi, platName)
                .replace(/{CORREO}/gi, emailVal)
                .replace(/{PASSWORD}/gi, passVal)
                .replace(/{CLAVE}/gi, passVal) // alias
                .replace(/{PIN}/gi, pinVal)
                .replace(/{PERFIL}/gi, profVal)
                .replace(/{EXPIRA}/gi, yyyy)
                .replace(/{URL}/gi, credentialUrl)
                .replace(/{ENLACE}/gi, credentialUrl); // alias

            lines.push(finalMsg);
            lines.push("");

        } else {
            // Flujo original (Fallback)
            lines.push(`🆔 ID: ${r.subscriptionId} | 🖥️ ${r.plan.platform_name}`);
            lines.push(`📧 Correo: ${r.account.email}`);
            lines.push(`🔑 Contraseña: ${r.account.password}`);

            const profile = r?.account?.profile_number;
            if (profile !== null && profile !== undefined && String(profile).trim() !== "") {
                lines.push(`👤 Perfil: ${profile}`);
            }

            const pin = r?.account?.pin;
            if (pin !== null && pin !== undefined && String(pin).trim() !== "") {
                lines.push(`🔢 Pin: ${pin}`);
            }

            lines.push(`📅 Expira: ${yyyy}`);
            lines.push("");
            lines.push("");
        }
    }

    return lines.join("\n").trim();
}

module.exports = { buildWhatsappMessage };
