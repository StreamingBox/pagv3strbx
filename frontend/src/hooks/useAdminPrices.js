
import { useCallback, useEffect, useState } from "react";
import {
    fetchPlatforms,
    fetchDurations,
    fetchPricesGrouped,
    createPricesMulti,
    patchPrice,
} from "../api/adminPricesApi";

export function useAdminPrices() {
    const [platforms, setPlatforms] = useState([]);
    const [durations, setDurations] = useState([]);
    const [prices, setPrices] = useState([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(5);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [q, setQ] = useState("");

    const loadAll = useCallback(async (pageNum = 1, currentLimit = 5, queryStr = "") => {
        setLoading(true);
        setError("");

        try {
            const [p, d, g] = await Promise.all([
                fetchPlatforms(),
                fetchDurations(),
                fetchPricesGrouped({ page: pageNum, limit: currentLimit, q: queryStr }),
            ]);

            setPlatforms(p);
            setDurations(d);
            setPrices(g.items || []);
            setTotal(g.total || 0);
            setTotalPages(g.totalPages || 1);
            setPage(pageNum);
            setLimit(currentLimit);
        } catch (e) {
            setError(e?.message || "No se pudo cargar precios.");
            setPlatforms([]);
            setDurations([]);
            setPrices([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAll(1, 5, "");
    }, [loadAll]);

    /**
     * 🔥 NORMALIZA SIEMPRE EL BODY A { rows: [...] }
     */
    const saveMulti = useCallback(
        async (payload) => {
            setSaving(true);
            setError("");

            try {
                const platformId = payload.platformId ?? payload.platform_id;
                const durationId = payload.durationId ?? payload.duration_id;

                const body = {
                    rows: [
                        {
                            platformId: Number(platformId),
                            durationId: Number(durationId),
                            prices: payload.prices || {},
                            is_renewable: payload.is_renewable,
                        },
                    ],
                };

                await createPricesMulti(body);
                await loadAll(page, limit, q);
            } catch (e) {
                setError(e?.message || "No se pudo guardar los precios.");
            } finally {
                setSaving(false);
            }
        },
        [limit, loadAll, page, q]
    );

    const toggleAll = useCallback(
        async (row) => {
            setSaving(true);
            setError("");

            try {
                // Si alguno está activo, desactivamos todo. Si todos están inactivos, activamos todo.
                const newState = (row.active_cop || row.active_mxn || row.active_usd) ? 0 : 1;
                const ids = [row.id_cop, row.id_mxn, row.id_usd].filter(v => !!v);

                if (!ids.length) return;

                await Promise.all(ids.map(id => patchPrice(id, { is_active: newState })));
                await loadAll(page, limit, q);
            } catch (e) {
                setError(e?.message || "No se pudo actualizar.");
            } finally {
                setSaving(false);
            }
        },
        [loadAll, page, limit, q]
    );

    return {
        platforms,
        durations,
        prices,
        loading,
        saving,
        error,
        page,
        limit,
        q,
        setQ,
        total,
        totalPages,
        loadAll,
        saveMulti,
        toggleAll,
    };
}
