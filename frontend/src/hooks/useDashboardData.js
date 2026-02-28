import { useEffect, useState, useCallback } from "react";
import { apiGet } from "../api/api";

export function useDashboardData() {
    const [wallet, setWallet] = useState({ balance: 0, profit_total: 0, currency: "COP" });
    const [catalog, setCatalog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            // ✅ NO Authorization header, todo por cookies HttpOnly
            const [wRes, cRes] = await Promise.all([
                apiGet("/wallet"),
                apiGet(`/catalog?_t=${Date.now()}`),
            ]);

            if (!wRes.ok) throw new Error(wRes.data?.message || "Error cargando wallet.");
            if (!cRes.ok) throw new Error(cRes.data?.message || "Error cargando catálogo.");

            const user = JSON.parse(localStorage.getItem("user") || "{}");

            setWallet({
                balance: Number(wRes.data?.balance ?? 0),
                profit_total: Number(wRes.data?.profit_total ?? 0),
                currency: wRes.data?.currency || user?.currency || "COP",
            });

            setCatalog(Array.isArray(cRes.data) ? cRes.data : []);
        } catch (e) {
            setError(e?.message || "No se pudo cargar catálogo/wallet.");
            setWallet({ balance: 0, profit_total: 0, currency: "COP" });
            setCatalog([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return { wallet, setWallet, catalog, loading, error, setError, reload: load };
}
