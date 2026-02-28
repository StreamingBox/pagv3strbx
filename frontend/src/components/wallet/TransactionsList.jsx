import { useState, useEffect } from "react";

export default function TransactionsList({ fetchFn, userId, users }) {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [error, setError] = useState("");
    const [filterType, setFilterType] = useState(""); // Nuevo filtro
    const [filterUser, setFilterUser] = useState(""); // Filtro de usuario global

    async function loadData(pageNum, currentLimit, typeLimit = filterType, userLimit = filterUser) {
        setLoading(true);
        setError("");
        try {
            const query = { page: pageNum, limit: currentLimit };
            if (typeLimit) query.type = typeLimit;
            if (userLimit) query.userId = userLimit;

            // If userId is provided, pass it as first arg (per-user view)
            // Otherwise, call with single arg (global view)
            const data = userId
                ? await fetchFn(userId, query)
                : await fetchFn(query);

            // Handle different response structures
            const payload = data.ok !== undefined ? data.data : data;

            setTransactions(payload?.items || []);
            setTotal(payload?.total || 0);
            setTotalPages(payload?.totalPages || 1);
            setPage(pageNum);
            setLimit(currentLimit);
        } catch (e) {
            setError(e.message || "Error al cargar el historial.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData(1, limit, filterType, filterUser);
    }, [userId, filterType, filterUser]);

    function formatAmount(amt) {
        const val = Number(amt);
        if (val > 0) return <span style={{ color: "#10b981", fontWeight: "bold" }}>+{val.toLocaleString("es-CO")}</span>;
        if (val < 0) return <span style={{ color: "#ef4444", fontWeight: "bold" }}>{val.toLocaleString("es-CO")}</span>;
        return <span>{val.toLocaleString("es-CO")}</span>;
    }

    function getTypeLabel(type) {
        const map = {
            'purchase': 'Compra',
            'topup': 'Recarga',
            'profit': 'Ganancia Venta',
            'adjustment': 'Ajuste Admin',
            'profit_adj': 'Ajuste Ganancia'
        };
        return map[type] || type;
    }

    return (
        <div className="kpi" style={{ marginTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
                <div style={{ fontWeight: 900 }}>Historial de Transacciones</div>

                <div style={{ display: "flex", gap: 15, alignItems: "center", flexWrap: "wrap" }}>
                    {users && (
                        <select
                            className="input"
                            style={{ padding: "4px 8px", width: "auto", fontSize: 13 }}
                            value={filterUser}
                            onChange={(e) => setFilterUser(e.target.value)}
                        >
                            <option value="">Todos los usuarios</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id}>{u.email}</option>
                            ))}
                        </select>
                    )}

                    <select
                        className="input"
                        style={{ padding: "4px 8px", width: "auto", fontSize: 13 }}
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                    >
                        <option value="">Todos</option>
                        <option value="purchase">Compras</option>
                        <option value="topup">Recargas</option>
                        <option value="profit">Ganancias (Ventas)</option>
                    </select>

                    <div style={{ fontSize: 13, color: "rgba(234,241,255,.65)" }}>
                        Total: <b>{total}</b>
                    </div>
                </div>
            </div>

            {error ? <div className="error">{error}</div> : null}

            {loading ? (
                <div style={{ color: "rgba(234,241,255,.65)" }}>Cargando historial...</div>
            ) : (
                <>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                            <thead>
                                <tr style={{ textAlign: "left", color: "rgba(234,241,255,.75)" }}>
                                    <th style={{ padding: "10px 8px" }}>Fecha</th>
                                    {users && <th style={{ padding: "10px 8px" }}>Usuario (Beneficiario)</th>}
                                    <th style={{ padding: "10px 8px" }}>Tipo</th>
                                    <th style={{ padding: "10px 8px" }}>Concepto</th>
                                    <th style={{ padding: "10px 8px", textAlign: "right" }}>Monto</th>
                                    <th style={{ padding: "10px 8px", textAlign: "right" }}>Saldo Disp.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.map((t) => (
                                    <tr key={t.id} style={{ borderTop: "1px solid rgba(46,123,255,.12)" }}>
                                        <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                                            {new Date(t.created_at).toLocaleString()}
                                        </td>
                                        {users && <td style={{ padding: "10px 8px" }}>{t.user_email || `ID: ${t.user_id}`}</td>}
                                        <td style={{ padding: "10px 8px" }}>
                                            <span style={{
                                                backgroundColor: "rgba(255,255,255,0.05)",
                                                padding: "2px 6px",
                                                borderRadius: 4,
                                                fontSize: 12
                                            }}>
                                                {getTypeLabel(t.type)}
                                            </span>
                                        </td>
                                        <td style={{ padding: "10px 8px", color: "rgba(234,241,255,.8)" }}>{t.note}</td>
                                        <td style={{ padding: "10px 8px", textAlign: "right" }}>{formatAmount(t.amount)}</td>
                                        <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 500 }}>
                                            {Number(t.balance_after).toLocaleString("es-CO")}
                                        </td>
                                    </tr>
                                ))}
                                {!transactions.length ? (
                                    <tr>
                                        <td colSpan={users ? "6" : "5"} style={{ padding: 12, color: "rgba(234,241,255,.65)", textAlign: "center" }}>
                                            No hay transacciones registradas.
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {total > 0 && (
                        <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end", paddingRight: 10 }}>
                            <div style={{ color: "rgba(234,241,255,.8)", marginRight: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                                <span>Mostrar:</span>
                                <select
                                    className="input"
                                    style={{ padding: "4px 8px", width: "auto" }}
                                    value={limit}
                                    onChange={(e) => loadData(1, Number(e.target.value), filterType, filterUser)}
                                >
                                    <option value={5}>5</option>
                                    <option value={10}>10</option>
                                    <option value={20}>20</option>
                                    <option value={50}>50</option>
                                </select>
                            </div>
                            <button
                                className="btn-ghost"
                                disabled={page <= 1 || loading}
                                onClick={() => loadData(page - 1, limit, filterType, filterUser)}
                            >
                                Anterior
                            </button>
                            <span style={{ color: "rgba(234,241,255,.8)" }}>
                                Página {page} de {totalPages || 1}
                            </span>
                            <button
                                className="btn-ghost"
                                disabled={page >= totalPages || loading}
                                onClick={() => loadData(page + 1, limit, filterType, filterUser)}
                            >
                                Siguiente
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
