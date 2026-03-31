export default function UsersTable({ users, loading, page, limit, total, totalPages, loadUsers, onViewHistory }) {
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
                                    <th style={{ padding: "10px 8px" }}>ID</th>
                                    <th style={{ padding: "10px 8px" }}>Email</th>
                                    <th style={{ padding: "10px 8px" }}>Rol</th>
                                    <th style={{ padding: "10px 8px" }}>Estado</th>
                                    <th style={{ padding: "10px 8px" }}>Saldo</th>
                                    <th style={{ padding: "10px 8px" }}>Ganancia</th>
                                    <th style={{ padding: "10px 8px" }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id} style={{ borderTop: "1px solid rgba(46,123,255,.12)" }}>
                                        <td style={{ padding: "10px 8px" }}>#{u.id}</td>
                                        <td style={{ padding: "10px 8px" }}>{u.email}</td>
                                        <td style={{ padding: "10px 8px" }}>{u.role}</td>
                                        <td style={{ padding: "10px 8px" }}>{u.status}</td>
                                        <td style={{ padding: "10px 8px" }}>
                                            {Number(u.balance).toLocaleString()} {u.currency}
                                        </td>
                                        <td style={{ padding: "10px 8px", color: "#10b981", fontWeight: 700 }}>
                                            {Number(u.profit_total).toLocaleString()} {u.currency}
                                        </td>
                                        <td style={{ padding: "10px 8px" }}>
                                            <button
                                                className="btn-ghost"
                                                style={{ padding: "4px 8px", fontSize: 13 }}
                                                onClick={() => onViewHistory(u)}
                                            >
                                                Ver historial
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {!users.length ? (
                                    <tr>
                                        <td colSpan="7" style={{ padding: 12, color: "rgba(234,241,255,.65)" }}>
                                            No hay usuarios.
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
                                onChange={(e) => loadUsers(1, Number(e.target.value))}
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
                            onClick={() => loadUsers(page - 1, limit)}
                        >
                            Anterior
                        </button>
                        <span style={{ color: "rgba(234,241,255,.8)" }}>
                            Página {page} de {totalPages || 1}
                        </span>
                        <button
                            className="btn-ghost"
                            disabled={page >= totalPages || loading}
                            onClick={() => loadUsers(page + 1, limit)}
                        >
                            Siguiente
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
