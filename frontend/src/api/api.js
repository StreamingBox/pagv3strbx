// FRONTEND: pagv2strbx-web/src/api/api.js
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

/** Lee JSON de manera segura */
async function safeJson(res) {
    try {
        return await res.json();
    } catch {
        return {};
    }
}

/**
 * Une API_BASE + path sin duplicar /api
 * - si API_BASE termina en "/api" y path empieza con "/api", se elimina uno
 */
function buildUrl(path) {
    const base = String(API_BASE || "").replace(/\/+$/, ""); // sin trailing /
    let p = String(path || "");
    p = p.startsWith("/") ? p : `/${p}`;

    // ✅ evita /api/api/...
    if (base.endsWith("/api") && p.startsWith("/api/")) {
        p = p.slice(4); // quita "/api"
    }

    return `${base}${p}`;
}

/** Refresh cookies HttpOnly */
async function tryRefresh() {
    try {
        const r = await fetch(buildUrl("/auth/refresh"), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
        });
        return r.ok;
    } catch {
        return false;
    }
}

/**
 * apiFetch: fetch con cookies + retry si 401
 */
export async function apiFetch(path, options = {}) {
    const url = buildUrl(path);

    const res1 = await fetch(url, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    });

    if (res1.status !== 401) {
        const data = await safeJson(res1);
        return { ok: res1.ok, status: res1.status, data };
    }

    const refreshed = await tryRefresh();
    if (!refreshed) {
        const data = await safeJson(res1);
        return { ok: false, status: 401, data: data?.message ? data : { message: "No autorizado" } };
    }

    const res2 = await fetch(url, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    });

    const data2 = await safeJson(res2);
    return { ok: res2.ok, status: res2.status, data: data2 };
}

/* Helpers */
export async function apiGet(path) {
    return apiFetch(path, { method: "GET" });
}

export async function apiPost(path, body) {
    return apiFetch(path, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
    });
}

export async function apiPatch(path, body) {
    return apiFetch(path, {
        method: "PATCH",
        body: JSON.stringify(body ?? {}),
    });
}

export async function apiDelete(path) {
    return apiFetch(path, { method: "DELETE" });
}

export async function apiLogout() {
    const res = await fetch(buildUrl("/auth/logout"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
    });

    const data = await safeJson(res);
    return { ok: res.ok, status: res.status, data };
}
