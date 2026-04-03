import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiFetch, apiLogout } from "../api/api.js";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";
import { formatBogotaDate } from "../utils/datetime.js";

function fmtDateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("es-CO", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(d).replace(",", "");
}

export default function AdminReplacements() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();
    const [items, setItems] = useState([]);
    const [page, setPage] = useState(1);
    const [limit] = useState(20);
    const [total, setTotal] = useState(0);
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function logout() {
        try { await apiLogout(); } catch {}
        setUser(null);
        navigate("/", { replace: true });
    }

    const load = useCallback(async (nextPage = 1) => {
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams({ page: String(nextPage), limit: String(limit) });
            if (q.trim()) params.set("q", q.trim());
            const { ok, data } = await apiFetch(`/admin/replacements?${params.toString()}`, { method: "GET" });
            if (!ok) throw new Error(data?.message || "No se pudo cargar el historial.");
            setItems(data.items || []);
            setPage(Number(data.page || nextPage));
            setTotal(Number(data.total || 0));
        } catch (e) {
            setError(e.message || "Error cargando historial.");
            setItems([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [limit, q]);

    useEffect(() => { void load(1); }, [load]);

    const totalPages = Math.max(Math.ceil(total / limit), 1);

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden>
                <div className="bg-orb orb-1" />
                <div className="bg-orb orb-2" />
                <div className="bg-grid" />
            </div>

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
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, gap: 20, flexWrap: "wrap", borderBottom: "1px solid var(--stroke)", paddingBottom: 24 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 4px 16px rgba(16,185,129,0.2)" }}>
                                🔁
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)" }}>Historial de Reemplazos</h1>
                                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>Consulta qué cuentas fueron reemplazadas, cuándo y por quién.</p>
                            </div>
                        </div>
                    </motion.div>

                    <div style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 14, padding: 16, marginBottom: 18, display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && load(1)}
                            placeholder="Buscar por subscription, orden, cuenta o admin"
                            style={{ flex: 1, minWidth: 260, height: 40, padding: "0 14px", background: "var(--input-bg)", color: "var(--text)", border: "1px solid var(--stroke)", borderRadius: 10, fontSize: 13 }}
                        />
                        <button
                            onClick={() => load(1)}
                            disabled={loading}
                            style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#10b981,#0da6f2)", color: "#fff", fontWeight: 700, cursor: "pointer" }}
                        >
                            {loading ? "..." : "Buscar"}
                        </button>
                    </div>

                    {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

                    <div style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: "rgba(0,0,0,0.2)", borderBottom: "1px solid var(--stroke2)" }}>
                                        <th style={{ padding: "14px 16px", textAlign: "left" }}>Fecha</th>
                                        <th style={{ padding: "14px 16px", textAlign: "left" }}>Subscription</th>
                                        <th style={{ padding: "14px 16px", textAlign: "left" }}>Orden</th>
                                        <th style={{ padding: "14px 16px", textAlign: "left" }}>Plataforma</th>
                                        <th style={{ padding: "14px 16px", textAlign: "left" }}>Cuenta anterior</th>
                                        <th style={{ padding: "14px 16px", textAlign: "left" }}>Cuenta nueva</th>
                                        <th style={{ padding: "14px 16px", textAlign: "left" }}>Expiraba</th>
                                        <th style={{ padding: "14px 16px", textAlign: "left" }}>Admin</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={8} style={{ padding: 40, textAlign: "center" }}><div className="spinner" style={{ margin: "0 auto" }} /></td></tr>
                                    ) : items.length === 0 ? (
                                        <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No hay reemplazos registrados.</td></tr>
                                    ) : (
                                        items.map((item, idx) => (
                                            <tr key={item.id} style={{ borderBottom: "1px solid var(--stroke2)", background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                                                <td style={{ padding: "14px 16px", color: "var(--muted)" }}>{fmtDateTime(item.created_at)}</td>
                                                <td style={{ padding: "14px 16px", fontWeight: 700 }}>#{item.subscription_id}</td>
                                                <td style={{ padding: "14px 16px" }}>{item.order_code || (item.order_id ? `#${item.order_id}` : "—")}</td>
                                                <td style={{ padding: "14px 16px" }}>{item.platform_name || "—"}</td>
                                                <td style={{ padding: "14px 16px" }}>{item.old_account_email || `#${item.old_account_id}`}</td>
                                                <td style={{ padding: "14px 16px" }}>{item.new_account_email || `#${item.new_account_id}`}</td>
                                                <td style={{ padding: "14px 16px" }}>{item.previousExpiresLabel ? formatBogotaDate(item.previousExpiresLabel) : "—"}</td>
                                                <td style={{ padding: "14px 16px" }}>{item.admin_email || item.admin_name || "—"}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {total > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderTop: "1px solid var(--stroke)", background: "var(--bg0)", gap: 12, flexWrap: "wrap" }}>
                                <div style={{ fontSize: 13, color: "var(--text)" }}>Página <b style={{ color: "var(--accent)" }}>{page}</b> de {totalPages}</div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button className="btn-ghost" disabled={loading || page <= 1} onClick={() => load(page - 1)}>← Anterior</button>
                                    <button className="btn-ghost" disabled={loading || page >= totalPages} onClick={() => load(page + 1)}>Siguiente →</button>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
