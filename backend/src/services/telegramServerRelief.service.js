function isServerReliefAdmin(msg, authorizedIds) {
    const actor = Number(msg?.from?.id);
    return msg?.chat?.type === "private" && Number(msg.chat.id) === actor
        && Number.isSafeInteger(actor) && actor > 0 && authorizedIds.size > 0 && authorizedIds.has(actor);
}

const formatMiB = bytes => `${Math.round(Number(bytes || 0) / 1024 ** 2).toLocaleString("es-CO")} MiB`;
const failureLabels = {
    unrecognized_entry: "formato de archivo no permitido",
    protected_entry: "archivo protegido detectado",
    size_limit: "límite de tamaño superado",
    copy_verification_failed: "falló la verificación local SHA-256",
    backup_drive_upload_failed: "falló la subida a Drive",
    backup_drive_download_failed: "Drive no permitió verificar la copia",
    backup_drive_verification_failed: "el SHA-256 de Drive no coincide",
    source_changed: "el temporal cambió durante la copia",
    source_in_use: "el temporal esta siendo utilizado",
    io_error: "error de lectura o escritura",
};

function describeFailures(failureCodes = {}) {
    return Object.entries(failureCodes)
        .map(([code, count]) => `${failureLabels[code] || code}: ${count}`)
        .join("; ");
}

function buildServerReliefMessage(result, before, after) {
    if (result.status === "busy") return "⏳ Ya hay una limpieza del servidor en curso. Espera a que termine.";
    if (result.status === "cooldown") return "🕒 La limpieza se ejecuto hace poco. Espera 5 minutos y usa /servidor para revisar los recursos.";
    const title = result.failed
        ? "⚠️ Limpieza parcial; quedan temporales por revisar"
        : (result.archived || result.releasedBytes)
            ? "✅ Limpieza completada"
            : result.skipped
                ? "🔎 No se retiraron temporales; se omitieron por antigüedad, uso o límites"
                : "🔎 No se encontraron temporales aptos para limpiar";
    const failures = describeFailures(result.failureCodes) || (result.failed ? "causa no detallada" : "");
    const tmpfs = before?.temporaryStorage?.memoryBacked || after?.temporaryStorage?.memoryBacked;
    return [
        title,
        `📦 Temporales archivados: ${result.archived}`,
        `☁️ Copias verificadas en Drive: ${result.driveVerified || 0}`,
        `🧹 Espacio liberado en /tmp: ${formatMiB(result.releasedBytes)}`,
        `🗂️ Copias de trabajo locales retiradas tras verificar Drive: ${result.localCopiesRemoved || 0}`,
        "",
        "📊 Recursos del servidor",
        `🧠 RAM disponible: ${formatMiB(before?.memory?.availableBytes)} -> ${formatMiB(after?.memory?.availableBytes)}`,
        before?.swap && after?.swap ? `🔄 Swap utilizada: ${formatMiB(before.swap.usedBytes)} -> ${formatMiB(after.swap.usedBytes)}` : "",
        before?.temporaryStorage && after?.temporaryStorage ? `🧺 Espacio disponible en /tmp: ${formatMiB(before.temporaryStorage.availableBytes)} -> ${formatMiB(after.temporaryStorage.availableBytes)}` : "",
        before?.storage && after?.storage ? `💽 Disco de la aplicacion disponible: ${formatMiB(before.storage.availableBytes)} -> ${formatMiB(after.storage.availableBytes)}` : "",
        result.archiveId ? `🗂️ Lote verificado en Drive: ${result.archiveId}` : "",
        result.skipped ? `⏭️ Temporales omitidos por proteccion o limites: ${result.skipped}` : "",
        result.failed ? `⚠️ Elementos con error: ${result.failed} (${failures})` : "",
        result.diskLimited ? "⚠️ Espacio insuficiente para preparar una copia local; los originales se conservaron." : "",
        result.failed ? "🛡️ No se borro ningun original que no tuviera una copia verificada en Drive." : "✅ Drive verifico las copias y se retiro el staging local para no acumularlo en el servidor.",
        "🛡️ Cuentas, respaldos anteriores y servicios permanecen intactos.",
        tmpfs ? "ℹ️ /tmp usa memoria temporal (tmpfs): limpiarlo libera RAM temporal, no espacio del disco raíz." : "ℹ️ El espacio liberado en /tmp y en el disco de la aplicación se mide por separado.",
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

module.exports = { isServerReliefAdmin, buildServerReliefMessage, createServerReliefHandler, describeFailures };
