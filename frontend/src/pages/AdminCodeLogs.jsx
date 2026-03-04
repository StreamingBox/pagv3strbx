import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiGet, apiLogout } from "../api/api";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";

const LOGO_URL = "/api/branding/logo";

// ─── IP Geo cache (global so it persists across re-renders) ─────────────────
const geoCache = {};

async function lookupIp(ip) {
    if (!ip || ip === "::1" || ip === "127.0.0.1" || ip.startsWith("::ffff:127")) {
        return { country: "Local", flag: "🖥️" };
    }
    if (geoCache[ip]) return geoCache[ip];
    try {
        const r = await fetch(`https://ipwho.is/${ip}`);
        const d = await r.json();
        const result = {
            country: d.country || "Desconocido",
            flag: d.flag?.emoji || "🌐",
            city: d.city || "",
        };
        geoCache[ip] = result;
        return result;
    } catch {
        return { country: "Desconocido", flag: "🌐", city: "" };
    }
}

// ─── Status badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
    const s = String(status || "").toLowerCase();
    let color = "#6b7280", glow = "none";

    if (s.includes("delivered") || s.includes("success")) {
        color = "#10b981"; glow = "0 0 10px rgba(16,185,129,0.35)";
    } else if (s.includes("blocked") || s.includes("limit")) {
        color = "#ef4444"; glow = "0 0 10px rgba(239,68,68,0.35)";
    } else if (s.includes("expired")) {
        color = "#f59e0b"; glow = "0 0 10px rgba(245,158,11,0.35)";
    } else if (s.includes("no_account") || s.includes("not_found")) {
        color = "#8b5cf6"; glow = "0 0 10px rgba(139,92,246,0.35)";
    }

    return (
        <span style={{
            background: `${color}15`, color, padding: "4px 10px", borderRadius: 20,
            fontSize: 11, fontWeight: 800, boxShadow: glow, border: `1px solid ${color}40`,
            display: "inline-flex", alignItems: "center", whiteSpace: "nowrap"
        }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, marginRight: 6, display: "inline-block", boxShadow: `0 0 4px ${color}` }} />
            {status}
        </span>
    );
}

// ─── Geo cell (loads async) ───────────────────────────────────────────────────
function GeoCell({ ip }) {
    const [geo, setGeo] = useState(null);

    useEffect(() => {
        if (!ip) return;
        lookupIp(ip).then(setGeo);
    }, [ip]);

    return (
        <td style={{ padding: "12px 16px", minWidth: 170 }}>
            <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>{ip}</div>
            {geo ? (
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                    <span style={{ fontSize: 16 }}>{geo.flag}</span>
                    <span>{geo.country}{geo.city ? `, ${geo.city}` : ""}</span>
                </div>
            ) : (
                <div style={{ height: 14, width: 100, borderRadius: 6, background: "rgba(255,255,255,0.06)", animation: "pulse 1.5s infinite" }} />
            )}
        </td>
    );
}

// ─── KPI Chip ─────────────────────────────────────────────────────────────────
function KpiChip({ label, value, accent = "#0da6f2", icon }) {
    return (
        <div style={{
            display: "flex", alignItems: "center", gap: 10, background: "var(--card)",
            padding: "10px 18px", borderRadius: 12, border: "1px solid var(--stroke)",
            boxShadow: `0 4px 20px ${accent}15`
        }}>
            {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
            <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px" }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text)", lineHeight: 1.1, marginTop: 1 }}>
                    <span style={{ color: accent }}>{value}</span>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminCodeLogs() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();

    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState("");
    const [platform, setPlatform] = useState("all");
    const [page, setPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const searchRef = useRef(null);

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

    useEffect(() => {
        let mounted = true;

        async function load() {
            setLoading(true);
            try {
                const r = await apiGet("/admin/code-logs");
                if (r.status === 401) {
                    try { localStorage.removeItem("user"); localStorage.removeItem("accessToken"); localStorage.removeItem("refreshToken"); } catch { }
                    navigate("/");
                    return;
                }
                if (!mounted) return;
                if (r.ok && r.data?.ok) setLogs(r.data.logs || []);
                else setLogs([]);
            } catch {
                if (!mounted) return;
                setLogs([]);
            } finally {
                if (mounted) setLoading(false);
            }
        }

        load();
        return () => { mounted = false; };
    }, [navigate]);

    const platforms = useMemo(() => {
        const set = new Set();
        logs.forEach((l) => { if (l.platform_slug) set.add(l.platform_slug); });
        return ["all", ...Array.from(set).sort()];
    }, [logs]);

    const filtered = useMemo(() => {
        const query = q.trim().toLowerCase();
        let result = logs.filter((l) => {
            if (platform !== "all" && l.platform_slug !== platform) return false;
            if (!query) return true;
            const hay = [l.id, l.order_id, l.platform_slug, l.order_email, l.requested_by, l.delivered_code, l.status, l.requester_ip]
                .filter(Boolean).join(" ").toLowerCase();
            return hay.includes(query);
        });
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return result;
    }, [logs, q, platform]);

    useEffect(() => { setPage(1); }, [q, platform, itemsPerPage]);

    const paginated = useMemo(() => {
        const start = (page - 1) * itemsPerPage;
        return filtered.slice(start, start + itemsPerPage);
    }, [filtered, page, itemsPerPage]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));

    const deliveredCount = useMemo(() =>
        logs.filter(l => String(l.status || "").toLowerCase().includes("delivered")).length
        , [logs]);

    const clearFilters = useCallback(() => {
        setQ("");
        setPlatform("all");
        searchRef.current?.focus();
    }, []);

    const selStyle = {
        appearance: "none", WebkitAppearance: "none",
        height: 42, padding: "0 30px 0 14px",
        background: "var(--bg0)", color: "var(--text)",
        border: "1px solid var(--stroke)", borderRadius: 10,
        fontSize: 13, fontWeight: 500, cursor: "pointer",
        fontFamily: "var(--font)", outline: "none", width: "100%", transition: "border-color 0.2s"
    };

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

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
                    {/* ── Header ── */}
                    <motion.div
                        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 20, flexWrap: "wrap", borderBottom: "1px solid var(--stroke)", paddingBottom: 20 }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 4px 16px rgba(139,92,246,0.2)" }}>
                                🎫
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" }}>Logs de Códigos</h1>
                                <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--muted)" }}>Solicitudes, estado, IP, país y código entregado.</p>
                            </div>
                        </div>

                        {/* KPIs */}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <KpiChip label="Total Logs" value={logs.length} icon="📋" accent="#0da6f2" />
                            <KpiChip label="Mostrando" value={filtered.length} icon="🔍" accent="#6333ff" />
                            <KpiChip label="Entregados" value={deliveredCount} icon="✅" accent="#10b981" />
                        </div>
                    </motion.div>

                    {/* ── Search & Filter Bar ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "18px 20px", marginBottom: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}
                    >
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                            {/* Search */}
                            <div style={{ position: "relative", flex: "1 1 300px" }}>
                                <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 16, opacity: 0.5, pointerEvents: "none" }}>🔎</span>
                                <input
                                    ref={searchRef}
                                    type="text"
                                    style={{
                                        ...selStyle, paddingLeft: 40, paddingRight: 14,
                                        background: "var(--bg0)", fontSize: 14,
                                    }}
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="Buscar por pedido, correo, IP, usuario, código..."
                                    onFocus={e => e.target.style.borderColor = "#0da6f2"}
                                    onBlur={e => e.target.style.borderColor = "var(--stroke)"}
                                />
                                {q && (
                                    <button
                                        onClick={() => setQ("")}
                                        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16, lineHeight: 1 }}
                                    >✕</button>
                                )}
                            </div>

                            {/* Platform filter */}
                            <div style={{ position: "relative", flex: "0 0 200px" }}>
                                <select style={selStyle} value={platform} onChange={(e) => setPlatform(e.target.value)}>
                                    {platforms.map((p) => (
                                        <option key={p} value={p}>{p === "all" ? "🌐 Todas" : String(p).toUpperCase()}</option>
                                    ))}
                                </select>
                                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                            </div>

                            {/* Clear */}
                            {(q || platform !== "all") && (
                                <button
                                    onClick={clearFilters}
                                    className="btn-ghost"
                                    style={{ height: 42, padding: "0 16px", fontSize: 13, borderRadius: 10, whiteSpace: "nowrap", flexShrink: 0 }}
                                >
                                    ✕ Limpiar
                                </button>
                            )}
                        </div>

                        {/* Result count hint */}
                        {(q || platform !== "all") && (
                            <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
                                Mostrando <b style={{ color: "var(--accent)" }}>{filtered.length}</b> de <b style={{ color: "var(--text)" }}>{logs.length}</b> registros
                            </div>
                        )}
                    </motion.div>

                    {/* ── Table ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                        style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}
                    >
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                                <thead>
                                    <tr style={{ background: "rgba(0,0,0,0.25)", borderBottom: "1px solid var(--stroke2)" }}>
                                        {["ID", "Pedido", "Plataforma", "Correo", "Usuario", "IP + País", "Código", "Estado", "Fecha"].map(col => (
                                            <th key={col} style={{ padding: "13px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.7px", whiteSpace: "nowrap" }}>{col}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={9} style={{ padding: "70px 20px", textAlign: "center" }}>
                                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                                                    <div style={{ width: 36, height: 36, border: "3px solid var(--stroke)", borderTopColor: "#0da6f2", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                                                    <span style={{ color: "var(--muted)", fontSize: 13 }}>Cargando logs...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : paginated.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} style={{ padding: "70px 20px", textAlign: "center", color: "var(--muted)" }}>
                                                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                                                <div style={{ fontSize: 15, fontWeight: 600 }}>Sin resultados</div>
                                                <div style={{ fontSize: 12, marginTop: 6 }}>Intenta con otros términos de búsqueda.</div>
                                            </td>
                                        </tr>
                                    ) : (
                                        paginated.map((l, idx) => (
                                            <motion.tr
                                                key={l.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ delay: Math.min(idx * 0.025, 0.4) }}
                                                style={{
                                                    borderBottom: "1px solid var(--stroke2)",
                                                    background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)",
                                                    cursor: "default",
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = "rgba(13,166,242,0.055)"}
                                                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)"}
                                            >
                                                <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 11, color: "var(--muted)", fontWeight: 600, whiteSpace: "nowrap" }}>#{l.id}</td>
                                                <td style={{ padding: "12px 16px", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>O-{l.order_id}</td>
                                                <td style={{ padding: "12px 16px" }}>
                                                    <span style={{ background: "rgba(13,166,242,0.08)", border: "1px solid rgba(13,166,242,0.2)", padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 700, color: "#0da6f2", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                                                        {l.platform_slug}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "12px 16px", color: "var(--text)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.order_email}>
                                                    {l.order_email}
                                                </td>
                                                <td style={{ padding: "12px 16px", color: "var(--muted)", fontSize: 12, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.requested_by || ""}>
                                                    {l.requested_by || "—"}
                                                </td>
                                                <GeoCell ip={l.requester_ip} />
                                                <td style={{ padding: "12px 16px", fontFamily: "monospace", fontWeight: 800, color: l.delivered_code ? "#0da6f2" : "var(--muted)", fontSize: 14, letterSpacing: "0.5px" }}>
                                                    {l.delivered_code || "—"}
                                                </td>
                                                <td style={{ padding: "12px 16px" }}>
                                                    <StatusBadge status={l.status} />
                                                </td>
                                                <td style={{ padding: "12px 16px", fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
                                                    {new Date(l.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                                </td>
                                            </motion.tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* ── Pagination ── */}
                        {!loading && filtered.length > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderTop: "1px solid var(--stroke)", background: "rgba(0,0,0,0.15)" }}>
                                <button
                                    className="btn-ghost"
                                    disabled={page === 1}
                                    onClick={() => setPage(page - 1)}
                                    style={{ width: "auto", padding: "6px 16px", fontSize: 13, borderRadius: 8, opacity: page === 1 ? 0.35 : 1 }}
                                >
                                    ← Anterior
                                </button>

                                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                                    <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>
                                        Página <b style={{ color: "var(--accent)" }}>{page}</b> de <b>{totalPages}</b>
                                    </span>
                                    <div style={{ position: "relative" }}>
                                        <select
                                            style={{ ...selStyle, height: 32, padding: "0 26px 0 10px", fontSize: 12 }}
                                            value={itemsPerPage}
                                            onChange={(e) => setItemsPerPage(Number(e.target.value))}
                                        >
                                            {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} / pág</option>)}
                                        </select>
                                        <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 8, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                                    </div>
                                </div>

                                <button
                                    className="btn-ghost"
                                    disabled={page === totalPages}
                                    onClick={() => setPage(page + 1)}
                                    style={{ width: "auto", padding: "6px 16px", fontSize: 13, borderRadius: 8, opacity: page === totalPages ? 0.35 : 1 }}
                                >
                                    Siguiente →
                                </button>
                            </div>
                        )}
                    </motion.div>
                </main>
            </div>
        </div>
    );
}
