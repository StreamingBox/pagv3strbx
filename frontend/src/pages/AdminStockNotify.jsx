import { useState, useEffect } from "react";
import { apiFetch } from "../api/api";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";

export default function AdminStockNotify() {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);

    async function loadAlerts() {
        setLoading(true);
        setErr(null);
        try {
            const res = await apiFetch("/admin/stock-subscriptions");
            if (res.ok) {
                setAlerts(Array.isArray(res.data) ? res.data : []);
            } else {
                setErr(res.data?.message || "Error cargando alertas");
            }
        } catch (e) {
            setErr(e?.message || "Error cargando alertas");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadAlerts(); }, []);

    const handleDelete = async (id) => {
        if (!window.confirm("¿Marcar como resuelto / eliminar esta alerta?")) return;
        try {
            const res = await apiFetch(`/admin/stock-subscriptions/${id}`, { method: "DELETE" });
            if (res.ok) {
                setAlerts(prev => prev.filter(x => x.id !== id));
            } else {
                alert(res.data?.message || "Error al eliminar la alerta.");
            }
        } catch {
            alert("Error de red al eliminar la alerta.");
        }
    };

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                <AdminSidebar />

                <main className="main" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div className="dash-header">
                        <h1 style={{ margin: 0 }}>🔔 Alertas de Stock</h1>
                        <p style={{ color: "var(--muted)", margin: "4px 0 0 0" }}>
                            Usuarios que solicitaron aviso cuando haya stock
                        </p>
                    </div>

                    <div style={{
                        background: "var(--card)",
                        border: "1px solid var(--stroke)",
                        borderRadius: 16,
                        padding: 24,
                        minHeight: 300,
                    }}>
                        {loading && <p style={{ color: "var(--muted)" }}>Cargando alertas...</p>}
                        {err && <p style={{ color: "#ef4444" }}>Error: {err}</p>}
                        {!loading && !err && alerts.length === 0 && (
                            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)" }}>
                                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                                <p>No hay solicitudes pendientes de stock.</p>
                            </div>
                        )}
                        {!loading && alerts.length > 0 && (
                            <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ background: "rgba(0,0,0,0.25)", textAlign: "left" }}>
                                            {["Usuario", "Producto", "Duración", "Fecha", "Acción"].map(h => (
                                                <th key={h} style={{ padding: "12px 16px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.7px", whiteSpace: "nowrap" }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {alerts.map(a => (
                                            <tr key={a.id} style={{ borderBottom: "1px solid var(--stroke)" }}>
                                                <td style={{ padding: "12px 16px" }}>
                                                    <div style={{ fontWeight: 600 }}>{a.user_name}</div>
                                                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{a.user_email}</div>
                                                </td>
                                                <td style={{ padding: "12px 16px", fontWeight: 600 }}>{a.platform_name}</td>
                                                <td style={{ padding: "12px 16px", color: "var(--muted)" }}>{a.duration_name}</td>
                                                <td style={{ padding: "12px 16px", color: "var(--muted)", fontSize: 12 }}>
                                                    {new Date(a.created_at).toLocaleString("es-CO")}
                                                </td>
                                                <td style={{ padding: "12px 16px" }}>
                                                    <button
                                                        onClick={() => handleDelete(a.id)}
                                                        style={{
                                                            background: "rgba(16,185,129,.12)",
                                                            color: "#10b981",
                                                            border: "1px solid rgba(16,185,129,.3)",
                                                            padding: "6px 14px",
                                                            borderRadius: 8,
                                                            cursor: "pointer",
                                                            fontWeight: 700,
                                                            fontSize: 12,
                                                            fontFamily: "var(--font)",
                                                        }}
                                                    >
                                                        ✅ Resuelto
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
