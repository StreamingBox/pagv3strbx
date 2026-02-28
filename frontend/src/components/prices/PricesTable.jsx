import PriceRow from "./PriceRow";

export default function PricesTable({
    prices,
    loading,
    saving,
    page,
    limit,
    total,
    totalPages,
    onToggleAll,
    onSaveMulti,
    loadAll
}) {
    return (
        <div className="kpi" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontWeight: 900 }}>Listado</div>
                <div style={{ fontSize: 13, color: "rgba(234,241,255,.65)" }}>
                    Registros totales: <b>{total}</b>
                </div>
            </div>

            {loading ? (
                <div style={{ color: "rgba(234,241,255,.65)" }}>Cargando...</div>
            ) : (
                <>
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
                                        <td colSpan="8" style={{ padding: 12, color: "rgba(234,241,255,.65)" }}>
                                            No hay planes.
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Controls */}
                    <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end", paddingRight: 10 }}>
                        <div style={{ color: "rgba(234,241,255,.8)", marginRight: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                            <span>Mostrar:</span>
                            <select
                                className="input"
                                style={{ padding: "4px 8px", width: "auto" }}
                                value={limit}
                                onChange={(e) => loadAll(1, Number(e.target.value))}
                            >
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>
                        <button
                            className="btn-ghost"
                            disabled={page <= 1 || loading}
                            onClick={() => loadAll(page - 1, limit)}
                        >
                            Anterior
                        </button>
                        <span style={{ color: "rgba(234,241,255,.8)" }}>
                            Página {page} de {totalPages || 1}
                        </span>
                        <button
                            className="btn-ghost"
                            disabled={page >= totalPages || loading}
                            onClick={() => loadAll(page + 1, limit)}
                        >
                            Siguiente
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
