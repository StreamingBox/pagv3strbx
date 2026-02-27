const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:3000").replace(/\/$/, "");

async function safeJson(res) {
    return res.json().catch(() => ({}));
}

async function request(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        ...options,
        headers: {
            ...(options.method && options.method !== "GET" ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {}),
        },
    });

    const data = await safeJson(res);
    if (!res.ok) throw new Error(data?.message || `Error en ${path}`);
    return data;
}

export async function fetchPlatforms() {
    const data = await request("/admin/platforms", { method: "GET" });
    return Array.isArray(data) ? data : [];
}

export async function fetchDurations() {
    const data = await request("/admin/durations", { method: "GET" });
    return Array.isArray(data) ? data : [];
}

export async function fetchPricesGrouped() {
    const data = await request("/admin/prices/grouped", { method: "GET" });
    return Array.isArray(data) ? data : [];
}

/**
 * 🔥 Normaliza payload a lo que el backend exige:
 * body final:
 * { platform_id, duration_id, prices: {COP?, MXN?, USD?} }
 * ó si el backend soporta rows, lo cambiamos abajo.
 */
function normalizeMultiBody(payload) {
    // Si ya viene en formato backend
    if (payload && payload.platform_id && payload.duration_id && payload.prices) {
        return payload;
    }

    // Si viene como platformId/durationId
    const platform_id = payload?.platform_id ?? payload?.platformId;
    const duration_id = payload?.duration_id ?? payload?.durationId;
    const prices = payload?.prices ?? {};
    const is_renewable = payload?.is_renewable;

    return {
        platform_id: platform_id != null ? Number(platform_id) : platform_id,
        duration_id: duration_id != null ? Number(duration_id) : duration_id,
        prices,
        is_renewable: is_renewable != null ? !!is_renewable : undefined,
    };
}

/**
 * POST /admin/prices/multi
 * Acepta:
 *  - { platform_id, duration_id, prices }
 *  - { platformId, durationId, prices }
 *  - { rows:[{platformId,durationId,prices}]}  -> se manda uno por uno al backend
 */
export async function createPricesMulti(payload) {
    // Si mandan rows, hacemos N llamadas (rápido y seguro)
    if (payload?.rows && Array.isArray(payload.rows)) {
        const results = [];
        for (const row of payload.rows) {
            const body = normalizeMultiBody(row);
            results.push(
                await request("/admin/prices/multi", {
                    method: "POST",
                    body: JSON.stringify(body),
                })
            );
        }
        return results;
    }

    const body = normalizeMultiBody(payload);

    return request("/admin/prices/multi", {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function patchPrice(id, patchBody) {
    return request(`/admin/prices/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patchBody),
    });
}
