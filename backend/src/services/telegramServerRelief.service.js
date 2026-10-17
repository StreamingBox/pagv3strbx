function isServerReliefAdmin(msg, authorizedIds) {
    const actor = Number(msg?.from?.id);
    return msg?.chat?.type === "private" && Number(msg.chat.id) === actor
        && Number.isSafeInteger(actor) && actor > 0 && authorizedIds.size > 0 && authorizedIds.has(actor);
}

const formatMiB = bytes => `${Math.round(Number(bytes || 0) / 1024 ** 2).toLocaleString("es-CO")} MiB`;

function buildServerReliefMessage(result, before, after) {
    if (result.status === "busy") return "⏳ Ya hay una limpieza del servidor en curso. Espera a que termine.";
    if (result.status === "cooldown") return "🕒 La limpieza se ejecuto hace poco. Espera 5 minutos y usa /servidor para revisar los recursos.";
    return [
        result.releasedBytes ? "✅ Limpieza del servidor completada" : "🔎 Revision completada: no se liberaron temporales",
        `📦 Temporales archivados: ${result.archived}`,
        `☁️ Copias verificadas en Drive: ${result.driveVerified || 0}`,
        `🧹 Espacio liberado en /tmp: ${formatMiB(result.releasedBytes)}`,
        "",
        "📊 Recursos del servidor",
        `🧠 RAM disponible: ${formatMiB(before?.memory?.availableBytes)} -> ${formatMiB(after?.memory?.availableBytes)}`,
        before?.swap && after?.swap ? `🔄 Swap utilizada: ${formatMiB(before.swap.usedBytes)} -> ${formatMiB(after.swap.usedBytes)}` : "",
        before?.storage && after?.storage ? `💽 Disco disponible: ${formatMiB(before.storage.availableBytes)} -> ${formatMiB(after.storage.availableBytes)}` : "",
        result.archiveId ? `🗂️ Copia verificada: ${result.archiveId}` : "",
        result.skipped ? `⏭️ Temporales omitidos por proteccion o limites: ${result.skipped}` : "",
        result.failed ? `⚠️ Temporales conservados por fallo de verificacion: ${result.failed}` : "",
        result.diskLimited ? "⚠️ Espacio insuficiente para archivar mas temporales; los originales se conservaron." : "",
        result.failed ? "📤 Las copias pendientes siguen en el disco y se reintentara su subida a Drive." : "✅ Las copias verificadas se conservaron en disco y Drive.",
        "🛡️ Cuentas, respaldos anteriores y servicios permanecen intactos.",
        "ℹ️ La memoria disponible puede variar segun la actividad del servidor.",
    ].filter(Boolean).join("\n");
}

function createServerReliefHandler({ authorizedIds, sendMessage, getResources, relieve, logger }) {
    return async msg => {
        if (!isServerReliefAdmin(msg, authorizedIds)) return sendMessage(msg.chat.id, "No autorizado. Este comando requiere el chat privado de un administrador configurado.");
        await sendMessage(msg.chat.id, "🔎 Revisando recursos y archivando temporales. Te enviare el resultado al terminar.");
        try {
            const before = await getResources();
            const result = await relieve();
            const after = await getResources();
            logger.info("telegram_server_relief", { actorId: msg.from.id, ...result });
            return sendMessage(msg.chat.id, buildServerReliefMessage(result, before, after));
        } catch {
            logger.error("telegram_server_relief_failed", { actorId: msg.from.id });
            return sendMessage(msg.chat.id, "❌ No se pudo completar la limpieza. Los originales se conservan hasta verificar las copias en disco y Drive. Revisa /servidor o solicita una revision.");
        }
    };
}

module.exports = { isServerReliefAdmin, buildServerReliefMessage, createServerReliefHandler };
