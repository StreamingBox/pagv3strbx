import { getApiBase } from "../config/apiBase.js";

const API_BASE = getApiBase();
const DEFAULT_TIMEOUT_MS = 30000;

/** Lee JSON de manera segura */
async function safeJson(res) {
    try {
        return await res.json();
    } catch {
        return {};
    }
}

async function fetchWithTimeout(url, options = {}) {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...fetchOptions } = options;
    const controller = signal ? null : new AbortController();
    const timeout = controller
        ? window.setTimeout(() => controller.abort(), timeoutMs)
        : null;

    try {
        return await fetch(url, {
            ...fetchOptions,
            signal: signal || controller.signal,
        });
    } finally {
        if (timeout) window.clearTimeout(timeout);
    }
}

/**
 * Une API_BASE + path sin duplicar /api
 * - si API_BASE termina en "/api" y path empieza con "/api", se elimina uno
 */
export function buildApiUrl(path) {
    const base = String(API_BASE || "").replace(/\/+$/, ""); // sin trailing /
    let p = String(path || "");
    p = p.startsWith("/") ? p : `/${p}`;

    // ✅ evita /api/api/...
    if (base.endsWith("/api") && p.startsWith("/api/")) {
        p = p.slice(4); // quita "/api"
    }

    return `${base}${p}`;
}

export function clearLegacySession() {
    try {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
    } catch {
        /* ignore legacy storage cleanup failures */
    }
}

/** Refresh cookies HttpOnly */
async function tryRefresh(timeoutMs = DEFAULT_TIMEOUT_MS) {
    try {
        const r = await fetchWithTimeout(buildApiUrl("/auth/refresh"), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            timeoutMs,
        });
        return r.ok;
    } catch {
        return false;
    }
}

/**
 * apiFetch: fetch con cookies + retry si 401
 */
function buildHeaders(requestOptions) {
    const isFormData = requestOptions.body && requestOptions.body instanceof FormData;
    if (isFormData) {
        // El navegador setea Content-Type con el boundary correcto
        return { ...(requestOptions.headers || {}) };
    }
    return {
        "Content-Type": "application/json",
        ...(requestOptions.headers || {}),
    };
}

export async function apiFetch(path, options = {}) {
    const url = buildApiUrl(path);
    const { timeoutMs = DEFAULT_TIMEOUT_MS, ...requestOptions } = options;
    const headers = buildHeaders(requestOptions);

    const res1 = await fetchWithTimeout(url, {
        ...requestOptions,
        credentials: "include",
        headers,
        timeoutMs,
    });

    if (res1.status !== 401) {
        const data = await safeJson(res1);
        return { ok: res1.ok, status: res1.status, data };
    }

    const refreshed = await tryRefresh(timeoutMs);
    if (!refreshed) {
        const data = await safeJson(res1);
        return { ok: false, status: 401, data: data?.message ? data : { message: "No autorizado" } };
    }

    const res2 = await fetchWithTimeout(url, {
        ...requestOptions,
        credentials: "include",
        headers,
        timeoutMs,
    });

    const data2 = await safeJson(res2);
    return { ok: res2.ok, status: res2.status, data: data2 };
}

export async function apiPostFormData(path, formData, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return apiFetch(path, { method: "POST", body: formData, timeoutMs });
}

/* Helpers */
export async function apiGet(path, options = {}) {
    return apiFetch(path, { ...options, method: "GET" });
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
    const res = await fetchWithTimeout(buildApiUrl("/auth/logout"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
    });

    const data = await safeJson(res);
    return { ok: res.ok, status: res.status, data };
}

export async function apiGetTransactions(query = {}) {
    const params = new URLSearchParams(query);
    return apiGet(`/wallet/transactions?${params.toString()}`);
}
