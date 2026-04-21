import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { apiFetch as baseApiFetch, apiLogout } from "../api/api";
import Sidebar from "../components/dashboard/Sidebar";
async function apiFetch(path, opts = {}) {
    const res = await baseApiFetch(path, opts);
    if (!res.ok) throw new Error(res.data?.message || "Error en la solicitud");
    return res.data;
}

export default function UserExpirations() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();

    async function logout() {
        try { await apiLogout(); } catch { }
        setUser(null);
        navigate("/", { replace: true });
    }

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [q, setQ] = useState("");
    const [platform, setPlatform] = useState("all");
    const [platforms, setPlatforms] = useState([]);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const limit = 20;

    const [remindModalOpen, setRemindModalOpen] = useState(false);
    const [remindItem, setRemindItem] = useState(null);
    const [remindPhone, setRemindPhone] = useState("");
    const [reminding, setReminding] = useState(false);
    const [remindMsg, setRemindMsg] = useState({ type: "", text: "" });

    useEffect(() => {
        let mounted = true;
        async function loadPlatforms() {
            try {
                const r = await apiFetch("/platforms");
                if (mounted && r) setPlatforms(r);
            } catch (e) {
                console.error(e);
            }
        }
        loadPlatforms();
        return () => { mounted = false; };
    }, []);

    useEffect(() => {
        let mounted = true;
        async function loadData() {
            setLoading(true);
            setError("");
            try {
                const params = new URLSearchParams();
                params.set("page", page);
                params.set("limit", limit);
                if (q.trim()) params.set("q", q.trim());
                if (platform !== "all") params.set("platform", platform);

                const data = await apiFetch(`/orders/expiring?${params.toString()}`);
                if (!mounted) return;

                if (data && data.items) {
                    setItems(data.items);
                    setTotalPages(data.pages);
                    setTotalItems(data.total);
                }
            } catch (err) {
                if (mounted) setError(err.message);
            } finally {
                if (mounted) setLoading(false);
            }
        }

        const t = setTimeout(loadData, 300);
        return () => { mounted = false; clearTimeout(t); };
    }, [page, q, platform]);

    function getDaysLeft(expiryStr) {
        if (!expiryStr) return null;
        const diff = new Date(expiryStr) - new Date();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }

    function renderDaysBadge(days) {
        if (days === null) return <span style={{ color: "var(--muted)" }}>—</span>;
        if (days < 0) return <span style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>Vencida ({Math.abs(days)}d)</span>;
        if (days === 0) return <span style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>Vence hoy</span>;
        if (days <= 3) return <span style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{days} días</span>;
        return <span style={{ background: "rgba(16,185,129,0.15)", color: "#10b981", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{days} días</span>;
    }

    function openRemindModal(item) {
        if (item.reminder_sent) {
            return alert("Ya se le ha enviado un recordatorio a esta cuenta. No se permite reenviar para evitar spam.");
        }
        setRemindItem(item);
        setRemindPhone(item.whatsapp_phone || "");
        setRemindMsg({ type: "", text: "" });
        setRemindModalOpen(true);
    }

    async function confirmRemind() {
        if (!remindPhone.trim()) {
            setRemindMsg({ type: "error", text: "El número es obligatorio" });
            return;
        }
        setReminding(true);
        setRemindMsg({ type: "", text: "" });

        const finalPhone = remindPhone.trim();

        try {
            const res = await apiFetch(`/orders/${remindItem.id}/remind-whatsapp`, { 
                method: "POST",
                body: JSON.stringify({ whatsappPhone: finalPhone }) 
            });
            if (res && res.ok) {
                setRemindMsg({ type: "success", text: "✅ Recordatorio enviado exitosamente a WhatsApp." });
                setItems(prev => prev.map(o => o.id === remindItem.id ? { ...o, reminder_sent: 1, whatsapp_phone: finalPhone } : o));
                setTimeout(() => {
                    setRemindModalOpen(false);
                }, 1500);
            }
        } catch (e) {
            setRemindMsg({ type: "error", text: "❌ " + (e.message || "Error enviando recordatorio.") });
        } finally {
            setReminding(false);
        }
    }

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden>
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />
            </div>

            <div className="page-inner">
                <Sidebar
                    user={user}
                    wallet={null}
                    cartCount={0}
                    onOpenCart={() => { }}
                    onGoOrders={() => navigate("/orders")}
                    onGoRenewals={() => navigate("/renewals")}
                    onGoWallet={() => navigate("/topups")}
                    onGoAnalytics={() => navigate("/analytics")}
                    onGoCodes={() => navigate("/codes")}
                    onGoCodeLogs={() => navigate("/admin/code-logs")}
                    onGoAdmin={() => navigate("/admin")}
                    onGoExpirations={() => navigate("/expirations")}
                    onGoHome={() => navigate("/dashboard")}
                    onLogout={logout}
                />

                <main className="main">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, gap: 20, flexWrap: "wrap" }}>
                        <div>
                            <h1 style={{ margin: "0 0 6px" }}>⏱️ Próximas a Vencer</h1>
                            <p style={{ color: "var(--muted)", margin: 0 }}>
                                Tus cuentas que vencen en los próximos 3 días o que ya han vencido.
                            </p>
                        </div>
                        <div style={{ display: "flex", gap: 12 }}>
                            <div className="kpi" style={{ padding: "10px 16px", minWidth: 100 }}>
                                <div style={{ fontSize: 11, color: "var(--muted)" }}>Cuentas listadas</div>
                                <div style={{ fontSize: 18, fontWeight: 800 }}>{totalItems}</div>
                            </div>
                        </div>
                    </div>

                    <div className="kpi" style={{ padding: 20 }}>
                        {/* Filtros */}
                        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                            <input
                                className="input"
                                style={{ flex: 1, minWidth: 200 }}
                                value={q}
                                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                                placeholder="🔎 Buscar por ID de Pedido..."
                            />
                            <select
                                className="input"
                                style={{ minWidth: 200 }}
                                value={platform}
                                onChange={(e) => { setPlatform(e.target.value); setPage(1); }}
                            >
                                <option value="all">Todas las plataformas</option>
                                {platforms.map((p) => (
                                    <option key={p.id} value={p.slug}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

                        {/* Tabla */}
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                                <thead>
                                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", color: "var(--muted)" }}>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>ID</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>Plataforma</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>Cuenta Asignada</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>Vence</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>Estado</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600, textAlign: "right" }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={6} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Cargando vencimientos...</td></tr>
                                    ) : items.length === 0 ? (
                                        <tr><td colSpan={6} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>No tienes cuentas próximas a vencer en este momento.</td></tr>
                                    ) : (
                                        items.map((item) => {
                                            const daysLeft = getDaysLeft(item.expires_at);
                                            return (
                                                <tr key={item.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                                    <td style={{ padding: "12px 8px", fontFamily: "monospace", opacity: 0.8 }}>{item.id}</td>
                                                    <td style={{ padding: "12px 8px" }}>
                                                        <span style={{ background: "rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>
                                                            {item.platform_name}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: "12px 8px", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.account_email}>
                                                        {item.account_email || <span style={{ color: "var(--muted)" }}>Sin asignar</span>}
                                                        {item.profile_number && <span style={{ opacity: 0.5 }}> (P{item.profile_number})</span>}
                                                    </td>
                                                    <td style={{ padding: "12px 8px", fontSize: 11, color: "var(--muted)" }}>
                                                        {item.expires_at ? new Date(item.expires_at).toLocaleDateString("es-CO") : "—"}
                                                    </td>
                                                    <td style={{ padding: "12px 8px" }}>
                                                        {renderDaysBadge(daysLeft)}
                                                    </td>
                                                    <td style={{ padding: "12px 8px", textAlign: "right" }}>
                                                        <button
                                                            className="btn-ghost"
                                                            title={item.reminder_sent ? "Recordatorio ya enviado" : (item.whatsapp_phone ? `Enviar recordatorio por WA a ${item.whatsapp_phone}` : "No hay número guardado, haz clic para ingresarlo")}
                                                            disabled={item.reminder_sent}
                                                            style={{
                                                                padding: "5px 10px", fontSize: 11, fontWeight: 700, borderRadius: 8,
                                                                color: item.reminder_sent ? "var(--muted)" : "#10b981",
                                                                background: item.reminder_sent ? "rgba(255,255,255,0.05)" : "rgba(16,185,129,0.1)",
                                                                border: `1px solid ${item.reminder_sent ? "var(--stroke)" : "rgba(16,185,129,0.3)"}`,
                                                                cursor: item.reminder_sent ? "not-allowed" : "pointer",
                                                                opacity: item.reminder_sent ? 0.6 : 1
                                                            }}
                                                            onClick={() => !item.reminder_sent && openRemindModal(item)}
                                                        >
                                                            {item.reminder_sent ? "🔕" : "🔔 Enviar"}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Paginación */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
                            <button
                                className="btn"
                                disabled={page === 1}
                                onClick={() => setPage(page - 1)}
                                style={{ width: "auto", padding: "6px 14px", fontSize: 13, opacity: page === 1 ? 0.3 : 1 }}
                            >
                                Anterior
                            </button>

                            <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                                    Página <b style={{ color: "#fff" }}>{page}</b> de {totalPages || 1}
                                </span>
                            </div>

                            <button
                                className="btn"
                                disabled={page === totalPages || totalPages === 0}
                                onClick={() => setPage(page + 1)}
                                style={{ width: "auto", padding: "6px 14px", fontSize: 13, opacity: (page === totalPages || totalPages === 0) ? 0.3 : 1 }}
                            >
                                Siguiente
                            </button>
                        </div>
                    </div>
                </main>
            </div>

            {/* Modal Recordatorio WA */}
            <AnimatePresence>
                {remindModalOpen && remindItem && (
                    <div style={{
                        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: "rgba(0,0,0,0.6)",
                        backdropFilter: "blur(4px)",
                        zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
                        padding: 20
                    }}>
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            style={{
                                background: "var(--card-bg)",
                                border: "1px solid var(--stroke)",
                                borderRadius: 16,
                                padding: 24,
                                width: "100%", maxWidth: 400,
                                position: "relative"
                            }}
                        >
                            <button
                                onClick={() => setRemindModalOpen(false)}
                                style={{
                                    position: "absolute", top: 16, right: 16,
                                    background: "transparent", border: "none", color: "var(--muted)",
                                    cursor: "pointer"
                                }}
                            >
                                <X size={20} />
                            </button>

                            <h3 style={{ margin: "0 0 16px", fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 24 }}>🔔</span>
                                Enviar Recordatorio
                            </h3>

                            <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
                                Vas a enviar un mensaje de WhatsApp al cliente recordando el vencimiento de la cuenta <b style={{color: "var(--fg)"}}>{remindItem.platform_name}</b>.
                            </p>

                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6, fontWeight: 600 }}>Número de WhatsApp</label>
                                <input
                                    className="input"
                                    type="text"
                                    placeholder="+57300..."
                                    value={remindPhone}
                                    onChange={(e) => setRemindPhone(e.target.value)}
                                    style={{ width: "100%" }}
                                />
                            </div>

                            {remindMsg.text && (
                                <div style={{
                                    padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 16,
                                    background: remindMsg.type === "success" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                                    color: remindMsg.type === "success" ? "#10b981" : "#ef4444",
                                    border: `1px solid ${remindMsg.type === "success" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`
                                }}>
                                    {remindMsg.text}
                                </div>
                            )}

                            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                                <button
                                    className="btn-ghost"
                                    onClick={() => setRemindModalOpen(false)}
                                    disabled={reminding}
                                    style={{ padding: "8px 16px", fontSize: 13 }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    className="btn"
                                    onClick={confirmRemind}
                                    disabled={reminding}
                                    style={{ padding: "8px 16px", fontSize: 13 }}
                                >
                                    {reminding ? "Enviando..." : "Enviar Recordatorio"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
