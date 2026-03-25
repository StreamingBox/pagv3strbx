/**
 * Base URL de la API.
 * - Si VITE_API_BASE existe, se respeta.
 * - Si no, usamos `/api` tanto en dev como en prod para mantener mismo origen
 *   y no romper cookies HttpOnly entre `localhost` y `127.0.0.1`.
 */
export function getApiBase() {
    const raw = import.meta.env.VITE_API_BASE;
    if (raw != null && String(raw).trim() !== "") {
        return String(raw).replace(/\/+$/, "");
    }
    return "/api";
}
