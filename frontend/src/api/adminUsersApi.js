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

export async function fetchUsers(query = {}) {
    const params = new URLSearchParams(query);
    const data = await request(`/admin/users?${params.toString()}`, {
        method: "GET",
    });
    return data;
}

export async function fetchUserStats() {
    return request("/admin/users/stats", {
        method: "GET",
    });
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

export async function adjustProfit(body) {
    return request("/admin/wallet/adjust-profit", {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function fetchAdminWalletTransactions(userId, query = {}) {
    const params = new URLSearchParams(query);
    return request(`/admin/wallet/transactions/${userId}?${params.toString()}`, {
        method: "GET",
    });
}

export async function fetchAdminGlobalTransactions(query = {}) {
    const params = new URLSearchParams(query);
    return request(`/admin/wallet/transactions?${params.toString()}`, {
        method: "GET",
    });
}


