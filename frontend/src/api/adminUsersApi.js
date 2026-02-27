const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

async function safeJson(res) {
    return res.json().catch(() => ({}));
}

async function request(url, options = {}) {
    const res = await fetch(`${API_BASE}${url}`, {
        credentials: "include", // ✅ CLAVE: enviar cookies
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
        ...options,
    });

    const data = await safeJson(res);

    if (!res.ok) {
        throw new Error(data?.message || "Error en la solicitud.");
    }

    return data;
}

/* =========================
   USERS
========================= */

export async function fetchUsers() {
    const data = await request("/admin/users", {
        method: "GET",
    });
    return Array.isArray(data) ? data : [];
}

export async function createUser(body) {
    return request("/admin/users", {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function changeUserPassword(userId, body) {
    return request(`/admin/users/${userId}/password`, {
        method: "PATCH",
        body: JSON.stringify(body),
    });
}

export async function updateUser(userId, body) {
    return request(`/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
    });
}

/* =========================
   WALLET
========================= */

export async function topupWallet(body) {
    return request("/admin/wallet/topup", {
        method: "POST",
        body: JSON.stringify(body),
    });
}
