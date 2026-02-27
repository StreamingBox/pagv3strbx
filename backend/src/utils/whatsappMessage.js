function buildWhatsappMessage({ orderCode, results, baseUrl }) {
    // ✅ Limpiar baseUrl para evitar doble slash (//)
    const cleanBaseUrl = String(baseUrl || "").replace(/\/+$/, "");

    const lines = [];
    lines.push(`🧾 Orden: ${orderCode}`);
    lines.push(`📦 Pedido múltiple (${results.length} items)`);
    lines.push("");

    for (const r of results) {
        const yyyy = r.expiresAt.toISOString().slice(0, 10);

        // ✅ Link limpio siempre: https://strbx.com.co/s/TOKEN
        const credentialUrl = `${cleanBaseUrl}/s/${r.token}`;

        lines.push(`🆔 ID: ${r.subscriptionId} | 🖥️ ${r.plan.platform_name}`);
        lines.push(`📧 Correo: ${r.account.email}`);
        lines.push(`🔑 Contraseña: ${r.account.password}`);

        const profile = r?.account?.profile_number;
        if (profile !== null && profile !== undefined && String(profile).trim() !== "") {
            lines.push(`👤 Perfil: ${profile}`);
        }

        // ✅ SOLO mostrar PIN si está diligenciado (incluye 0 como válido)
        const pin = r?.account?.pin;
        if (pin !== null && pin !== undefined && String(pin).trim() !== "") {
            lines.push(`🔢 Pin: ${pin}`);
        }

        lines.push(`📅 Expira: ${yyyy}`);
        lines.push(
            `*🔗⚠️ Debido a que en ocasiones se bloquea o cambia la clave, en este enlace ${credentialUrl} puedes consultar la contraseña hasta tu último día contratado. 💻🔑:*`
        );
        lines.push("");
        lines.push("");
    }

    return lines.join("\n");
}

module.exports = { buildWhatsappMessage };
