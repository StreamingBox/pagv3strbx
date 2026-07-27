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

// Algunas plataformas usan su archivo oficial en SVG para conservar el logotipo
// nítido sobre el fondo oscuro del catálogo. Las demás siguen usando PNG.
const PLATFORM_LOGO_EXTENSION_OVERRIDES = Object.freeze({
    "hbo-max-standar-cuenta-completa": "svg",
});

function getPlatformLogoExtension(slug) {
    return PLATFORM_LOGO_EXTENSION_OVERRIDES[slugifyLogo(slug)] || "png";
}

const sessionLogoVersion = typeof window !== "undefined" ? String(Date.now()) : "";

export function bumpPlatformLogoVersion(value = Date.now()) {
    const version = String(value);
    if (typeof window === "undefined") return version;
    try {
        window.localStorage.setItem("platformLogoVersion", version);
    } catch {
        // Si localStorage falla, el cache-buster de sesion mantiene la imagen fresca.
    }
    return version;
}

function getPlatformLogoVersion(ts) {
    if (ts) return String(ts);
    if (typeof window === "undefined") return "";
    try {
        return window.localStorage.getItem("platformLogoVersion") || sessionLogoVersion;
    } catch {
        return sessionLogoVersion;
    }
}

/**
 * Retorna la ruta del logo dado el slug o el nombre de plataforma.
 * Aplica el mismo slugify que usa el backend al guardar el archivo.
 * Acepta un timestamp opcional para cache-busting.
 */
export function getPlatformLogo(slug, name, ts) {
    const safe = slugifyLogo(slug || name);
    if (!safe) return null;
    const version = getPlatformLogoVersion(ts);
    const extension = getPlatformLogoExtension(safe);
    return version
        ? `/platform-logos/${safe}.${extension}?t=${encodeURIComponent(version)}`
        : `/platform-logos/${safe}.${extension}`;
}

export function getPlatformLogoCandidates(slug, name, ts) {
    const raw = `${slug || ""} ${name || ""}`.toLowerCase();
    const base = [
        slugifyLogo(slug),
        slugifyLogo(name),
    ];

    if (raw.includes("netflix")) base.push("netflix", "netflix-internacional", "netflix-completa");
    if (raw.includes("prime") || raw.includes("amazon")) base.push("prime-video", "prime-video-completa");
    if (raw.includes("disney")) base.push("disney-premium", "disney-premium-completa", "disney-estandar", "disney");
    if (raw.includes("directv") && raw.includes("win")) base.unshift("directv-go-con-win-solo-activacion-tv");
    if (raw.includes("directv") || raw.includes("directv go")) base.push("directv-go");
    if (raw.includes("crunchy")) base.push("crunchyroll", "crunchyroll-completa");
    if (raw.includes("max")) base.push("max");
    if (raw.includes("vix")) base.push("vix");
    if (raw.includes("canva")) base.push("canva", "canva-mensual-a-correo", "canva-anual-a-correo");
    if (raw.includes("notion")) base.push("notion-a-correo", "notion");
    if (raw.includes("gemini")) base.push("link-gemini-con-5-tb-de-almacenamiento", "gemini");
    if (raw.includes("office") || raw.includes("microsoft")) base.push("microsoft-office-365");
    if (raw.includes("paramount")) base.push("paramount-plus-activacion-por-codigo-tv", "paramount-completa");
    if (raw.includes("apple")) base.push("apple-tv");
    if (raw.includes("iptv")) base.push("iptv-3-meses");
    if (raw.includes("spotify")) base.push("spotify-3-meses");
    if (raw.includes("youtube")) base.push("youtube-music");
    if (raw.includes("capcut")) base.push("capcut-pro-1-dispositivo");
    if (raw.includes("chat") || raw.includes("gpt")) base.push("chat-gpt-cuenta-personal-solo-un-dispositivo", "chatgpt", "chat-gpt");

    return [...new Set(base.filter(Boolean))].map(candidate => getPlatformLogo(candidate, "", ts));
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
