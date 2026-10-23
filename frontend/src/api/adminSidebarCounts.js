import { apiFetch } from "./api.js";

const CACHE_TTL_MS = 60_000;
let cachedCounts = null;
let cachedAt = 0;
let requestInFlight = null;

export function getAdminSidebarCounts() {
    if (cachedCounts && Date.now() - cachedAt < CACHE_TTL_MS) {
        return Promise.resolve({ ok: true, data: cachedCounts });
    }
    if (requestInFlight) return requestInFlight;

    requestInFlight = apiFetch("/admin/sidebar-counts")
        .then((response) => {
            if (response.ok && response.data) {
                cachedCounts = response.data;
                cachedAt = Date.now();
            }
            return response;
        })
        .finally(() => {
            requestInFlight = null;
        });

    return requestInFlight;
}
