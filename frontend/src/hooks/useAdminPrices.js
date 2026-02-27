// pagv2strbx-web/src/hooks/useAdminPrices.js

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

    const loadAll = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const [p, d, g] = await Promise.all([
                fetchPlatforms(),
                fetchDurations(),
                fetchPricesGrouped(),
            ]);

            setPlatforms(p);
            setDurations(d);
            setPrices(g);
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
        loadAll();
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
                await loadAll();
            } catch (e) {
                setError(e?.message || "No se pudo guardar los precios.");
            } finally {
                setSaving(false);
            }
        },
        [loadAll]
    );

    const toggleAll = useCallback(
        async (id, patchBody) => {
            setSaving(true);
            setError("");

            try {
                await patchPrice(id, patchBody);
                await loadAll();
            } catch (e) {
                setError(e?.message || "No se pudo actualizar.");
            } finally {
                setSaving(false);
            }
        },
        [loadAll]
    );

    return {
        platforms,
        durations,
        prices,
        loading,
        saving,
        error,
        loadAll,
        saveMulti,
        toggleAll,
    };
}
