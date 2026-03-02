/**
 * Mapa de palabras clave → nombre exacto del archivo en /public/platform-logos/
 * Orden: de más específico a más genérico.
 */
const LOGO_MAP = [
    // Disney variantes
    ["disney premium completa", "Disney Premium Completa"],
    ["disney premium", "Disney Premium"],
    ["disney estándar", "Disney Estándar"],
    ["disney estandar", "Disney Estándar"],
    ["disney", "Disney"],
    // Netflix variantes
    ["netflix internacional", "Netflix Internacional"],
    ["netflix completa", "Netflix Completa"],
    ["netflix", "Netflix"],
    // Chat/ChatGPT
    ["chat gpt business completa", "Chat Gpt Business Completa"],
    ["chat gpt business", "Chat Gpt"],
    ["chatgpt", "Chat Gpt"],
    ["chat gpt", "Chat Gpt"],
    // Crunchyroll
    ["crunchyroll completa", "Crunchyroll Completa"],
    ["crunchyroll", "Crunchyroll"],
    // Gemini
    ["gemini", "Gemini"],
    // Max
    ["max", "max"],
    // Microsoft / Office
    ["microsoft office", "Microsoft Office 365"],
    ["office 365", "Microsoft Office 365"],
    ["office", "Microsoft Office 365"],
    // Paramount
    ["paramount completa", "Paramount Completa"],
    ["paramount", "Paramount Completa"],
    // Prime Video
    ["prime video completa", "Prime Video"],
    ["prime video", "Prime Video"],
    ["prime", "Prime Video"],
    // Spotify
    ["spotify", "Spotify 3 meses"],
    // Youtube Music
    ["youtube music", "Youtube Music"],
    ["youtube", "Youtube Music"],
];

/**
 * Retorna la ruta del logo dado el slug o el nombre de plataforma.
 * Primero busca coincidencia en el mapa de archivos reales.
 * Si no encuentra, intenta directamente por nombre.
 */
export function getPlatformLogo(slug, name) {
    const raw = String(name || slug || "").toLowerCase().trim();

    // Buscar en el mapa (orden importa: más específico primero)
    for (const [keyword, filename] of LOGO_MAP) {
        if (raw.includes(keyword)) {
            return `/platform-logos/${filename}.png`;
        }
    }

    // Último recurso: el nombre tal cual
    if (name) return `/platform-logos/${name}.png`;
    if (slug) return `/platform-logos/${slug}.png`;
    return null;
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
