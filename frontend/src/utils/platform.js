export function getPlatformLogo(slug) {
    if (!slug) return null;
    return `/platform-logos/${slug}.png`;
}

export function getInitials(name) {
    return String(name || "?").trim().slice(0, 1).toUpperCase();
}

export async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        alert("Mensaje copiado ✅");
    } catch {
        alert("No se pudo copiar. Copia manualmente.");
    }
}
