import { useMemo, useState } from "react";

export default function PricesForm({ platforms, durations, saving, onSaveMulti }) {
    const [platformId, setPlatformId] = useState("");
    const [durationId, setDurationId] = useState("");
    const [isRenewable, setIsRenewable] = useState(false);

    // 3 precios en 1 (lo que querías)
    const [priceCOP, setPriceCOP] = useState("");
    const [priceMXN, setPriceMXN] = useState("");
    const [priceUSD, setPriceUSD] = useState("");

    const selectedPlatform = useMemo(
        () => platforms.find((p) => String(p.id) === String(platformId)),
        [platforms, platformId]
    );

    const selectedDuration = useMemo(
        () => durations.find((d) => String(d.id) === String(durationId)),
        [durations, durationId]
    );

    const canSave = useMemo(() => {
        if (!platformId || !durationId) return false;
        // Debe haber al menos un precio llenado
        return priceCOP !== "" || priceMXN !== "" || priceUSD !== "";
    }, [platformId, durationId, priceCOP, priceMXN, priceUSD]);

    async function handleSave() {
        const prices = {};
        if (priceCOP !== "") prices.COP = Number(priceCOP);
        if (priceMXN !== "") prices.MXN = Number(priceMXN);
        if (priceUSD !== "") prices.USD = Number(priceUSD);

        await onSaveMulti({
            platform_id: Number(platformId),
            duration_id: Number(durationId),
            prices,
            is_renewable: isRenewable,
        });

        setPlatformId("");
        setDurationId("");
        setPriceCOP("");
        setPriceMXN("");
        setPriceUSD("");
        setIsRenewable(false);
        alert("Precios guardados ✅");
    }

    return (
        <div className="kpi" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Crear / Actualizar precios</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label className="label">
                    Plataforma
                    <select className="input" value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
                        <option value="">-- Selecciona --</option>
                        {platforms.map((p) => (
                            <option key={p.id} value={p.id}>
                                #{p.id} - {p.name}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="label">
                    Duración
                    <select className="input" value={durationId} onChange={(e) => setDurationId(e.target.value)}>
                        <option value="">-- Selecciona --</option>
                        {durations.map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.name} ({d.days} días)
                            </option>
                        ))}
                    </select>
                </label>

                <label className="label">
                    Precio COP
                    <input className="input" type="number" value={priceCOP} onChange={(e) => setPriceCOP(e.target.value)} />
                </label>

                <label className="label">
                    Precio MXN
                    <input className="input" type="number" value={priceMXN} onChange={(e) => setPriceMXN(e.target.value)} />
                </label>

                <label className="label">
                    Precio USD
                    <input className="input" type="number" value={priceUSD} onChange={(e) => setPriceUSD(e.target.value)} />
                </label>

                <div style={{ color: "rgba(234,241,255,.7)", alignSelf: "end" }}>
                    Seleccionado: <b>{selectedPlatform?.name || "-"}</b> / <b>{selectedDuration?.name || "-"}</b>
                </div>

                <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={isRenewable} onChange={e => setIsRenewable(e.target.checked)} />
                    <span>¿Es Renovable?</span>
                </label>
            </div>

            <button className="btn" style={{ marginTop: 12 }} onClick={handleSave} disabled={saving || !canSave}>
                {saving ? "Guardando..." : "Guardar (COP/MXN/USD)"}
            </button>

            <div style={{ marginTop: 8, color: "rgba(234,241,255,.55)", fontSize: 13 }}>
                Puedes llenar 1, 2 o 3 monedas. El backend hace <b>upsert</b> por moneda.
            </div>
        </div>
    );
}
