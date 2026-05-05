import { useState, useEffect, useCallback } from "react";

export default function usePolledFetch(url, intervalMs = 180000) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch(url, { credentials: "include" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            setData(json);
            setError(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [url]);

    useEffect(() => {
        fetchData();
        const timer = setInterval(fetchData, intervalMs);
        return () => clearInterval(timer);
    }, [fetchData, intervalMs]);

    return { data, loading, error, refetch: fetchData };
}
