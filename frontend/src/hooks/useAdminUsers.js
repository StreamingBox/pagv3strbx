import { useCallback, useEffect, useMemo, useState } from "react";
import {
    changeUserPassword,
    createUser,
    fetchUsers,
    topupWallet,
    updateUser,
} from "../api/adminUsersApi";

export function useAdminUsers() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const loadUsers = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            // ✅ auth por cookies HttpOnly (credentials: "include" dentro del api helper)
            const data = await fetchUsers();
            setUsers(data);
        } catch (e) {
            setError(e?.message || "Error cargando usuarios.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    const usersById = useMemo(() => {
        const map = new Map();
        for (const u of users) map.set(String(u.id), u);
        return map;
    }, [users]);

    const doTopup = useCallback(
        async ({ userId, amount, note }) => {
            setSaving(true);
            setError("");
            try {
                await topupWallet({
                    userId: Number(userId),
                    amount: Number(amount),
                    note: note || "",
                });
                await loadUsers();
            } catch (e) {
                setError(e?.message || "Error recargando saldo.");
                throw e;
            } finally {
                setSaving(false);
            }
        },
        [loadUsers]
    );

    const doCreateUser = useCallback(
        async ({ name, email, password, role, currency }) => {
            setSaving(true);
            setError("");
            try {
                await createUser({ name, email, password, role, currency });
                await loadUsers();
            } catch (e) {
                setError(e?.message || "Error creando usuario.");
                throw e;
            } finally {
                setSaving(false);
            }
        },
        [loadUsers]
    );

    const doChangePassword = useCallback(async ({ userId, password }) => {
        setSaving(true);
        setError("");
        try {
            await changeUserPassword(userId, { password });
        } catch (e) {
            setError(e?.message || "Error cambiando contraseña.");
            throw e;
        } finally {
            setSaving(false);
        }
    }, []);

    const doUpdateCurrency = useCallback(
        async ({ userId, currency }) => {
            setSaving(true);
            setError("");
            try {
                await updateUser(userId, { currency });
                await loadUsers();
            } catch (e) {
                setError(e?.message || "Error cambiando moneda.");
                throw e;
            } finally {
                setSaving(false);
            }
        },
        [loadUsers]
    );

    return {
        users,
        usersById,
        loading,
        saving,
        error,
        loadUsers,
        doTopup,
        doCreateUser,
        doChangePassword,
        doUpdateCurrency,
    };
}
