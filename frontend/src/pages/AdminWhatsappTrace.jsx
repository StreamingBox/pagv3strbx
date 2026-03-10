import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Filter, AlertCircle, CheckCircle2, Clock, User } from "lucide-react";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { apiFetch, apiLogout } from "../api/api";
import "../styles/special-effects.css";

const STATUS_OPTIONS = [
    { value: "all", label: "Todos los estados" },
    { value: "pending", label: "Pendiente (cola)" },
    { value: "sent", label: "Enviado (interno)" },
    { value: "failed", label: "Fallido" },
    { value: "delivered", label: "Entregado" },
    { value: "read", label: "Leído" },
    { value: "played", label: "Reproducido" },
    { value: "error", label: "Error proveedor" },
];

function resolveStatus(item) {
    const wa = String(item?.wa_status_label || "").toLowerCase();
    const internal = String(item?.status || "").toLowerCase();
    if (wa && wa !== "unknown") return wa;
    if (internal) return internal;
    return "unknown";
}

function statusBadge(status) {
    const base = {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 10px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 700,
    };

    if (status === "delivered") {
        return (
            <span style={{ ...base, background: "rgba(34,197,94,0.16)", color: "#22c55e" }}>
                <CheckCircle2 size={12} /> Entregado
            </span>
        );
    }
    if (status === "read") {
        return (
            <span style={{ ...base, background: "rgba(6,182,212,0.18)", color: "#22d3ee" }}>
                <CheckCircle2 size={12} /> Leído
            </span>
        );
    }
    if (status === "played") {
        return (
            <span style={{ ...base, background: "rgba(139,92,246,0.18)", color: "#a78bfa" }}>
                <CheckCircle2 size={12} /> Reproducido
            </span>
        );
    }
    if (status === "sent") {
        return (
            <span style={{ ...base, background: "rgba(16,185,129,0.15)", color: "#10b981" }}>
                <CheckCircle2 size={12} /> Enviado
            </span>
        );
    }
    if (status === "pending") {
        return (
            <span style={{ ...base, background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
                <Clock size={12} /> Pendiente
            </span>
        );
    }
    if (status === "unknown") {
        return (
            <span style={{ ...base, background: "rgba(148,163,184,0.18)", color: "#cbd5e1" }}>
                <Clock size={12} /> Sin confirmación
            </span>
        );
    }
    return (
        <span style={{ ...base, background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
            <AlertCircle size={12} /> Error
        </span>
    );
}

export default function AdminWhatsappTrace() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [statusFilter, setStatusFilter] = useState("all");
    const [phoneFilter, setPhoneFilter] = useState("");
    const [limit, setLimit] = useState(20);

    async function logout() {
        try { await apiLogout(); } catch { }
        setUser(null);
        try {
            localStorage.removeItem("user");
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
        } catch { }
        navigate("/", { replace: true });
    }

    useEffect(() => {
        let mounted = true;
        async function load() {
            setLoading(true);
            try {
                const query = new URLSearchParams({
                    page: String(page),
                    limit: String(limit),
                    status: statusFilter,
                    phone: phoneFilter,
                });
                const r = await apiFetch(`/admin/whatsapp/queue?${query.toString()}`, { method: "GET" });
                if (!r.ok) throw new Error(r.data?.message || "No se pudo cargar la traza.");
                if (!mounted) return;
                setItems(Array.isArray(r.data?.items) ? r.data.items : []);
                setTotalPages(Number(r.data?.pages || 1));
                setTotalItems(Number(r.data?.total || 0));
            } catch (e) {
                console.error(e);
                if (mounted) {
                    setItems([]);
                    setTotalPages(1);
                    setTotalItems(0);
                }
            } finally {
                if (mounted) setLoading(false);
            }
        }
        const t = setTimeout(load, 300);
        return () => {
            mounted = false;
            clearTimeout(t);
        };
    }, [page, limit, statusFilter, phoneFilter]);

    const inputStyle = {
        padding: "10px 14px",
        borderRadius: 12,
        border: "1px solid var(--stroke)",
        background: "var(--input-bg)",
        color: "var(--text)",
        fontSize: 13,
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
        fontFamily: "var(--font)",
    };

    return (
        <div className="page-shell">
            <div className="bg-grid" />
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />

            <div className="page-inner">
                <AdminSidebar
                    user={user}
                    logoSrc="/api/branding/logo"
                    logoOk={true}
                    setLogoOk={() => {}}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main" style={{ padding: "20px 24px 40px" }}>
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            marginBottom: 28,
                            paddingBottom: 20,
                            borderBottom: "1px solid var(--stroke)",
                            flexWrap: "wrap",
                            gap: 16,
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{
                                width: 48,
                                height: 48,
                                borderRadius: 14,
                                background: "linear-gradient(135deg, rgba(13,166,242,0.18), rgba(139,92,246,0.18))",
                                border: "1px solid rgba(13,166,242,0.35)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 24,
                                boxShadow: "0 4px 16px rgba(13,166,242,0.2)",
                                flexShrink: 0,
                            }}>
                                📡
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" }}>
                                    Traza de WhatsApp
                                </h1>
                                <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--muted)" }}>
                                    Monitoreo de envíos, estado WaSender y usuario emisor.
                                </p>
                            </div>
                        </div>

                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            background: "var(--card)",
                            padding: "8px 16px",
                            borderRadius: 12,
                            border: "1px solid var(--stroke)",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                        }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0da6f2", boxShadow: "0 0 8px #0da6f2" }} />
                            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                Mensajes procesados
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: "var(--text)", marginLeft: 8 }}>{totalItems}</div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        style={{
                            background: "var(--card)",
                            border: "1px solid var(--stroke)",
                            borderRadius: 16,
                            padding: "16px 20px",
                            marginBottom: 24,
                            boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
                        }}
                    >
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                            <div style={{ position: "relative" }}>
                                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}>
                                    <Search size={16} />
                                </span>
                                <input
                                    type="text"
                                    style={{ ...inputStyle, paddingLeft: 36 }}
                                    value={phoneFilter}
                                    onChange={(e) => { setPhoneFilter(e.target.value); setPage(1); }}
                                    placeholder="Buscar por teléfono..."
                                />
                            </div>

                            <div style={{ position: "relative" }}>
                                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}>
                                    <Filter size={16} />
                                </span>
                                <select
                                    style={{ ...inputStyle, paddingLeft: 36, appearance: "none", cursor: "pointer" }}
                                    value={statusFilter}
                                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                                >
                                    {STATUS_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--muted)", pointerEvents: "none" }}>
                                    ▼
                                </span>
                            </div>
                            <div style={{ position: "relative" }}>
                                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}>
                                    <Filter size={16} />
                                </span>
                                <select
                                    style={{ ...inputStyle, paddingLeft: 36, appearance: "none", cursor: "pointer" }}
                                    value={String(limit)}
                                    onChange={(e) => {
                                        setLimit(Number(e.target.value) || 20);
                                        setPage(1);
                                    }}
                                >
                                    <option value="10">10 por pagina</option>
                                    <option value="20">20 por pagina</option>
                                    <option value="50">50 por pagina</option>
                                </select>
                                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--muted)", pointerEvents: "none" }}>
                                    ▼
                                </span>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        style={{
                            background: "var(--card)",
                            border: "1px solid var(--stroke)",
                            borderRadius: 16,
                            boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
                            overflow: "hidden",
                        }}
                    >
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                                <thead>
                                    <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--stroke)" }}>
                                        <th style={{ padding: "14px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px" }}>ID</th>
                                        <th style={{ padding: "14px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px" }}>Teléfono</th>
                                        <th style={{ padding: "14px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px" }}>Mensaje / Error</th>
                                        <th style={{ padding: "14px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px" }}>Enviado por</th>
                                        <th style={{ padding: "14px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px" }}>Estado</th>
                                        <th style={{ padding: "14px 16px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px" }}>Fechas</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={6} style={{ padding: 30, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                                                Cargando traza...
                                            </td>
                                        </tr>
                                    ) : items.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                                                <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.5 }}>💭</div>
                                                No se encontraron registros.
                                            </td>
                                        </tr>
                                    ) : (
                                        items.map((item) => {
                                            const resolved = resolveStatus(item);
                                            const sender = item.sender_name || item.sender_email || `Usuario #${item.created_by_user_id || "N/A"}`;
                                            const source = item.source || "queue";
                                            return (
                                                <tr
                                                    key={item.id}
                                                    style={{ borderBottom: "1px solid var(--stroke)", transition: "background 0.2s" }}
                                                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                                                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                                                >
                                                    <td style={{ padding: "14px 16px", color: "var(--muted)", fontSize: 12, fontFamily: "monospace" }}>#{item.id}</td>
                                                    <td style={{ padding: "14px 16px", color: "var(--text)", fontSize: 13, fontWeight: 600 }}>{item.phone}</td>
                                                    <td style={{ padding: "14px 16px", maxWidth: 300 }}>
                                                        <div style={{ fontSize: 12, color: "var(--text)", whiteSpace: "pre-wrap", opacity: 0.85, maxHeight: 60, overflowY: "auto", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
                                                            {item.message}
                                                        </div>
                                                        {item.error_message && (
                                                            <div style={{ marginTop: 6, fontSize: 11, color: "#ef4444", background: "rgba(239, 68, 68, 0.1)", padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                                                                Error: {item.error_message}
                                                            </div>
                                                        )}
                                                        {item.wasender_msg_id && (
                                                            <div style={{ marginTop: 5, fontSize: 10, color: "var(--muted)", fontFamily: "monospace" }}>
                                                                msgId: {item.wasender_msg_id}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: "14px 16px" }}>
                                                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text)", fontSize: 12, fontWeight: 600 }}>
                                                                <User size={12} /> {sender}
                                                            </span>
                                                            <span style={{ fontSize: 11, color: "var(--muted)" }}>
                                                                Rol: {item.sender_role || item.created_by_role || "N/A"} · Origen: {source}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: "14px 16px" }}>
                                                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                                            {statusBadge(resolved)}
                                                            {Number.isFinite(Number(item.wa_status_code)) && (
                                                                <span style={{ fontSize: 10, color: "var(--muted)" }}>
                                                                    WA status: {item.wa_status_code}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 11, color: "var(--muted)" }}>
                                                        <div><span style={{ opacity: 0.6 }}>Creado:</span> {new Date(item.created_at).toLocaleString("es-CO")}</div>
                                                        {item.sent_at && (
                                                            <div style={{ marginTop: 4 }}><span style={{ opacity: 0.6 }}>Enviado:</span> {new Date(item.sent_at).toLocaleString("es-CO")}</div>
                                                        )}
                                                        {item.updated_at && (
                                                            <div style={{ marginTop: 4 }}><span style={{ opacity: 0.6 }}>Actualizado:</span> {new Date(item.updated_at).toLocaleString("es-CO")}</div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {!loading && totalItems > 0 && (
                            <div style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "16px 20px",
                                borderTop: "1px solid var(--stroke)",
                                background: "var(--bg0)",
                            }}>
                                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                                    Página <b style={{ color: "var(--text)" }}>{page}</b> de <b style={{ color: "var(--text)" }}>{totalPages}</b>
                                </div>
                                <div style={{ display: "flex", gap: 10 }}>
                                    <button
                                        className="btn-ghost"
                                        disabled={page <= 1}
                                        onClick={() => setPage((p) => p - 1)}
                                        style={{ padding: "6px 14px", fontSize: 12, borderRadius: 8, opacity: page <= 1 ? 0.5 : 1 }}
                                    >
                                        Anterior
                                    </button>
                                    <button
                                        className="btn-ghost"
                                        disabled={page >= totalPages}
                                        onClick={() => setPage((p) => p + 1)}
                                        style={{ padding: "6px 14px", fontSize: 12, borderRadius: 8, opacity: page >= totalPages ? 0.5 : 1 }}
                                    >
                                        Siguiente
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </main>
            </div>
        </div>
    );
}
