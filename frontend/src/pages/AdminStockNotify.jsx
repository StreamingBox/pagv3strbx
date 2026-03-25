import { useState, useEffect } from "react";
import { apiFetch } from "../api/api";
import { motion, AnimatePresence } from "framer-motion";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";

export default function AdminStockNotify() {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);

    // Modal de confirmación propio (window.confirm puede bloquearse en dev)
    const [confirmId, setConfirmId] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [toast, setToast] = useState(null); // { msg, type }

    function showToast(msg, type = "ok") {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    }

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

    async function confirmDelete() {
        if (!confirmId) return;
        setDeleting(true);
        try {
            const res = await apiFetch(`/admin/stock-subscriptions/${confirmId}`, { method: "DELETE" });
            if (res.ok) {
                setAlerts(prev => prev.filter(x => x.id !== confirmId));
                showToast("✅ Alerta marcada como resuelta.", "ok");
            } else {
                showToast(res.data?.message || "Error al eliminar la alerta.", "err");
            }
        } catch {
            showToast("Error de red al eliminar la alerta.", "err");
        } finally {
            setDeleting(false);
            setConfirmId(null);
        }
    }

    const confirmAlert = alerts.find(a => a.id === confirmId);

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden>
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />
            </div>

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
                                                        onClick={() => setConfirmId(a.id)}
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
                                                            transition: "background 0.2s",
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.background = "rgba(16,185,129,.25)"}
                                                        onMouseLeave={e => e.currentTarget.style.background = "rgba(16,185,129,.12)"}
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

            {/* ── Modal de confirmación ── */}
            <AnimatePresence>
                {confirmId && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: "fixed", inset: 0, background: "rgba(0,0,0,.7)",
                            display: "flex", justifyContent: "center", alignItems: "center",
                            zIndex: 9999, padding: 20,
                        }}
                        onClick={e => e.target === e.currentTarget && !deleting && setConfirmId(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.94, y: 16 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.94 }}
                            style={{
                                background: "var(--card)", border: "1px solid var(--stroke)",
                                borderRadius: 20, padding: 28, maxWidth: 400, width: "100%",
                                boxShadow: "0 24px 80px rgba(0,0,0,.7)",
                            }}
                        >
                            <div style={{ fontSize: 28, marginBottom: 10 }}>🔔</div>
                            <div style={{ fontWeight: 800, fontSize: 17, color: "var(--text)", marginBottom: 8 }}>
                                Marcar como resuelta
                            </div>
                            {confirmAlert && (
                                <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>
                                    ¿Eliminar la alerta de stock de <b style={{ color: "var(--text)" }}>{confirmAlert.user_name}</b> para <b style={{ color: "var(--text)" }}>{confirmAlert.platform_name}</b>?
                                </p>
                            )}
                            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                                <button
                                    onClick={() => setConfirmId(null)}
                                    disabled={deleting}
                                    style={{
                                        height: 40, padding: "0 18px", borderRadius: 10,
                                        border: "1px solid var(--stroke)", background: "transparent",
                                        color: "var(--text)", cursor: "pointer",
                                        fontFamily: "var(--font)", fontWeight: 600, fontSize: 13,
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    disabled={deleting}
                                    style={{
                                        height: 40, padding: "0 20px", borderRadius: 10, border: "none",
                                        background: "linear-gradient(135deg,#10b981,#059669)",
                                        color: "#fff", fontWeight: 700, fontSize: 13,
                                        cursor: deleting ? "not-allowed" : "pointer",
                                        fontFamily: "var(--font)",
                                        opacity: deleting ? 0.7 : 1,
                                        boxShadow: "0 4px 14px rgba(16,185,129,.35)",
                                    }}
                                >
                                    {deleting ? "Eliminando..." : "✅ Confirmar resuelto"}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Toast de feedback ── */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 30, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        style={{
                            position: "fixed", bottom: 28, right: 28, zIndex: 99999,
                            padding: "14px 20px", borderRadius: 14,
                            background: toast.type === "ok"
                                ? "linear-gradient(135deg,#10b981,#059669)"
                                : "linear-gradient(135deg,#ef4444,#dc2626)",
                            color: "#fff", fontWeight: 700, fontSize: 14,
                            boxShadow: "0 8px 32px rgba(0,0,0,.4)",
                            maxWidth: 340,
                        }}
                    >
                        {toast.msg}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
