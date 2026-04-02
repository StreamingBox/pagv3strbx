import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiLogout } from "../api/api";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";
import { formatBogotaDate } from "../utils/datetime.js";

import { getApiBase } from "../config/apiBase.js";

const API_BASE = getApiBase();

function qs(obj) {
    const sp = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        const s = String(v).trim();
        if (!s) return;
        sp.set(k, s);
    });
    return sp.toString();
}

async function apiFetch(path, opts = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
        ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
        localStorage.removeItem("user");
        window.location.href = "/";
        return null;
    }
    if (!res.ok) throw new Error(data?.message || "Error en la solicitud");
    return data;
}

const LOGO_URL = "/api/branding/logo";

export default function AdminOrders() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();

    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // meta paginación
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [total, setTotal] = useState(0);
    const pages = useMemo(() => Math.max(Math.ceil(total / limit), 1), [total, limit]);

    // filtros
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("");
    const [platformId, setPlatformId] = useState("");
    const [currency, setCurrency] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    async function logout() {
        try { await apiLogout(); } catch (e) { console.error(e); }
        setUser(null);
        try {
            localStorage.removeItem("user");
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
        } catch { }
        navigate("/", { replace: true });
    }

    async function load(nextPage = page) {
        setLoading(true);
        setError("");

        try {
            const query = qs({
                page: nextPage,
                limit,
                q,
                status,
                platformId,
                currency,
                dateFrom,
                dateTo,
            });

            const data = await apiFetch(`/admin/orders?${query}`);
            if (!data) return;

            const items = Array.isArray(data?.items) ? data.items : [];
            setOrders(items);
            setPage(Number(data?.page || nextPage));
            setLimit(Number(data?.limit || limit));
            setTotal(Number(data?.total || 0));
        } catch (e) {
            setError(e.message || "Error cargando historial.");
            setOrders([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load(1);
        // eslint-disable-next-line
    }, []);

    function applyFilters(e) {
        e.preventDefault();
        setPage(1);
        load(1);
    }

    function prevPage() {
        const p = Math.max(page - 1, 1);
        setPage(p);
        load(p);
    }

    function nextPage() {
        const p = Math.min(page + 1, pages);
        setPage(p);
        load(p);
    }

    function renderStatusBadge(statusValue) {
        let bg, color, text, glow;

        switch (statusValue?.toLowerCase()) {
            case "active":
                bg = "rgba(16,185,129,0.15)";
                color = "#10b981";
                text = "Activo";
                glow = "0 0 12px rgba(16,185,129,0.3)";
                break;
            case "expired":
                bg = "rgba(239,68,68,0.15)";
                color = "#ef4444";
                text = "Expirado";
                glow = "0 0 12px rgba(239,68,68,0.4)";
                break;
            case "cancelled":
                bg = "rgba(239,68,68,0.15)";
                color = "#ef4444";
                text = "Cancelado";
                glow = "0 0 12px rgba(239,68,68,0.4)";
                break;
            case "pending":
                bg = "rgba(245,158,11,0.15)";
                color = "#f59e0b";
                text = "Pendiente";
                glow = "0 0 12px rgba(245,158,11,0.3)";
                break;
            default:
                return <span style={{ color: "var(--muted)" }}>{statusValue || "—"}</span>;
        }

        return (
            <span style={{
                background: bg,
                color: color,
                padding: "4px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 800,
                boxShadow: glow,
                border: `1px solid ${color}40`,
                display: "inline-flex",
                alignItems: "center",
                whiteSpace: "nowrap"
            }}>
                <span style={{
                    width: 6, height: 6, borderRadius: "50%", background: color, marginRight: 6, display: "inline-block", boxShadow: `0 0 4px ${color}`
                }} />
                {text}
            </span>
        );
    }

    const inputStyle = {
        appearance: "none", WebkitAppearance: "none",
        height: 38, padding: "0 14px",
        background: "var(--bg0)", color: "var(--text)",
        border: "1px solid var(--stroke)", borderRadius: 10,
        fontSize: 13, fontWeight: 500, outline: "none", width: "100%", fontFamily: "var(--font)"
    };
    const inputStyleWithIcon = { ...inputStyle, paddingLeft: 34 };

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
                    logoSrc={LOGO_URL}
                    logoOk={true}
                    setLogoOk={() => { }}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main" style={{ padding: "20px 24px 32px" }}>
                    {/* ── Page header ── */}
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, gap: 20, flexWrap: "wrap", borderBottom: "1px solid var(--stroke)", paddingBottom: 24 }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            {/* Icon badge */}
                            <div style={{
                                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                                background: "rgba(13,166,242,0.1)",
                                border: "1px solid rgba(13,166,242,0.3)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 24, boxShadow: "0 4px 16px rgba(13,166,242,0.2)",
                            }}>
                                📜
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" }}>
                                    Historial de Compras
                                </h1>
                                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
                                    Lista completa de órdenes y suscripciones de la plataforma.
                                </p>
                            </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--card)", padding: "8px 16px", borderRadius: 12, border: "1px solid var(--stroke)", boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0da6f2", boxShadow: "0 0 8px #0da6f2", animation: loading ? "pulse 1.5s infinite" : "none" }} />
                            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Registros</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: "var(--text)", marginLeft: 8 }}>{total}</div>
                        </div>
                    </motion.div>

                    {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

                    {/* ── Filters Card ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "16px 20px", marginBottom: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}
                    >
                        <form onSubmit={applyFilters} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                            <div style={{ position: "relative" }}>
                                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, opacity: 0.6 }}>🔍</span>
                                <input
                                    type="text"
                                    style={inputStyleWithIcon}
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="Buscar email, ID..."
                                />
                            </div>

                            <div style={{ position: "relative" }}>
                                <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
                                    <option value="">Todos los Estados</option>
                                    <option value="active">🟢 Activos</option>
                                    <option value="expired">🔴 Expirados</option>
                                    <option value="cancelled">⚫ Cancelados</option>
                                    <option value="pending">⏳ Pendientes</option>
                                </select>
                                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                            </div>

                            <div style={{ position: "relative", display: "flex", gap: 12 }}>
                                <div style={{ position: "relative", flex: 1 }}>
                                    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--muted)", pointerEvents: "none" }}>De:</span>
                                    <input type="date" style={{ ...inputStyle, paddingLeft: 34, fontSize: 12 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                                </div>
                                <div style={{ position: "relative", flex: 1 }}>
                                    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--muted)", pointerEvents: "none" }}>A:</span>
                                    <input type="date" style={{ ...inputStyle, paddingLeft: 28, fontSize: 12 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                                </div>
                            </div>

                            <div style={{ position: "relative", display: "flex", gap: 12 }}>
                                <div style={{ position: "relative", flex: 1 }}>
                                    <select style={{ ...inputStyle, cursor: "pointer" }} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                                        <option value="">Moneda</option>
                                        <option value="COP">COP</option>
                                        <option value="MXN">MXN</option>
                                        <option value="USD">USD</option>
                                    </select>
                                    <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                                </div>

                                <div style={{ display: "flex", gap: 8, flex: 1 }}>
                                    <button
                                        type="button"
                                        title="Limpiar filtros"
                                        style={{ width: 38, height: 38, borderRadius: 10, border: "1px solid var(--stroke)", background: "var(--bg0)", color: "var(--text)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                                        onClick={() => {
                                            setQ(""); setStatus(""); setPlatformId(""); setCurrency(""); setDateFrom(""); setDateTo("");
                                            setPage(1); setLimit(10);
                                            setLoading(true);
                                            apiFetch(`/admin/orders?page=1&limit=10`).then(data => {
                                                if (data) {
                                                    setOrders(Array.isArray(data.items) ? data.items : []);
                                                    setPage(Number(data.page || 1));
                                                    setLimit(Number(data.limit || 10));
                                                    setTotal(Number(data.total || 0));
                                                }
                                                setLoading(false);
                                            }).catch(e => {
                                                setError(e.message || "Error cargando historial.");
                                                setOrders([]);
                                                setTotal(0);
                                                setLoading(false);
                                            });
                                        }}
                                        disabled={loading}
                                    >
                                        🧹
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        style={{ flex: 1, height: 38, borderRadius: 10, border: "none", background: "linear-gradient(135deg, #0da6f2 0%, #8b5cf6 100%)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 12px rgba(13,166,242,0.3)" }}
                                    >
                                        {loading ? "..." : "Aplicar"}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </motion.div>

                    {/* ── Table Card ── */}
                    <div style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                                <thead>
                                    <tr style={{ background: "rgba(0,0,0,0.2)", borderBottom: "1px solid var(--stroke2)" }}>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>ID</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Usuario</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Correo Vendido</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Plataforma</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Plan</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Precio</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Estado</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Creada</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Expira</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={9} style={{ padding: "60px 20px", textAlign: "center" }}><div className="spinner" style={{ margin: "0 auto" }}></div></td></tr>
                                    ) : orders.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} style={{ padding: "60px 20px", textAlign: "center", color: "var(--muted)" }}>
                                                <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
                                                No hay registros de compras con estos filtros.
                                            </td>
                                        </tr>
                                    ) : (
                                        orders.map((o, idx) => (
                                            <motion.tr
                                                key={o.orderId}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ delay: idx * 0.02 }}
                                                style={{
                                                    borderBottom: "1px solid var(--stroke2)",
                                                    background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                                                    transition: "background 0.15s ease",
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = "rgba(13,166,242,0.05)"}
                                                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)"}
                                            >
                                                <td style={{ padding: "14px 16px", fontFamily: "monospace", fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                                                    #{o.orderId}
                                                </td>
                                                <td style={{ padding: "14px 16px", color: "var(--text)", fontWeight: 500, fontSize: 13, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.userEmail}>
                                                    {o.userEmail}
                                                </td>
                                                <td style={{ padding: "14px 16px", color: "var(--text)", fontWeight: 500, fontSize: 13, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.accountEmail || "Sin asignar"}>
                                                    {o.accountEmail || <span style={{ color: "var(--muted)" }}>Sin asignar</span>}
                                                </td>
                                                <td style={{ padding: "14px 16px" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                        <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--text)", fontWeight: 800 }}>
                                                            {o.platformName?.charAt(0) || "-"}
                                                        </div>
                                                        <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{o.platformName}</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: "14px 16px", color: "var(--muted)" }}>
                                                    {o.durationName} <span style={{ fontSize: 11, opacity: 0.8 }}>({o.days}d)</span>
                                                </td>
                                                <td style={{ padding: "14px 16px", fontWeight: 700, color: "var(--text)" }}>
                                                    {Number(o.price).toLocaleString()} <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>{o.currency}</span>
                                                </td>
                                                <td style={{ padding: "14px 16px" }}>
                                                    {renderStatusBadge(o.status)}
                                                </td>
                                                <td style={{ padding: "14px 16px", fontSize: 12, color: "var(--muted)" }}>
                                                    {formatBogotaDate(o.created_at)}
                                                </td>
                                                <td style={{ padding: "14px 16px", fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                                                    {formatBogotaDate(o.expires_at)}
                                                </td>
                                            </motion.tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Paginación */}
                        {total > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderTop: "1px solid var(--stroke)", background: "var(--bg0)", flexWrap: "wrap", gap: 12 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                                    <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Mostrar:</span>
                                    <div style={{ position: "relative" }}>
                                        <select
                                            style={{ ...inputStyle, height: 32, padding: "0 24px 0 10px", fontSize: 12, width: "auto" }}
                                            value={limit}
                                            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); load(1); }}
                                        >
                                            <option value="10">10 / pág</option>
                                            <option value="25">25 / pág</option>
                                            <option value="50">50 / pág</option>
                                            <option value="100">100 / pág</option>
                                            <option value="200">200 / pág</option>
                                        </select>
                                        <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                                    </div>
                                    <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>
                                        Página <b style={{ color: "var(--accent)" }}>{page}</b> de {pages || 1}
                                    </span>
                                </div>

                                <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                        className="btn-ghost"
                                        disabled={loading || page <= 1}
                                        onClick={prevPage}
                                        style={{ width: "auto", padding: "6px 14px", fontSize: 13, borderRadius: 8, opacity: (loading || page <= 1) ? 0.4 : 1 }}
                                    >
                                        ← Anterior
                                    </button>
                                    <button
                                        className="btn-ghost"
                                        disabled={loading || page >= pages}
                                        onClick={nextPage}
                                        style={{ width: "auto", padding: "6px 14px", fontSize: 13, borderRadius: 8, opacity: (loading || page >= pages) ? 0.4 : 1 }}
                                    >
                                        Siguiente →
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
