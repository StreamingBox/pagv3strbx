/**
 * Normaliza cualquier string a un slug de archivo seguro.
 * Mismo algoritmo que usa backend/src/routes/admin.upload.js → slugifyFilename()
 */
export function slugifyLogo(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")   // quita tildes / diacríticos
        .replace(/[^a-z0-9]+/g, "-")        // espacios y especiales → guión
        .replace(/^-|-$/g, "");             // quita guiones al inicio/fin
}

/**
 * Retorna la ruta del logo dado el slug o el nombre de plataforma.
 * Aplica el mismo slugify que usa el backend al guardar el archivo.
 * Acepta un timestamp opcional para cache-busting.
 */
export function getPlatformLogo(slug, name, ts) {
    const safe = slugifyLogo(slug || name);
    if (!safe) return null;
    return ts ? `/platform-logos/${safe}.png?t=${ts}` : `/platform-logos/${safe}.png`;
}

export function getInitials(name) {
    const words = String(name || "?").trim().split(/\s+/);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return String(name || "?").trim().slice(0, 2).toUpperCase();
}

export async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        alert("Mensaje copiado ✅");
    } catch {
        alert("No se pudo copiar. Copia manualmente.");
    }
}
