/**
 * Base URL de la API. En producción el fallback debe ser `/api` (mismo origen vía Nginx)
 * para no petear `http://localhost:3000` en el navegador del visitante ("Failed to fetch").
 */
export function getApiBase() {
    const raw = import.meta.env.VITE_API_BASE;
    if (raw != null && String(raw).trim() !== "") {
        return String(raw).replace(/\/+$/, "");
    }
    return import.meta.env.PROD ? "/api" : "http://localhost:3000";
}
