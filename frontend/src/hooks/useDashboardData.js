import { useEffect, useState, useCallback } from "react";
import { apiGet } from "../api/api";

export function useDashboardData() {
    const [wallet, setWallet] = useState({ balance: 0, profit_total: 0, total_invested: 0, currency: "COP" });
    const [catalog, setCatalog] = useState([]);
    const [combos, setCombos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const [wRes, cRes, comboRes] = await Promise.all([
                apiGet("/wallet"),
                apiGet("/catalog"),
                apiGet("/combos"),
            ]);

            if (!wRes.ok) throw new Error(wRes.data?.message || "Error cargando wallet.");
            if (!cRes.ok) throw new Error(cRes.data?.message || "Error cargando catalogo.");
            if (!comboRes.ok) throw new Error(comboRes.data?.message || "Error cargando combos.");

            setWallet({
                balance: Number(wRes.data?.balance ?? 0),
                profit_total: Number(wRes.data?.profit_total ?? 0),
                total_invested: Number(wRes.data?.total_invested ?? 0),
                currency: wRes.data?.currency || "COP",
            });

            setCatalog(Array.isArray(cRes.data) ? cRes.data : []);
            setCombos(Array.isArray(comboRes.data) ? comboRes.data : []);
        } catch (e) {
            setError(e?.message || "No se pudo cargar catalogo/wallet.");
            setWallet({ balance: 0, profit_total: 0, total_invested: 0, currency: "COP" });
            setCatalog([]);
            setCombos([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return { wallet, setWallet, catalog, combos, loading, error, setError, reload: load };
}
