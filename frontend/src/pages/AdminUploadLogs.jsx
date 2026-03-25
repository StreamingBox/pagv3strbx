import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiLogout } from "../api/api";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";

import { getApiBase } from "../config/apiBase.js";

const API_BASE = getApiBase();

function buildUrl(path) {
    const base = String(API_BASE).replace(/\/+$/, "");
    return `${base}${path}`;
}

async function apiFetch(path, opts = {}) {
    const res = await fetch(buildUrl(path), {
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
        ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Error en la solicitud");
    return data;
}

const TYPE_BADGE = {
    manual: { label: "Manual", bg: "rgba(13,166,242,.15)", color: "#0da6f2", border: "rgba(13,166,242,.3)" },
    bulk:   { label: "📦 Masiva",  bg: "rgba(139,92,246,.15)", color: "#8b5cf6", border: "rgba(139,92,246,.3)" },
};

function fmt(n) { return Number(n || 0).toLocaleString("es-CO"); }

function fmtDate(str) {
    if (!str) return "—";
    return new Date(str).toLocaleString("es-CO", {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

export default function AdminUploadLogs() {
    const navigate   = useNavigate();
    const { user, setUser } = useAuth();

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

    // Filtros
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("");
    const [page, setPage]   = useState(1);
    const [limit] = useState(20);

    // Data
    const [logs, setLogs]   = useState([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError]    = useState("");

    // Limpiar logs
    const [showClean, setShowClean] = useState(false);
    const [cleanDays, setCleanDays] = useState(30);
    const [cleaning, setCleaning]   = useState(false);

    const fetchLogs = useCallback(async (p = 1) => {
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams({
                page: p,
                limit,
                ...(typeFilter ? { type: typeFilter } : {}),
                ...(search.trim() ? { search: search.trim() } : {}),
            });
            const data = await apiFetch(`/admin/accounts/upload-logs?${params}`);
            setLogs(data.items || []);
            setTotal(data.total || 0);
            setTotalPages(data.totalPages || 1);
            setPage(p);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [search, typeFilter, limit]);

    useEffect(() => { fetchLogs(1); }, [typeFilter]);

    async function handleClean() {
        setCleaning(true);
        try {
            const data = await apiFetch(`/admin/accounts/upload-logs?days=${cleanDays}`, { method: "DELETE" });
            alert(`✅ Se eliminaron ${data.deleted} registros anteriores a ${cleanDays} días.`);
            setShowClean(false);
            fetchLogs(1);
        } catch (e) {
            alert("❌ " + e.message);
        } finally {
            setCleaning(false);
        }
    }

    const inputStyle = {
        appearance: "none", height: 36, padding: "0 12px",
        background: "var(--input-bg)", color: "var(--text)",
        border: "1px solid var(--stroke)", borderRadius: 10,
        fontSize: 13, fontWeight: 500, outline: "none",
        fontFamily: "var(--font)", transition: "border-color 0.2s",
    };

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

                    {/* Header */}
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                            display: "flex", justifyContent: "space-between",
                            alignItems: "flex-end", marginBottom: 24, gap: 16,
                            flexWrap: "wrap", borderBottom: "1px solid var(--stroke)",
                            paddingBottom: 24,
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                                background: "rgba(139,92,246,.12)",
                                border: "1px solid rgba(139,92,246,.3)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 24, boxShadow: "0 4px 16px rgba(139,92,246,.2)",
                            }}>📋</div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" }}>
                                    Logs de Carga de Cuentas
                                </h1>
                                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
                                    Historial de todas las cargas manuales y masivas de inventario.
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowClean(true)}
                            style={{
                                height: 38, padding: "0 18px", borderRadius: 10,
                                background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)",
                                color: "#ef4444", fontWeight: 700, fontSize: 13,
                                cursor: "pointer", fontFamily: "var(--font)",
                                transition: "background 0.2s",
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,.2)"}
                            onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,.1)"}
                        >
                            🗑 Limpiar logs antiguos
                        </button>
                    </motion.div>

                    {/* Stats rápidos */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 24 }}
                    >
                        {[
                            { icon: "📦", label: "Total registros", value: fmt(total), color: "#8b5cf6" },
                            { icon: "✅", label: "Cuentas insertadas", value: fmt(logs.reduce((a, l) => a + (l.inserted || 0), 0)), color: "#10b981" },
                            { icon: "⏭", label: "Omitidas", value: fmt(logs.reduce((a, l) => a + (l.skipped || 0), 0)), color: "#f59e0b" },
                            { icon: "❌", label: "Con error", value: fmt(logs.reduce((a, l) => a + (l.errors || 0), 0)), color: "#ef4444" },
                        ].map(s => (
                            <div key={s.label} style={{
                                background: "var(--card)", border: "1px solid var(--stroke)",
                                borderRadius: 14, padding: "14px 18px",
                                boxShadow: "0 4px 20px rgba(0,0,0,.12)"
                            }}>
                                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                                    {s.icon} {s.label}
                                </div>
                                <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                            </div>
                        ))}
                    </motion.div>

                    {/* Filtros */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        style={{
                            background: "var(--card)", border: "1px solid var(--stroke)",
                            borderRadius: 14, padding: "14px 16px", marginBottom: 20,
                            display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center",
                        }}
                    >
                        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
                            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.45 }}>🔍</span>
                            <input
                                style={{ ...inputStyle, width: "100%", paddingLeft: 30 }}
                                placeholder="Buscar por admin o plataforma..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && fetchLogs(1)}
                            />
                        </div>

                        <div style={{ position: "relative" }}>
                            <select
                                style={{ ...inputStyle, paddingRight: 28, cursor: "pointer" }}
                                value={typeFilter}
                                onChange={e => setTypeFilter(e.target.value)}
                            >
                                <option value="">Todos los tipos</option>
                                <option value="manual">Manual (1x1)</option>
                                <option value="bulk">Masiva (Excel)</option>
                            </select>
                            <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                        </div>

                        <button
                            onClick={() => fetchLogs(1)}
                            disabled={loading}
                            style={{
                                height: 36, padding: "0 16px", borderRadius: 10, border: "none",
                                background: "linear-gradient(135deg,#0da6f2,#8b5cf6)",
                                color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
                                boxShadow: "0 3px 12px rgba(13,166,242,.3)",
                                fontFamily: "var(--font)",
                            }}
                        >
                            {loading ? "⟳" : "🔍"} Buscar
                        </button>
                    </motion.div>

                    {/* Error */}
                    <AnimatePresence>
                        {error && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", color: "#ef4444", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13 }}>
                                ⚠️ {error}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Tabla */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                        style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,.15)" }}
                    >
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: "rgba(0,0,0,.25)", textAlign: "left" }}>
                                        {["ID", "Tipo", "Admin", "Plataforma", "Total", "Insertadas", "Omitidas", "Errores", "Archivo", "Notas", "Fecha"].map(h => (
                                            <th key={h} style={{ padding: "12px 14px", fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.7px", whiteSpace: "nowrap" }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={11} style={{ padding: 60, textAlign: "center" }}>
                                            <div style={{ width: 28, height: 28, border: "3px solid var(--stroke)", borderTopColor: "#0da6f2", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto" }} />
                                        </td></tr>
                                    ) : logs.length === 0 ? (
                                        <tr><td colSpan={11} style={{ padding: "60px 20px", textAlign: "center", color: "var(--muted)" }}>
                                            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                                            No hay logs de carga aún. Las cargas futuras aparecerán aquí.
                                        </td></tr>
                                    ) : logs.map((log, idx) => {
                                        const badge = TYPE_BADGE[log.type] || TYPE_BADGE.manual;
                                        const base  = idx % 2 === 0 ? "transparent" : "rgba(255,255,255,.012)";
                                        const hasErr = log.errors > 0;
                                        return (
                                            <tr key={log.id}
                                                style={{ borderBottom: "1px solid var(--stroke2)", background: base }}
                                                onMouseEnter={e => e.currentTarget.style.background = "rgba(13,166,242,.04)"}
                                                onMouseLeave={e => e.currentTarget.style.background = base}
                                            >
                                                <td style={{ padding: "12px 14px", fontFamily: "monospace", fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>#{log.id}</td>
                                                <td style={{ padding: "12px 14px" }}>
                                                    <span style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800 }}>
                                                        {badge.label}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "12px 14px", fontSize: 12, color: "var(--muted)" }}>{log.admin_email || "—"}</td>
                                                <td style={{ padding: "12px 14px", fontWeight: 600 }}>{log.platform_name || "—"}</td>
                                                <td style={{ padding: "12px 14px", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{fmt(log.total_rows)}</td>
                                                <td style={{ padding: "12px 14px", color: "#10b981", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>+{fmt(log.inserted)}</td>
                                                <td style={{ padding: "12px 14px", color: "#f59e0b", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(log.skipped)}</td>
                                                <td style={{ padding: "12px 14px" }}>
                                                    <span style={{ color: hasErr ? "#ef4444" : "var(--muted)", fontWeight: hasErr ? 700 : 500 }}>
                                                        {hasErr ? "⚠ " : ""}{fmt(log.errors)}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "12px 14px", fontSize: 11, color: "var(--muted)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                    {log.source_filename || "—"}
                                                </td>
                                                <td style={{ padding: "12px 14px", fontSize: 11, color: "var(--muted)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                    {log.notes || "—"}
                                                </td>
                                                <td style={{ padding: "12px 14px", fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                                                    {fmtDate(log.created_at)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Paginación */}
                        {!loading && total > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderTop: "1px solid var(--stroke)", background: "rgba(0,0,0,.15)" }}>
                                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                                    Mostrando {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} de {fmt(total)} registros
                                </span>
                                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                    <button className="btn-ghost" disabled={page <= 1 || loading} onClick={() => fetchLogs(page - 1)}
                                        style={{ height: 34, padding: "0 14px", fontSize: 12, borderRadius: 8, opacity: page <= 1 ? 0.35 : 1 }}>
                                        ← Anterior
                                    </button>
                                    <span style={{ fontSize: 13, color: "var(--text)" }}>
                                        Página <b style={{ color: "#0da6f2" }}>{page}</b> / {totalPages || 1}
                                    </span>
                                    <button className="btn-ghost" disabled={page >= totalPages || loading} onClick={() => fetchLogs(page + 1)}
                                        style={{ height: 34, padding: "0 14px", fontSize: 12, borderRadius: 8, opacity: page >= totalPages ? 0.35 : 1 }}>
                                        Siguiente →
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </main>
            </div>

            {/* Modal: Limpiar logs */}
            <AnimatePresence>
                {showClean && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999, padding: 20 }}
                        onClick={e => e.target === e.currentTarget && setShowClean(false)}
                    >
                        <motion.div
                            initial={{ scale: .95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: .95 }}
                            style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 24px 80px rgba(0,0,0,.7)" }}
                        >
                            <div style={{ fontSize: 22, marginBottom: 6 }}>🗑 Limpiar logs antiguos</div>
                            <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>
                                Elimina todos los registros de log con más de N días de antigüedad.
                            </p>
                            <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 8, fontWeight: 500 }}>
                                Días de antigüedad a limpiar
                            </label>
                            <input
                                type="number" min={1} max={365}
                                value={cleanDays}
                                onChange={e => setCleanDays(Number(e.target.value))}
                                style={{
                                    ...inputStyle, width: "100%", marginBottom: 20, height: 44, fontSize: 16
                                }}
                            />
                            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                                <button onClick={() => setShowClean(false)}
                                    style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1px solid var(--stroke)", background: "transparent", color: "var(--text)", cursor: "pointer", fontFamily: "var(--font)", fontWeight: 600, fontSize: 13 }}>
                                    Cancelar
                                </button>
                                <button onClick={handleClean} disabled={cleaning}
                                    style={{ height: 40, padding: "0 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "var(--font)", opacity: cleaning ? 0.7 : 1 }}>
                                    {cleaning ? "Limpiando..." : "Confirmar limpieza"}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
