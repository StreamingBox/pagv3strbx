import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiFetch as baseApiFetch } from "../api/api.js";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";
import useAppLogout from "../hooks/useAppLogout.js";
import { loadXlsx } from "../utils/loadXlsx.js";

async function apiFetch(path, opts = {}) {
    const res = await baseApiFetch(path, opts);
    if (!res.ok) throw new Error(res.data?.message || "Error en la solicitud");
    return res.data;
}

const LOGO_URL = "/api/branding/logo"; // or matching your global sidebar logo logic
const MotionDiv = motion.div;

function CustomPlatformSelect({ value, onChange, platforms, selStyle }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const dropdownRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filtered = platforms.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    const currentName = value === "all" ? "Todas las plataformas" : (platforms.find(p => p.slug === value)?.name || "Seleccionar...");

    return (
        <div ref={dropdownRef} style={{ position: "relative", width: "100%", height: "100%" }}>
            <div
                style={{ ...selStyle, display: "flex", alignItems: "center", justifyContent: "space-between", height: "100%", userSelect: "none" }}
                onClick={() => { setOpen(!open); setSearch(""); }}
            >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {currentName}
                </span>
                <span style={{ fontSize: 10, color: "var(--muted)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
            </div>

            {open && (
                <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                    background: "var(--bg1)", border: "1px solid var(--stroke)", borderRadius: 12,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 100, overflow: "hidden",
                    display: "flex", flexDirection: "column"
                }}>
                    <input
                        type="text"
                        autoFocus
                        placeholder="Buscar plataforma..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            background: "rgba(0,0,0,0.2)", border: "none", borderBottom: "1px solid var(--stroke)",
                            padding: "12px 14px", color: "var(--text)", fontSize: 13, outline: "none", width: "100%", fontFamily: "var(--font)"
                        }}
                    />
                    <div style={{ maxHeight: 220, overflowY: "auto", padding: "4px 0" }}>
                        <div
                            style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, background: value === "all" ? "rgba(13,166,242,0.1)" : "transparent", color: value === "all" ? "var(--accent)" : "var(--text)", transition: "background 0.1s" }}
                            onClick={() => { onChange("all"); setOpen(false); }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                            onMouseLeave={e => e.currentTarget.style.background = value === "all" ? "rgba(13,166,242,0.1)" : "transparent"}
                        >
                            Todas las plataformas
                        </div>
                        {filtered.map(p => (
                            <div
                                key={p.id}
                                style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, background: value === p.slug ? "rgba(13,166,242,0.1)" : "transparent", color: value === p.slug ? "var(--accent)" : "var(--text)", transition: "background 0.1s" }}
                                onClick={() => { onChange(p.slug); setOpen(false); }}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                                onMouseLeave={e => e.currentTarget.style.background = value === p.slug ? "rgba(13,166,242,0.1)" : "transparent"}
                            >
                                {p.name}
                            </div>
                        ))}
                        {filtered.length === 0 && (
                            <div style={{ padding: "16px 14px", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>No hay coincidencias</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Componente de grupo por cuenta ─────────────────────────────────────────
function AccountGroup({ group, getDaysLeft, renderDaysBadge, toggleAttended, navigate, allCollapsed, attendedFilter, savingIds }) {
    const [collapsed, setCollapsed] = useState(allCollapsed);

    useEffect(() => {
        setCollapsed(allCollapsed);
    }, [allCollapsed]);

    const [pwVisible, setPwVisible] = useState(false);
    const [copiedPw, setCopiedPw] = useState(false);

    const allAttended = group.rows.every(r => r.is_attended);
    const hasPassword = !!group.account_password;

    async function copyPassword(e) {
        e.stopPropagation();
        if (!group.account_password) return;
        try {
            await navigator.clipboard.writeText(group.account_password);
            setCopiedPw(true);
            window.setTimeout(() => setCopiedPw(false), 1400);
        } catch {
            setCopiedPw(false);
        }
    }

    return (
        <>
            {/* ── Fila de encabezado del grupo (cuenta) ── */}
            <tr
                style={{
                    background: "rgba(13,166,242,0.08)",
                    borderTop: "2px solid rgba(13,166,242,0.25)",
                    borderBottom: "1px solid rgba(13,166,242,0.15)",
                    cursor: "pointer",
                }}
                onClick={() => setCollapsed(c => !c)}
            >
                <td colSpan={7} style={{ padding: "10px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        {/* Toggle icon */}
                        <span style={{ fontSize: 13, color: "var(--accent)", transition: "transform 0.2s", display: "inline-block", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</span>

                        {/* Icono cuenta */}
                        <div style={{
                            width: 28, height: 28, borderRadius: 8,
                            background: "rgba(13,166,242,0.2)",
                            border: "1px solid rgba(13,166,242,0.4)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 13, flexShrink: 0
                        }}>🔑</div>

                        {/* Email o Identificador de la cuenta */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 800, fontSize: 13, color: "var(--text)", fontFamily: "monospace" }}>
                                {group.is_chatgpt 
                                    ? (group.account_password || "ChatGPT Sin Clave")
                                    : (group.account_email || <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Sin cuenta asignada</span>)
                                }
                            </span>
                            {group.rows[0]?.platform_name && (
                                <span style={{ 
                                    background: "rgba(255,255,255,0.08)", 
                                    color: "var(--accent)", 
                                    padding: "2px 8px", 
                                    borderRadius: 6, 
                                    fontSize: 11, 
                                    fontWeight: 700,
                                    border: "1px solid rgba(13,166,242,0.2)"
                                }}>
                                    {group.rows[0].platform_name}
                                </span>
                            )}
                        </div>

                        {/* Contraseña (solo si no es ChatGPT, donde ya está como título) */}
                        {hasPassword && !group.is_chatgpt && (
                            <button
                                type="button"
                                onClick={copyPassword}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    background: copiedPw ? "rgba(16,185,129,0.12)" : "rgba(0,0,0,0.2)",
                                    borderRadius: 8,
                                    padding: "4px 10px",
                                    border: copiedPw ? "1px solid rgba(16,185,129,0.35)" : "1px solid var(--stroke)",
                                    cursor: "copy",
                                    color: "inherit"
                                }}
                                title="Clic para copiar la clave"
                            >
                                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>Clave:</span>
                                <span style={{ fontSize: 13, fontFamily: "monospace", color: pwVisible ? "#0da6f2" : "var(--muted)", fontWeight: 600, letterSpacing: pwVisible ? 1 : 0 }}>
                                    {pwVisible ? group.account_password : "••••••••"}
                                </span>
                                {copiedPw && (
                                    <span style={{ fontSize: 11, color: "#10b981", fontWeight: 800 }}>
                                        Copiada
                                    </span>
                                )}
                                <button
                                    onClick={e => { e.stopPropagation(); setPwVisible(v => !v); }}
                                    style={{
                                        background: "transparent", border: "none", cursor: "pointer",
                                        color: "var(--muted)", fontSize: 14, padding: "0 2px",
                                        lineHeight: 1, display: "flex", alignItems: "center"
                                    }}
                                    title={pwVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
                                >
                                    {pwVisible ? "🙈" : "👁️"}
                                </button>
                            </button>
                        )}

                        {/* Badge perfiles */}
                        <span style={{
                            background: "rgba(139,92,246,0.15)",
                            color: "#a78bfa",
                            border: "1px solid rgba(139,92,246,0.3)",
                            borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700
                        }}>
                            {group.rows.length} {group.rows.length === 1 ? "perfil" : "perfiles"}
                        </span>

                        {/* Badge estado general */}
                        {allAttended && (
                            <span style={{
                                background: "rgba(16,185,129,0.12)",
                                color: "#10b981",
                                border: "1px solid rgba(16,185,129,0.3)",
                                borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700
                            }}>✔ Todos atendidos</span>
                        )}
                    </div>
                </td>
            </tr>

            {/* ── Filas de perfiles de esta cuenta ── */}
            {!collapsed && group.rows.map((item, idx) => {
                const daysLeft = getDaysLeft(item.expires_at);
                const isSaving = savingIds.includes(item.id);
                const isOutsideFilter =
                    attendedFilter === "0" ? !!item.is_attended :
                    attendedFilter === "1" ? !item.is_attended :
                    false;

                return (
                    <tr
                        key={item.id}
                        style={{
                            borderBottom: "1px solid var(--stroke2)",
                            background: isOutsideFilter
                                ? "rgba(16,185,129,0.06)"
                                : (idx % 2 === 0 ? "rgba(0,0,0,0.0)" : "rgba(255,255,255,0.012)"),
                            transition: "background 0.15s ease, opacity 0.15s ease",
                            opacity: isSaving ? 0.65 : 1,
                        }}
                        onMouseEnter={e => {
                            if (!isOutsideFilter) e.currentTarget.style.background = "rgba(13,166,242,0.04)";
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = isOutsideFilter
                                ? "rgba(16,185,129,0.06)"
                                : (idx % 2 === 0 ? "rgba(0,0,0,0)" : "rgba(255,255,255,0.012)");
                        }}
                    >
                        <td style={{ padding: "12px 16px 12px 40px", fontFamily: "monospace", fontSize: 12, color: "var(--muted)", fontWeight: 600 }} title={item.order_code || undefined}>
                            #{item.id} {item.is_attended ? "✔️" : ""}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--text)", fontWeight: 800 }}>
                                    {item.platform_name.charAt(0)}
                                </div>
                                <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{item.platform_name}</span>
                            </div>
                        </td>
                        <td style={{ padding: "12px 16px", color: "var(--text)", fontWeight: 500, fontSize: 12, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.user_email}>
                            {item.user_email}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                            {item.profile_number
                                ? <span style={{ background: "rgba(139,92,246,0.12)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>Perfil {item.profile_number}</span>
                                : <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>
                            }
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
                            {item.expires_at ? new Date(item.expires_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: 'numeric', month: 'short', year: 'numeric' }) : "—"}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                {renderDaysBadge(daysLeft)}
                                {isOutsideFilter && (
                                    <span style={{
                                        background: "rgba(16,185,129,0.12)",
                                        color: "#10b981",
                                        border: "1px solid rgba(16,185,129,0.28)",
                                        borderRadius: 20,
                                        padding: "2px 10px",
                                        fontSize: 11,
                                        fontWeight: 700
                                    }}>
                                        Actualizada
                                    </span>
                                )}
                            </div>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                            <button
                                className="btn-ghost"
                                style={{
                                    padding: "5px 10px", fontSize: 11, fontWeight: 700, borderRadius: 8,
                                    color: item.is_attended ? "#f59e0b" : "#10b981",
                                    background: item.is_attended ? "rgba(245,158,11,0.1)" : "rgba(16,185,129,0.1)",
                                    border: `1px solid ${item.is_attended ? "rgba(245,158,11,0.3)" : "rgba(16,185,129,0.3)"}`,
                                    marginRight: 6, cursor: isSaving ? "wait" : "pointer",
                                    opacity: isSaving ? 0.7 : 1
                                }}
                                disabled={isSaving}
                                onClick={() => toggleAttended(item.id, item.is_attended)}
                            >
                                {isSaving ? "Guardando..." : (item.is_attended ? "Desmarcar ⟲" : "Atendido ✓")}
                            </button>
                            <button
                                className="btn"
                                style={{
                                    padding: "6px 12px", fontSize: 11, fontWeight: 700, borderRadius: 8,
                                    background: "linear-gradient(135deg, #0da6f2 0%, #8b5cf6 100%)",
                                    border: "none", color: "#fff",
                                    boxShadow: "0 4px 14px rgba(13,166,242,0.3)", cursor: isSaving ? "not-allowed" : "pointer",
                                    opacity: isSaving ? 0.7 : 1
                                }}
                                disabled={isSaving}
                                onClick={() => navigate(`/admin/renewals`, { state: { orderId: item.id } })}
                            >
                                Renovar →
                            </button>
                        </td>
                    </tr>
                );
            })}
        </>
    );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminExpirations() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const logout = useAppLogout();

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Filters
    const [q, setQ] = useState("");
    const [email, setEmail] = useState("");
    const [accountEmail, setAccountEmail] = useState("");
    const [platform, setPlatform] = useState("all");
    const [attendedFilter, setAttendedFilter] = useState("0"); // "0" = pendientes, "1" = atendidos, "all" = todos
    const [expiryFilter, setExpiryFilter] = useState("all"); // 'all', 'vencidos', 'hoy'

    // Pagination
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [limit, setLimit] = useState(20);

    const [platforms, setPlatforms] = useState([]);
    const [allCollapsed, setAllCollapsed] = useState(false);
    const [savingIds, setSavingIds] = useState([]);

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
                if (email.trim()) params.set("email", email.trim());
                if (accountEmail.trim()) params.set("accountEmail", accountEmail.trim());
                if (platform !== "all") params.set("platform", platform);
                if (attendedFilter !== "all") params.set("attended", attendedFilter);
                if (expiryFilter !== "all") params.set("expiryFilter", expiryFilter);

                const data = await apiFetch(`/admin/orders-expiring?${params.toString()}`);
                if (!mounted) return;

                if (data && data.items) {
                    setItems(data.items);
                    setTotalPages(data.pages);
                    setTotalItems(data.total);
                    setSavingIds([]);
                }
            } catch (err) {
                if (mounted) setError(err.message);
            } finally {
                if (mounted) setLoading(false);
            }
        }

        const t = setTimeout(loadData, 300);
        return () => { mounted = false; clearTimeout(t); };
    }, [page, q, email, accountEmail, platform, attendedFilter, expiryFilter, limit]);

    async function exportToExcel() {
        try {
            // Get all records for export (ignoring pagination)
            const params = new URLSearchParams();
            params.set("limit", 1000); 
            if (q.trim()) params.set("q", q.trim());
            if (email.trim()) params.set("email", email.trim());
            if (accountEmail.trim()) params.set("accountEmail", accountEmail.trim());
            if (platform !== "all") params.set("platform", platform);
            if (attendedFilter !== "all") params.set("attended", attendedFilter);
            if (expiryFilter !== "all") params.set("expiryFilter", expiryFilter);

            const data = await apiFetch(`/admin/orders-expiring?${params.toString()}`);
            if (!data || !data.items || data.items.length === 0) {
                alert("No hay datos para exportar");
                return;
            }

            const excelData = data.items.map(o => ({
                ID: o.id,
                PLATAFORMA: o.platform_name,
                USUARIO: o.user_email,
                CUENTA_EMAIL: o.account_email,
                CUENTA_PASS: o.account_password,
                PERFIL: o.profile_number || "—",
                EXPIRACION: o.expires_at ? new Date(o.expires_at).toLocaleDateString() : "—",
                ATENDIDO: o.is_attended ? "SÍ" : "NO"
            }));

            const XLSX = await loadXlsx();
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(excelData);
            XLSX.utils.book_append_sheet(wb, ws, "Vencimientos");
            XLSX.writeFile(wb, `Vencimientos_${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (e) {
            console.error(e);
            alert("Error al exportar a Excel");
        }
    }

    async function toggleAttended(id, currentStatus) {
        setSavingIds(prev => prev.includes(id) ? prev : [...prev, id]);
        try {
            const is_attended = currentStatus ? 0 : 1;
            await apiFetch(`/admin/orders/${id}/attend`, {
                method: "POST",
                body: JSON.stringify({ is_attended })
            });

            // Mantener la fila en su lugar evita saltos de la tabla y clics en la cuenta equivocada.
            setItems(prev => prev.map(item => item.id === id ? { ...item, is_attended } : item));
        } catch (e) {
            alert(e.message || "Error cambiando estado");
        } finally {
            setSavingIds(prev => prev.filter(itemId => itemId !== id));
        }
    }
    function getDaysLeft(expiryStr) {
        if (!expiryStr) return null;
        // Normalizar ambas fechas a medianoche para comparar días exactos
        const expiry = new Date(expiryStr);
        expiry.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diffTime = expiry.getTime() - today.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }

    function renderDaysBadge(days) {
        if (days === null) return <span style={{ color: "var(--muted)" }}>—</span>;

        let bg, color, text, glow;
        if (days < 0) {
            bg = "rgba(239,68,68,0.15)";
            color = "#ef4444";
            text = `Vencida (${Math.abs(days)}d)`;
            glow = "0 0 12px rgba(239,68,68,0.4)";
        } else if (days === 0) {
            bg = "rgba(245,158,11,0.15)";
            color = "#f59e0b";
            text = "Vence hoy";
            glow = "0 0 12px rgba(245,158,11,0.4)";
        } else if (days <= 3) {
            bg = "rgba(245,158,11,0.15)";
            color = "#f59e0b";
            text = `${days} días`;
            glow = "0 0 12px rgba(245,158,11,0.3)";
        } else {
            bg = "rgba(16,185,129,0.15)";
            color = "#10b981";
            text = `${days} días`;
            glow = "0 0 12px rgba(16,185,129,0.3)";
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

    const selStyle = {
        appearance: "none", WebkitAppearance: "none",
        height: 38, padding: "0 28px 0 14px",
        background: "var(--bg0)", color: "var(--text)",
        border: "1px solid var(--stroke)", borderRadius: 10,
        fontSize: 13, fontWeight: 500, cursor: "pointer",
        fontFamily: "var(--font)", outline: "none", width: "100%"
    };

    return (
        <div className="page-shell admin-expirations-shell">
            <div className="page-shell-bg" aria-hidden>
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />
            </div>

            <div className="page-inner admin-expirations-inner">
                <AdminSidebar
                    user={user}
                    logoSrc={LOGO_URL}
                    logoOk={true}
                    setLogoOk={() => { }}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main admin-expirations-main" style={{ padding: "20px 24px 32px" }}>
                    {/* ── Page header ── */}
                    <MotionDiv
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
                                ⏱️
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" }}>
                                    Vencimientos
                                </h1>
                                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
                                    Gestión y monitoreo de cuentas próximas a vencer.
                                </p>
                            </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--card)", padding: "8px 16px", borderRadius: 12, border: "1px solid var(--stroke)", boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0da6f2", boxShadow: "0 0 8px #0da6f2" }} />
                            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Registros</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: "var(--text)", marginLeft: 8 }}>{totalItems}</div>
                        </div>
                    </MotionDiv>

                    {/* ── Filters Card ── */}
                    <MotionDiv
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "16px 20px", marginBottom: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}
                    >
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                            <div style={{ position: "relative" }}>
                                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, opacity: 0.6 }}>🔍</span>
                                <input
                                    type="text"
                                    style={{ ...selStyle, paddingLeft: 34 }}
                                    value={q}
                                    onChange={(e) => { setQ(e.target.value); setPage(1); }}
                                    placeholder="ID pedido o suscripción"
                                />
                            </div>

                            <div style={{ position: "relative" }}>
                                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, opacity: 0.6 }}>✉️</span>
                                <input
                                    type="text"
                                    style={{ ...selStyle, paddingLeft: 34 }}
                                    value={email}
                                    onChange={(e) => { setEmail(e.target.value); setPage(1); }}
                                    placeholder="Correo usuario"
                                />
                            </div>

                            <div style={{ position: "relative" }}>
                                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, opacity: 0.6 }}>🔑</span>
                                <input
                                    type="text"
                                    style={{ ...selStyle, paddingLeft: 34 }}
                                    value={accountEmail}
                                    onChange={(e) => { setAccountEmail(e.target.value); setPage(1); }}
                                    placeholder="Correo cuenta"
                                />
                            </div>

                            <div style={{ position: "relative" }}>
                                <CustomPlatformSelect
                                    value={platform}
                                    onChange={(val) => { setPlatform(val); setPage(1); }}
                                    platforms={platforms}
                                    selStyle={selStyle}
                                />
                            </div>

                            <div style={{ position: "relative" }}>
                                <select style={selStyle} value={attendedFilter} onChange={(e) => { setAttendedFilter(e.target.value); setPage(1); }}>
                                    <option value="0">⏳ Solo Pendientes</option>
                                    <option value="1">✔️ Solo Atendidos</option>
                                    <option value="all">📋 Mostrar Todos</option>
                                </select>
                                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                            </div>

                            <div style={{ position: "relative" }}>
                                <select style={selStyle} value={expiryFilter} onChange={(e) => { setExpiryFilter(e.target.value); setPage(1); }}>
                                    <option value="all">📅 Todos los tiempos</option>
                                    <option value="vencidos">🔴 Ya Vencidos</option>
                                    <option value="hoy">🟠 Vencen Hoy</option>
                                </select>
                                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                            </div>
                        </div>
                    </MotionDiv>

                    {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

                    {attendedFilter !== "all" && (
                        <div style={{
                            marginBottom: 16,
                            padding: "12px 14px",
                            borderRadius: 12,
                            border: "1px solid rgba(245,158,11,0.22)",
                            background: "rgba(245,158,11,0.08)",
                            color: "#fcd34d",
                            fontSize: 12,
                            fontWeight: 600
                        }}>
                            Las filas actualizadas se mantienen visibles en su posición hasta recargar o cambiar filtros, para evitar saltos y errores al marcar varias cuentas seguidas.
                        </div>
                    )}

                    {/* ── Table Card ── */}
                    <div style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}>
                        <div style={{ padding: "12px 20px", background: "rgba(0,0,0,0.2)", borderBottom: "1px solid var(--stroke)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
                            <button
                                onClick={exportToExcel}
                                style={{
                                    background: "rgba(16,185,129,0.1)",
                                    border: "1px solid rgba(16,185,129,0.3)",
                                    borderRadius: 8,
                                    padding: "6px 14px",
                                    color: "#10b981",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    transition: "all 0.2s"
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(16,185,129,0.15)"}
                                onMouseLeave={e => e.currentTarget.style.background = "rgba(16,185,129,0.1)"}
                            >
                                📊 Exportar Excel
                            </button>
                            <button
                                onClick={() => setAllCollapsed(!allCollapsed)}
                                style={{
                                    background: "rgba(13,166,242,0.1)",
                                    border: "1px solid rgba(13,166,242,0.3)",
                                    borderRadius: 8,
                                    padding: "6px 14px",
                                    color: "var(--accent)",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    transition: "all 0.2s"
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(13,166,242,0.15)"}
                                onMouseLeave={e => e.currentTarget.style.background = "rgba(13,166,242,0.1)"}
                            >
                                {allCollapsed ? "↔️ Expandir Todo" : "↕️ Colapsar Todo"}
                            </button>
                        </div>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                                <thead>
                                    <tr style={{ background: "rgba(0,0,0,0.2)", borderBottom: "1px solid var(--stroke2)" }}>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>ID</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Plataforma</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Usuario</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Perfil</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Vencimiento</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Estado</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={7} style={{ padding: "60px 20px", textAlign: "center" }}><div className="spinner" style={{ margin: "0 auto" }}></div></td></tr>
                                    ) : items.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ padding: "60px 20px", textAlign: "center", color: "var(--muted)" }}>
                                                <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
                                                No hay cuentas próximas a vencer con estos filtros.
                                            </td>
                                        </tr>
                                    ) : (() => {
                                        // Agrupar por cuenta
                                        // REGLA: ChatGPT se agrupa por CONTRASEÑA, los demás por EMAIL
                                        const groups = [];
                                        const groupMap = {};
                                        items.forEach(item => {
                                            const isChatGPT = item.platform_name?.toLowerCase().includes("chatgpt") || 
                                                             item.platform_slug?.toLowerCase().includes("chatgpt");
                                            
                                            const key = isChatGPT 
                                                ? `chatgpt_${item.account_password || "__sin_clave__"}`
                                                : (item.account_email || "__sin_cuenta__");
                                                
                                            if (!groupMap[key]) {
                                                groupMap[key] = { 
                                                    key, 
                                                    account_email: item.account_email, 
                                                    account_password: item.account_password, 
                                                    is_chatgpt: isChatGPT,
                                                    rows: [] 
                                                };
                                                groups.push(groupMap[key]);
                                            }
                                            groupMap[key].rows.push(item);
                                        });

                                        return groups.map(group => (
                                            <AccountGroup
                                                key={group.key}
                                                group={group}
                                                getDaysLeft={getDaysLeft}
                                                renderDaysBadge={renderDaysBadge}
                                                toggleAttended={toggleAttended}
                                                navigate={navigate}
                                                allCollapsed={allCollapsed}
                                                attendedFilter={attendedFilter}
                                                savingIds={savingIds}
                                            />
                                        ));
                                    })()}
                                </tbody>
                            </table>
                        </div>

                        {/* Paginación */}
                        {totalItems > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderTop: "1px solid var(--stroke)", background: "var(--bg0)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                                    <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Mostrar:</span>
                                    <div style={{ position: "relative" }}>
                                        <select
                                            style={{ ...selStyle, height: 32, padding: "0 24px 0 10px", fontSize: 12 }}
                                            value={limit}
                                            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                                        >
                                            <option value="10">10 / pág</option>
                                            <option value="20">20 / pág</option>
                                            <option value="50">50 / pág</option>
                                            <option value="100">100 / pág</option>
                                        </select>
                                        <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                                    </div>
                                    <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>
                                        Página <b style={{ color: "var(--accent)" }}>{page}</b> de {totalPages || 1}
                                    </span>
                                </div>

                                <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                        className="btn-ghost"
                                        disabled={page === 1}
                                        onClick={() => setPage(page - 1)}
                                        style={{ width: "auto", padding: "6px 14px", fontSize: 13, borderRadius: 8, opacity: page === 1 ? 0.4 : 1 }}
                                    >
                                        ← Anterior
                                    </button>
                                    <button
                                        className="btn-ghost"
                                        disabled={page === totalPages || totalPages === 0}
                                        onClick={() => setPage(page + 1)}
                                        style={{ width: "auto", padding: "6px 14px", fontSize: 13, borderRadius: 8, opacity: (page === totalPages || totalPages === 0) ? 0.4 : 1 }}
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
