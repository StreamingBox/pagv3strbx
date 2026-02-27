import PriceRow from "./PriceRow";

export default function PricesTable({ prices, loading, saving, onToggleAll, onSaveMulti }) {
    return (
        <div className="kpi" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Listado</div>

            {loading ? (
                <div style={{ color: "rgba(234,241,255,.65)" }}>Cargando...</div>
            ) : (
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ textAlign: "left", color: "rgba(234,241,255,.75)" }}>
                                <th style={{ padding: "10px 8px" }}>Plataforma</th>
                                <th style={{ padding: "10px 8px" }}>Duración</th>
                                <th style={{ padding: "10px 8px" }}>COP</th>
                                <th style={{ padding: "10px 8px" }}>MXN</th>
                                <th style={{ padding: "10px 8px" }}>USD</th>
                                <th style={{ padding: "10px 8px" }}>Renovable</th>
                                <th style={{ padding: "10px 8px" }}>Activo</th>
                                <th style={{ padding: "10px 8px" }}>Acciones</th>
                            </tr>
                        </thead>

                        <tbody>
                            {prices.map((r) => (
                                <PriceRow
                                    key={`${r.platform_id}-${r.duration_id}`}
                                    r={r}
                                    saving={saving}
                                    onToggleAll={() => onToggleAll(r)}
                                    onSaveMulti={(pricesObj, isRenewable) =>
                                        onSaveMulti({
                                            platform_id: r.platform_id,
                                            duration_id: r.duration_id,
                                            prices: pricesObj,
                                            is_renewable: isRenewable
                                        })
                                    }
                                />
                            ))}

                            {!prices.length ? (
                                <tr>
                                    <td colSpan="7" style={{ padding: 12, color: "rgba(234,241,255,.65)" }}>
                                        No hay planes.
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
