import { useCallback, useEffect, useMemo, useState } from "react";
import {
    adjustProfit,
    adjustInvested,
    changeUserPassword,
    createUser,
    fetchUsers,
    fetchUserStats,
    resetInvestment,
    topupWallet,
    updateUser,
} from "../api/adminUsersApi";

export function useAdminUsers() {
    const [users, setUsers] = useState([]);
    const [allUsers, setAllUsers] = useState([]); // ✅ Full list for dropdowns
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    // PAGINATION
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(5);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);

    // STATS
    const [stats, setStats] = useState([]);

    const loadUsers = useCallback(async (pageNum = 1, currentLimit = 5) => {
        setLoading(true);
        setError("");
        try {
            const [userData, statsData, fullData] = await Promise.all([
                fetchUsers({ page: pageNum, limit: currentLimit }),
                fetchUserStats(),
                fetchUsers({ page: 1, limit: 1000 }) // ✅ Fetch "all" for dropdowns
            ]);

            setUsers(userData.items || []);
            setAllUsers(fullData.items || []);
            setTotal(userData.total || 0);
            setTotalPages(userData.totalPages || 1);
            setPage(pageNum);
            setLimit(currentLimit);
            setStats(statsData || []);
        } catch (e) {
            setError(e?.message || "Error cargando usuarios.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadUsers(1, 5);
    }, [loadUsers]);

    const usersById = useMemo(() => {
        const map = new Map();
        for (const u of allUsers) map.set(String(u.id), u);
        return map;
    }, [allUsers]);

    const doTopup = useCallback(
        async ({ userId, amount, note }) => {
            setSaving(true);
            setError("");
            try {
                await topupWallet({
                    userId: Number(userId),
                    amount: Number(amount), // Puede ser negativo ahora
                    note: note || "",
                });
                await loadUsers(page, limit);
            } catch (e) {
                setError(e?.message || "Error ajustando saldo.");
                throw e;
            } finally {
                setSaving(false);
            }
        },
        [loadUsers, page, limit]
    );

    const doAdjustProfit = useCallback(
        async ({ userId, amount, note }) => {
            setSaving(true);
            setError("");
            try {
                await adjustProfit({
                    userId: Number(userId),
                    amount: Number(amount),
                    note: note || "",
                });
                await loadUsers(page, limit);
            } catch (e) {
                setError(e?.message || "Error ajustando ganancia.");
                throw e;
            } finally {
                setSaving(false);
            }
        },
        [loadUsers, page, limit]
    );

    const doAdjustInvested = useCallback(
        async ({ userId, amount, note }) => {
            setSaving(true);
            setError("");
            try {
                await adjustInvested({
                    userId: Number(userId),
                    amount: Number(amount),
                    note: note || "",
                });
                await loadUsers(page, limit);
            } catch (e) {
                setError(e?.message || "Error ajustando inversión.");
                throw e;
            } finally {
                setSaving(false);
            }
        },
        [loadUsers, page, limit]
    );

    const doCreateUser = useCallback(
        async ({ name, email, password, role, currency }) => {
            setSaving(true);
            setError("");
            try {
                await createUser({ name, email, password, role, currency });
                await loadUsers(1, limit);
            } catch (e) {
                setError(e?.message || "Error creando usuario.");
                throw e;
            } finally {
                setSaving(false);
            }
        },
        [loadUsers, limit]
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
                await loadUsers(page, limit);
            } catch (e) {
                setError(e?.message || "Error cambiando moneda.");
                throw e;
            } finally {
                setSaving(false);
            }
        },
        [loadUsers, page, limit]
    );

    const doResetInvestment = useCallback(
        async (userId) => {
            setSaving(true);
            setError("");
            try {
                await resetInvestment(userId);
                await loadUsers(page, limit);
            } catch (e) {
                setError(e?.message || "Error reseteando inversión.");
                throw e;
            } finally {
                setSaving(false);
            }
        },
        [loadUsers, page, limit]
    );

    return {
        users,
        allUsers,
        usersById,
        loading,
        saving,
        error,
        page,
        limit,
        total,
        totalPages,
        stats,
        loadUsers,
        doTopup,
        doAdjustProfit,
        doCreateUser,
        doChangePassword,
        doUpdateCurrency,
        doResetInvestment,
        doAdjustInvested,
    };
}
