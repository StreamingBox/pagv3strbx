const { randomBytes } = require("node:crypto");
const { isServerReliefAdmin } = require("./telegramServerRelief.service");

const PREVIEW_TTL_MS = 5 * 60_000;
const MAX_PENDING_PREVIEWS = 50;
const tokenPattern = /^[a-f0-9]{32}$/;

function formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return "0 B";
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    const power = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    return `${(value / 1024 ** power).toLocaleString("es-CO", { maximumFractionDigits: power ? 1 : 0 })} ${units[power]}`;
}

function buildBuildCachePreviewMessage(preview) {
    return [
        "🧱 Caché BuildKit no utilizada",
        `Docker marca ${formatBytes(preview.reclaimableBytes)} como recuperables (${Number(preview.reclaimableEntries || 0).toLocaleString("es-CO")} entradas estimadas).`,
        "Si confirmas, solo se eliminará caché de compilación no usada. No se tocarán imágenes, contenedores, volúmenes ni respaldos. Las siguientes compilaciones podrían tardar más.",
        "La confirmación vence en 5 minutos.",
    ].join("\n\n");
}

function createTelegramBuildCacheController({
    authorizedIds,
    preview,
    prune,
    sendMessage,
    now = Date.now,
    makeToken = () => randomBytes(16).toString("hex"),
}) {
    const pending = new Map();

    function purgeExpired() {
        for (const [token, item] of pending) {
            if (item.expiresAt <= now()) pending.delete(token);
        }
        while (pending.size >= MAX_PENDING_PREVIEWS) pending.delete(pending.keys().next().value);
    }

    async function showPreview(msg) {
        if (!isServerReliefAdmin(msg, authorizedIds)) {
            await sendMessage(msg?.chat?.id, "No autorizado. Esta acción requiere el chat privado de un administrador configurado.");
            return;
        }

        try {
            const result = await preview();
            if (!Number.isSafeInteger(result?.reclaimableBytes) || result.reclaimableBytes < 0) {
                throw new Error("invalid_preview");
            }
            if (!result.reclaimableBytes) {
                await sendMessage(msg.chat.id, "🧱 Docker no reporta caché BuildKit no utilizada que pueda liberar. No se modificó nada.");
                return;
            }
            const token = String(result.token || "");
            if (!tokenPattern.test(token)) throw new Error("invalid_preview");
            purgeExpired();
            const actorId = Number(msg.from.id);
            pending.set(token, { actorId, chatId: Number(msg.chat.id), expiresAt: now() + PREVIEW_TTL_MS });
            await sendMessage(msg.chat.id, buildBuildCachePreviewMessage(result), {
                reply_markup: {
                    inline_keyboard: [[
                        { text: `Liberar ${formatBytes(result.reclaimableBytes)}`, callback_data: `cache_prune:${token}` },
                        { text: "Cancelar", callback_data: `cache_cancel:${token}` },
                    ]],
                },
            });
        } catch {
            await sendMessage(msg.chat.id, "⚠️ No pude consultar BuildKit en el servidor. No se modificó la caché; verifica el servicio de mantenimiento del host.");
        }
    }

    async function handleCallback(query) {
        const match = String(query?.data || "").match(/^cache_(prune|cancel):([a-f0-9]{32})$/);
        if (!match) return false;

        const [, action, token] = match;
        const msg = { chat: query.message?.chat, from: query.from };
        const actorId = Number(query.from?.id);
        const chatId = Number(query.message?.chat?.id);
        if (!isServerReliefAdmin(msg, authorizedIds)) {
            await sendMessage(query.message?.chat?.id ?? query.from?.id, "No autorizado. La confirmación solo funciona en el chat privado de un administrador.");
            return true;
        }

        const item = pending.get(token);
        if (!item || item.expiresAt <= now()) {
            pending.delete(token);
            await sendMessage(chatId, "⌛ Esta vista previa venció o ya fue utilizada. Ejecuta /limpiar_servidor para generar otra.");
            return true;
        }
        if (item.actorId !== actorId || item.chatId !== chatId) {
            await sendMessage(chatId, "No autorizado. Esta confirmación pertenece a otro administrador o chat.");
            return true;
        }

        pending.delete(token);
        if (action === "cancel") {
            await sendMessage(chatId, "Limpieza de caché BuildKit cancelada. No se modificó nada.");
            return true;
        }

        await sendMessage(chatId, "⏳ Docker está liberando únicamente la caché BuildKit no utilizada. Espera el resultado.");
        try {
            const result = await prune(token);
            await sendMessage(chatId, [
                "✅ Limpieza de caché BuildKit confirmada por Docker.",
                `Espacio recuperado: ${formatBytes(result.reclaimedBytes)}.`,
                `Recuperable antes: ${formatBytes(result.before?.reclaimableBytes)}; después: ${formatBytes(result.after?.reclaimableBytes)}.`,
                "Imágenes, contenedores, volúmenes y respaldos no se eliminaron.",
            ].join("\n"));
        } catch (error) {
            const message = error?.code === "preview_stale" || error?.code === "preview_expired"
                ? "⌛ La caché cambió o la vista previa venció. No se ejecutó la limpieza; genera una nueva vista previa."
                : "⚠️ Docker no confirmó la limpieza. Revisa /servidor antes de volver a intentarlo; imágenes, volúmenes y respaldos no son objetivo de esta acción.";
            await sendMessage(chatId, message);
        }
        return true;
    }

    return { showPreview, handleCallback };
}

module.exports = { PREVIEW_TTL_MS, buildBuildCachePreviewMessage, createTelegramBuildCacheController, formatBytes };
