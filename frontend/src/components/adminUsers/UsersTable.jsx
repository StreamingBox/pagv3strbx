export default function UsersTable({ users, loading }) {
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
                            <th style={{ padding: "10px 8px" }}>ID</th>
                            <th style={{ padding: "10px 8px" }}>Email</th>
                            <th style={{ padding: "10px 8px" }}>Rol</th>
                            <th style={{ padding: "10px 8px" }}>Estado</th>
                            <th style={{ padding: "10px 8px" }}>Saldo</th>
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
                            </tr>
                        ))}
                        {!users.length ? (
                            <tr>
                                <td colSpan="5" style={{ padding: 12, color: "rgba(234,241,255,.65)" }}>
                                    No hay usuarios.
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
