import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiFetch as baseApiFetch, apiLogout } from "../api/api";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";

const LOGO_URL = "/api/branding/logo";

// Mirrors backend toCodeSlug logic: verifica si una plataforma tiene soporte de código
// basado en si su slug o nombre contiene las palabras clave conocidas.
function isSupportedPlatform(slug = "", name = "") {
    const normalized = (String(slug) + " " + String(name))
        .toLowerCase()
        .replace(/-/g, " "); // chatgpt-business-completa → chatgpt business completa
    return (
        normalized.includes("chatgpt") ||
        normalized.includes("chat gpt") ||
        normalized.includes("spotify") ||
        normalized.includes("netflix") ||
        normalized.includes("prime")
    );
}

async function apiFetch(path, opts = {}) {
    return baseApiFetch(path, opts);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("es-CO", {
        timeZone: "America/Bogota", day: "2-digit", month: "short",
        year: "numeric", hour: "2-digit", minute: "2-digit"
    });
}

function StatusBadge({ status }) {
    const s = String(status || "").toLowerCase();
    const map = {
        active: { color: "#10b981", label: "Activo" },
        expired: { color: "#f59e0b", label: "Expirado" },
        cancelled: { color: "#ef4444", label: "Cancelado" },
        pending: { color: "#8b5cf6", label: "Pendiente" },
    };
    const cfg = map[s] || { color: "#6b7280", label: status || "—" };
    return (
        <span style={{
            background: `${cfg.color}18`, color: cfg.color, padding: "3px 10px",
            borderRadius: 20, fontSize: 11, fontWeight: 800,
            border: `1px solid ${cfg.color}40`, display: "inline-flex", alignItems: "center", gap: 5,
        }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, boxShadow: `0 0 4px ${cfg.color}` }} />
            {cfg.label}
        </span>
    );
}

// ── Panel de detalle / obtener código ────────────────────────────────────────
function OrderDetailPanel({ order, onClose }) {
    const [loading, setLoading]   = useState(false);
    const [result, setResult]     = useState(null);
    const [action, setAction]     = useState("code"); // "code", "temporary" o "approve"
    const [copied, setCopied]     = useState(false);

    const slug = order.platformSlug || String(order.platformName || "").toLowerCase().replace(/\s+/g, "-");
    const supported = isSupportedPlatform(order.platformSlug, order.platformName);
    const isNetflix  = String(order.platformSlug || order.platformName || "").toLowerCase().includes("netflix");

    async function fetchCode() {
        setLoading(true);
        setResult(null);
        try {
            const r = await apiFetch(`/codes/${slug}/request`, {
                method: "POST",
                body: JSON.stringify({ orderNumber: order.orderId, action }),
            });
            setResult({ ok: r?.ok, data: r?.data });
        } catch (err) {
            setResult({ ok: false, data: { message: err.message } });
        } finally {
            setLoading(false);
        }
    }

    async function copy(text) {
        await navigator.clipboard.writeText(String(text));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                initial={{ scale: .94, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: .94, y: 20 }}
                style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 20, width: "100%", maxWidth: 540, boxShadow: "0 30px 80px rgba(0,0,0,.6)", overflow: "hidden" }}
            >
                {/* Header */}
                <div style={{ padding: "22px 26px", borderBottom: "1px solid var(--stroke)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(13,166,242,.1)", border: "1px solid rgba(13,166,242,.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🎟️</div>
                        <div>
                            <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text)" }}>Pedido #{order.orderId}</div>
                            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{order.platformName} · {order.userEmail}</div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 20, lineHeight: 1 }}>✕</button>
                </div>

                {/* Cuenta asignada — destacada */}
                {order.accountEmail && (
                    <div style={{ margin: "0 26px 0", padding: "12px 16px", background: "rgba(13,166,242,.08)", border: "1px solid rgba(13,166,242,.3)", borderRadius: 12, display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 22 }}>📧</span>
                        <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#0da6f2", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 2 }}>Cuenta Asignada</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", wordBreak: "break-all" }}>{order.accountEmail}</div>
                            {order.accountProfile && (
                                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                                    Perfil: <b style={{ color: "var(--text)" }}>{order.accountProfile}</b>
                                    {order.accountPin ? ` · PIN: ${order.accountPin}` : ""}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Info */}
                <div style={{ padding: "16px 26px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[
                        ["Usuario", order.userName || "—"],
                        ["Email Usuario", order.userEmail],
                        ["Plataforma", order.platformName],
                        ["Duración", order.durationName],
                        ["Estado", null],
                        ["Vence", fmt(order.expires_at)],
                        ["Creado", fmt(order.created_at)],
                        ["Precio", `${order.currency} ${Number(order.price || 0).toLocaleString("es-CO")}`],
                    ].map(([k, v], i) => (
                        <div key={i} style={{ background: "var(--bg0)", borderRadius: 10, padding: "10px 14px", border: "1px solid var(--stroke)" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>{k}</div>
                            {k === "Estado" ? <StatusBadge status={order.status} /> : <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", wordBreak: "break-all" }}>{v}</div>}
                        </div>
                    ))}
                </div>

                {/* Acción: obtener código */}
                <div style={{ padding: "0 26px 26px" }}>
                    {supported ? (
                        <div style={{ background: "rgba(13,166,242,.06)", border: "1px solid rgba(13,166,242,.2)", borderRadius: 14, padding: "16px 18px" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>🔑 Obtener Código</div>

                            {/* Selector de acción: SOLO Netflix muestra variantes */}
                            {isNetflix ? (
                                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                                    {["code", "temporary", "approve"].map(a => (
                                        <button key={a} onClick={() => setAction(a)} style={{
                                            flex: 1, height: 36, borderRadius: 10, border: `1px solid ${action === a ? "#0da6f2" : "var(--stroke)"}`,
                                            background: action === a ? "rgba(13,166,242,.12)" : "transparent",
                                            color: action === a ? "#0da6f2" : "var(--muted)", fontSize: 13, fontWeight: 600, cursor: "pointer"
                                        }}>
                                            {a === "code" ? "Código inicio" : a === "temporary" ? "Acceso temporal" : "Aprobar login"}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ marginBottom: 14, fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontSize: 15 }}>📋</span>
                                    <span>Se obtendrá el código más reciente del correo de la cuenta.</span>
                                </div>
                            )}

                            <motion.button
                                onClick={fetchCode}
                                disabled={loading}
                                whileHover={{ y: -1 }}
                                whileTap={{ scale: .97 }}
                                style={{ width: "100%", height: 44, borderRadius: 12, border: "none", background: loading ? "var(--stroke)" : "linear-gradient(135deg,#0da6f2,#6333ff)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: loading ? "not-allowed" : "pointer", transition: "all .2s" }}
                            >
                                {loading ? "Consultando..." : "Ejecutar"}
                            </motion.button>

                            <AnimatePresence>
                                {result && (
                                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ marginTop: 14 }}>
                                        {result.ok && (result.data?.code || result.data?.type === "approval") ? (
                                            <div style={{ background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.25)", borderRadius: 12, padding: "14px 16px" }}>
                                                <div style={{ fontSize: 11, color: "#10b981", fontWeight: 700, marginBottom: 8 }}>
                                                    {result.data?.type === "approval" ? "✅ SOLICITUD APROBADA" : "✅ CÓDIGO OBTENIDO"}
                                                </div>
                                                {result.data?.type === "approval" ? (
                                                    <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>
                                                        {result.data.deviceName || "Dispositivo aprobado"}
                                                    </div>
                                                ) : (
                                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                        <code style={{ flex: 1, fontSize: 20, fontWeight: 900, color: "#0da6f2", letterSpacing: 2, fontFamily: "monospace" }}>{result.data.code}</code>
                                                        <button onClick={() => copy(result.data.code)} style={{ background: "rgba(13,166,242,.12)", border: "1px solid rgba(13,166,242,.25)", borderRadius: 8, padding: "6px 14px", color: "#0da6f2", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                                            {copied ? "✓ Copiado" : "Copiar"}
                                                        </button>
                                                    </div>
                                                )}
                                                {result.data.message && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>{result.data.message}</div>}
                                            </div>
                                        ) : (
                                            <div style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#fca5a5" }}>
                                                ❌ {result.data?.message || "No se pudo obtener el código."}
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ) : (
                        <div style={{ background: "rgba(245,158,11,.06)", border: "1px solid rgba(245,158,11,.25)", borderRadius: 14, padding: "18px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                            <span style={{ fontSize: 28 }}>🔒</span>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b", marginBottom: 4 }}>Plataforma sin soporte de código</div>
                                <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                                    <b style={{ color: "var(--text)" }}>{order.platformName}</b> no tiene habilitada la consulta de código automática.<br />
                                    Solo se muestran los detalles del pedido.
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminCodeRequests() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();

    const [orders, setOrders]           = useState([]);
    const [loading, setLoading]         = useState(true);
    const [total, setTotal]             = useState(0);
    const [page, setPage]               = useState(1);
    const [limit, setLimit]             = useState(20);
    const [selected, setSelected]       = useState(null);

    // Filtros
    const [q, setQ]                     = useState("");
    const [status, setStatus]           = useState("active"); // activas por defecto
    const [platform, setPlatform]       = useState("");
    const [dateFrom, setDateFrom]       = useState("");
    const [dateTo, setDateTo]           = useState("");
    const searchRef                     = useRef(null);
    const debounceRef                   = useRef(null);

    const pages = useMemo(() => Math.max(Math.ceil(total / limit), 1), [total, limit]);

    async function logout() {
        try { await apiLogout(); } catch { }
        setUser(null);
        try { ["user","accessToken","refreshToken"].forEach(k => localStorage.removeItem(k)); } catch { }
        navigate("/", { replace: true });
    }

    // Carga directa sin useCallback (evita condiciones de carrera)
    async function doLoad(overrides = {}) {
        const params = {
            q, status, platform, dateFrom, dateTo, page, limit,
            ...overrides,
        };
        setLoading(true);
        const sp = new URLSearchParams();
        if (params.q.trim()) sp.set("q", params.q.trim());
        if (params.status) sp.set("status", params.status);
        if (params.platform) sp.set("platformName", params.platform);
        if (params.dateFrom) sp.set("dateFrom", params.dateFrom);
        if (params.dateTo) sp.set("dateTo", params.dateTo);
        sp.set("page", params.page);
        sp.set("limit", params.limit);
        try {
            const r = await apiFetch(`/admin/orders?${sp.toString()}`);
            if (!r) return;
            setOrders(r.data?.items || []);
            setTotal(r.data?.total || 0);
        } catch {
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }

    // Carga inicial
    useEffect(() => { doLoad(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Recarga cuando cambia paginación o límite (no q para evitar doble disparo)
    useEffect(() => { doLoad(); }, [page, limit]); // eslint-disable-line react-hooks/exhaustive-deps

    // Cambia de filtros (sin q) → reset a página 1 y recarga inmediata
    function applyFilter(key, value) {
        const next = { q, status, platform, dateFrom, dateTo, page: 1, limit };
        next[key] = value;
        if (key === "status")   setStatus(value);
        if (key === "platform") setPlatform(value);
        if (key === "dateFrom") setDateFrom(value);
        if (key === "dateTo")   setDateTo(value);
        setPage(1);
        doLoad(next);
    }

    // Búsqueda con debounce de 400 ms
    function handleQChange(val) {
        setQ(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setPage(1);
            doLoad({ q: val, status, platform, dateFrom, dateTo, page: 1, limit });
        }, 400);
    }

    const clearFilters = () => {
        setQ(""); setStatus("active"); setPlatform(""); setDateFrom(""); setDateTo(""); setPage(1);
        doLoad({ q: "", status: "active", platform: "", dateFrom: "", dateTo: "", page: 1, limit });
    };
    const hasFilters = q || status !== "active" || platform || dateFrom || dateTo;

    const selSt = {
        height: 40, padding: "0 12px", background: "var(--bg0)", color: "var(--text)",
        border: "1px solid var(--stroke)", borderRadius: 10, fontSize: 13,
        outline: "none", cursor: "pointer", transition: "border-color .2s",
    };

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden>
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />
            </div>

            <div className="page-inner">
                <AdminSidebar user={user} logoSrc={LOGO_URL} logoOk={true} setLogoOk={() => {}} uploadingLogo={false} onOpenLogoPicker={() => navigate("/admin")} onLogout={logout} />

                <main className="main" style={{ padding: "20px 24px 32px" }}>
                    {/* Header */}
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 20, flexWrap: "wrap", borderBottom: "1px solid var(--stroke)", paddingBottom: 20 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(13,166,242,.12)", border: "1px solid rgba(13,166,242,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🎟️</div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" }}>Pedidos de Códigos</h1>
                                <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--muted)" }}>Todos los pedidos con acceso a consulta de código en tiempo real.</p>
                            </div>
                        </div>

                        {/* KPIs */}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            {[
                                { label: "Total Pedidos", val: total, accent: "#0da6f2" },
                                { label: "Página", val: `${page}/${pages}`, accent: "#6333ff" },
                            ].map(({ label, val, accent }) => (
                                <div key={label} style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 12, padding: "10px 18px", display: "flex", alignItems: "center", gap: 10, boxShadow: `0 4px 20px ${accent}15` }}>
                                    <div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px" }}>{label}</div>
                                        <div style={{ fontSize: 20, fontWeight: 900, color: accent, lineHeight: 1.1, marginTop: 1 }}>{val}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Filtros */}
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "16px 20px", marginBottom: 20 }}>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                            {/* Búsqueda */}
                            <div style={{ position: "relative", flex: "1 1 260px" }}>
                                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: .45, pointerEvents: "none" }}>🔎</span>
                                <input
                                    ref={searchRef}
                                    style={{ ...selSt, paddingLeft: 38, paddingRight: 36, width: "100%", height: 40 }}
                                    placeholder="Buscar por #ID, email comprador, correo de cuenta..."
                                    value={q}
                                    onChange={e => handleQChange(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && doLoad({ q, status, platform, dateFrom, dateTo, page: 1, limit })}
                                    onFocus={e => (e.target.style.borderColor = "#0da6f2")}
                                    onBlur={e => (e.target.style.borderColor = "var(--stroke)")}
                                />
                                {q && <button onClick={() => handleQChange("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 14 }}>✕</button>}
                            </div>

                            {/* Estado */}
                            <select style={{ ...selSt, flex: "0 0 150px" }} value={status} onChange={e => applyFilter("status", e.target.value)}>
                                <option value="">📋 Todos</option>
                                <option value="active">✅ Activo</option>
                                <option value="expired">⏱️ Expirado</option>
                                <option value="cancelled">❌ Cancelado</option>
                                <option value="pending">⏳ Pendiente</option>
                            </select>

                            {/* Fecha */}
                            <input type="date" style={{ ...selSt, flex: "0 0 150px" }} value={dateFrom} onChange={e => applyFilter("dateFrom", e.target.value)} title="Desde" />
                            <input type="date" style={{ ...selSt, flex: "0 0 150px" }} value={dateTo} onChange={e => applyFilter("dateTo", e.target.value)} title="Hasta" />

                            {/* Limpiar */}
                            {hasFilters && (
                                <button onClick={clearFilters} className="btn-ghost" style={{ height: 40, padding: "0 16px", fontSize: 13, borderRadius: 10, whiteSpace: "nowrap" }}>
                                    ✕ Limpiar
                                </button>
                            )}

                            <button onClick={() => doLoad()} className="btn-ghost" style={{ height: 40, padding: "0 20px", fontSize: 13, borderRadius: 10, whiteSpace: "nowrap", marginLeft: "auto" }}>
                                🔄 Actualizar
                            </button>
                        </div>
                    </motion.div>

                    {/* Tabla */}
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                        style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, overflow: "hidden" }}>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: "rgba(0,0,0,.2)", borderBottom: "1px solid var(--stroke)" }}>
                                        {["#", "Usuario", "Plataforma", "Duración", "Estado", "Vence", "Precio", "Fecha Compra", "Acción"].map(col => (
                                            <th key={col} style={{ padding: "13px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.7px", whiteSpace: "nowrap", textAlign: "left" }}>{col}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={9} style={{ padding: "70px 20px", textAlign: "center" }}>
                                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                                                    <div style={{ width: 36, height: 36, border: "3px solid var(--stroke)", borderTopColor: "#0da6f2", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
                                                    <span style={{ color: "var(--muted)", fontSize: 13 }}>Cargando pedidos...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : orders.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} style={{ padding: "70px 20px", textAlign: "center", color: "var(--muted)" }}>
                                                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                                                <div style={{ fontSize: 15, fontWeight: 600 }}>Sin pedidos</div>
                                                <div style={{ fontSize: 12, marginTop: 6 }}>Intenta con otros filtros.</div>
                                            </td>
                                        </tr>
                                    ) : orders.map((o, idx) => (
                                        <motion.tr
                                            key={o.orderId}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                                            style={{ borderBottom: "1px solid var(--stroke2)", cursor: "pointer" }}
                                            onMouseEnter={e => e.currentTarget.style.background = "rgba(13,166,242,.05)"}
                                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                        >
                                            <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>#{o.orderId}</td>
                                            <td style={{ padding: "12px 16px" }}>
                                                <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 13 }}>{o.userName || "—"}</div>
                                                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{o.userEmail}</div>
                                            </td>
                                            <td style={{ padding: "12px 16px" }}>
                                                <span style={{ background: "rgba(13,166,242,.08)", border: "1px solid rgba(13,166,242,.2)", padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 700, color: "#0da6f2", textTransform: "uppercase" }}>
                                                    {o.platformName}
                                                </span>
                                            </td>
                                            <td style={{ padding: "12px 16px", color: "var(--text)", fontSize: 12 }}>{o.durationName}</td>
                                            <td style={{ padding: "12px 16px" }}><StatusBadge status={o.status} /></td>
                                            <td style={{ padding: "12px 16px", fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{fmt(o.expires_at)}</td>
                                            <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--text)", fontWeight: 600 }}>
                                                {o.currency} {Number(o.price || 0).toLocaleString("es-CO")}
                                            </td>
                                            <td style={{ padding: "12px 16px", fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{fmt(o.created_at)}</td>
                                            <td style={{ padding: "12px 16px" }}>
                                                {isSupportedPlatform(o.platformSlug, o.platformName) ? (
                                                    <motion.button
                                                        whileHover={{ scale: 1.05 }}
                                                        whileTap={{ scale: .95 }}
                                                        onClick={() => setSelected(o)}
                                                        style={{ background: "linear-gradient(135deg,#0da6f2,#6333ff)", border: "none", borderRadius: 8, color: "#fff", padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                                                    >
                                                        🔑 Ver / Código
                                                    </motion.button>
                                                ) : (
                                                    <motion.button
                                                        whileHover={{ scale: 1.02 }}
                                                        onClick={() => setSelected(o)}
                                                        style={{ background: "transparent", border: "1px solid var(--stroke)", borderRadius: 8, color: "var(--muted)", padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                                                    >
                                                        📄 Ver Detalle
                                                    </motion.button>
                                                )}
                                            </td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Paginación */}
                        {!loading && total > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderTop: "1px solid var(--stroke)", background: "rgba(0,0,0,.12)" }}>
                                <button className="btn-ghost" disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ padding: "6px 16px", fontSize: 13, borderRadius: 8, opacity: page === 1 ? .35 : 1 }}>
                                    ← Anterior
                                </button>

                                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                                    <span style={{ fontSize: 13, color: "var(--text)" }}>
                                        Página <b style={{ color: "var(--accent)" }}>{page}</b> de <b>{pages}</b> · {total} total
                                    </span>
                                    <select value={limit} onChange={e => setLimit(Number(e.target.value))} style={{ ...selSt, height: 32, padding: "0 10px", fontSize: 12 }}>
                                        {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}/pág</option>)}
                                    </select>
                                </div>

                                <button className="btn-ghost" disabled={page === pages} onClick={() => setPage(p => p + 1)} style={{ padding: "6px 16px", fontSize: 13, borderRadius: 8, opacity: page === pages ? .35 : 1 }}>
                                    Siguiente →
                                </button>
                            </div>
                        )}
                    </motion.div>
                </main>
            </div>

            {/* Panel de detalle */}
            <AnimatePresence>
                {selected && <OrderDetailPanel order={selected} onClose={() => setSelected(null)} />}
            </AnimatePresence>
        </div>
    );
}
