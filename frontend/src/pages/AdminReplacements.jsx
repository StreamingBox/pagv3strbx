import { Fragment, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Archive, ArrowLeftRight, CalendarDays, ChevronDown, ChevronUp, Download, Eye, EyeOff, RotateCcw, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { apiFetch, apiLogout } from "../api/api.js";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";
import { currentBogotaDateOnly, formatBogotaDate } from "../utils/datetime.js";
import { loadXlsx } from "../utils/loadXlsx.js";

const EMPTY_FILTERS = { q: "", fromDate: "", toDate: "", platformId: "" };
const REVIEW_VIEWS = [
    { id: "pending", label: "Pendientes", count: "pending" },
    { id: "reviewed", label: "Archivados", count: "reviewed" },
    { id: "all", label: "Todos", count: "all" },
];
const fieldStyle = {
    width: "100%",
    height: 40,
    padding: "0 12px",
    background: "var(--input-bg)",
    color: "var(--text)",
    border: "1px solid var(--stroke)",
    borderRadius: 9,
    fontSize: 13,
};

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

function addFilters(params, filters) {
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.fromDate) params.set("fromDate", filters.fromDate);
    if (filters.toDate) params.set("toDate", filters.toDate);
    if (filters.platformId) params.set("platformId", filters.platformId);
}

export default function AdminReplacements() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();
    const [items, setItems] = useState([]);
    const [platforms, setPlatforms] = useState([]);
    const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
    const [appliedFilters, setAppliedFilters] = useState({ ...EMPTY_FILTERS });
    const [page, setPage] = useState(1);
    const [limit] = useState(20);
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState({ pending: 0, reviewed: 0, all: 0 });
    const [reviewState, setReviewState] = useState("pending");
    const [expandedId, setExpandedId] = useState(null);
    const [credentialData, setCredentialData] = useState({});
    const [loadingCredentialsId, setLoadingCredentialsId] = useState(null);
    const [revealed, setRevealed] = useState({});
    const [reviewingId, setReviewingId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    async function logout() {
        try { await apiLogout(); } catch {}
        setUser(null);
        navigate("/", { replace: true });
    }

    const load = useCallback(async (nextPage = 1, { clearNotice = true } = {}) => {
        setLoading(true);
        setError("");
        if (clearNotice) setNotice("");
        try {
            const params = new URLSearchParams({ page: String(nextPage), limit: String(limit), reviewState });
            addFilters(params, appliedFilters);
            const { ok, data } = await apiFetch(`/admin/replacements?${params.toString()}`, { method: "GET", cache: "no-store" });
            if (!ok) throw new Error(data?.message || "No se pudo cargar el historial.");
            setItems(data.items || []);
            setCounts(data.counts || { pending: 0, reviewed: 0, all: 0 });
            if (Array.isArray(data.platforms)) setPlatforms(data.platforms);
            setPage(Number(data.page || nextPage));
            setTotal(Number(data.total || 0));
            return true;
        } catch (e) {
            setError(e.message || "Error cargando historial.");
            setItems([]);
            setTotal(0);
            setCounts({ pending: 0, reviewed: 0, all: 0 });
            return false;
        } finally {
            setLoading(false);
        }
    }, [limit, appliedFilters, reviewState]);

    useEffect(() => {
        let active = true;
        queueMicrotask(() => {
            if (active) void load(1);
        });
        return () => { active = false; };
    }, [load]);

    function updateFilter(name, value) {
        setFilters((current) => ({ ...current, [name]: value }));
    }

    function applyFilters(event) {
        event.preventDefault();
        setPage(1);
        setAppliedFilters({ ...filters });
    }

    function clearFilters() {
        setFilters({ ...EMPTY_FILTERS });
        setPage(1);
        setAppliedFilters({ ...EMPTY_FILTERS });
    }

    async function toggleDetails(item) {
        if (expandedId === item.id) {
            setExpandedId(null);
            return;
        }
        setExpandedId(item.id);
        if (credentialData[item.id]) return;

        setLoadingCredentialsId(item.id);
        try {
            const result = await apiFetch(`/admin/replacements/${item.id}/credentials`, { method: "GET", cache: "no-store" });
            if (!result.ok) throw new Error(result.data?.message || "No se pudieron cargar las credenciales.");
            setCredentialData((current) => ({ ...current, [item.id]: result.data?.item || null }));
        } catch (e) {
            setError(e.message || "No se pudieron cargar las credenciales.");
            setExpandedId(null);
        } finally {
            setLoadingCredentialsId(null);
        }
    }

    function toggleSecret(id, field) {
        const key = `${id}:${field}`;
        setRevealed((current) => ({ ...current, [key]: !current[key] }));
    }

    async function markReviewed(item) {
        setReviewingId(item.id);
        setError("");
        setNotice("");
        try {
            const result = await apiFetch(`/admin/replacements/${item.id}/review`, { method: "POST", cache: "no-store" });
            if (!result.ok) throw new Error(result.data?.message || "No se pudo archivar el reemplazo.");
            setExpandedId(null);
            const refreshed = await load(1, { clearNotice: false });
            if (refreshed) setNotice(`Reemplazo #${item.id} marcado como revisado y archivado.`);
        } catch (e) {
            setError(e.message || "No se pudo archivar el reemplazo.");
        } finally {
            setReviewingId(null);
        }
    }

    async function exportExcel() {
        if (!window.confirm("El Excel incluirá contraseñas y PIN de las cuentas reemplazadas. Guárdalo y compártelo solo con personal autorizado. ¿Continuar?")) return;
        setExporting(true);
        setError("");
        setNotice("");
        try {
            const firstParams = new URLSearchParams({ page: "1", limit: "200", reviewState, includeCredentials: "1" });
            addFilters(firstParams, appliedFilters);
            const first = await apiFetch(`/admin/replacements?${firstParams.toString()}`, { method: "GET", cache: "no-store" });
            if (!first.ok) throw new Error(first.data?.message || "No se pudo consultar el historial para exportar.");

            const allItems = [...(first.data?.items || [])];
            const totalPages = Math.max(Number(first.data?.totalPages) || 1, 1);
            for (let nextPage = 2; nextPage <= totalPages; nextPage += 1) {
                const params = new URLSearchParams({ page: String(nextPage), limit: "200", reviewState, includeCredentials: "1" });
                addFilters(params, appliedFilters);
                const result = await apiFetch(`/admin/replacements?${params.toString()}`, { method: "GET", cache: "no-store" });
                if (!result.ok) throw new Error(result.data?.message || "No se pudo completar la exportación.");
                allItems.push(...(result.data?.items || []));
            }

            if (!allItems.length) {
                setNotice("No hay reemplazos para exportar con estos filtros.");
                return;
            }

            const rows = allItems.map((item) => ({
                "Fecha y hora (Bogotá)": fmtDateTime(item.created_at),
                "ID de reemplazo": item.id,
                "Plataforma": item.platform_name || "—",
                "Pedido": item.order_code || (item.order_id ? `#${item.order_id}` : "—"),
                "ID de suscripción": item.subscription_id,
                "Cliente": item.user_name || "—",
                "Correo del cliente": item.user_email || "—",
                "Cuenta anterior (ID)": item.old_account_id || "—",
                "Cuenta anterior": item.old_account_email || "—",
                "Contraseña anterior (inventario actual)": item.old_account_password || "—",
                "PIN anterior (inventario actual)": item.old_account_pin || "—",
                "Perfil anterior": item.old_account_profile_number || "—",
                "Estado anterior": item.old_account_status || "—",
                "Expiración inventario anterior": item.old_account_expiry || "—",
                "Cuenta nueva (ID)": item.new_account_id || "—",
                "Cuenta nueva": item.new_account_email || "—",
                "Contraseña nueva (inventario actual)": item.new_account_password || "—",
                "PIN nuevo (inventario actual)": item.new_account_pin || "—",
                "Perfil nuevo": item.new_account_profile_number || "—",
                "Estado nuevo": item.new_account_status || "—",
                "Expiración inventario nueva": item.new_account_expiry || "—",
                "Expiración anterior": item.previousExpiresLabel ? formatBogotaDate(item.previousExpiresLabel) : "—",
                "Ticket soporte": item.support_ticket_code || "—",
                "Estado de revisión": item.reviewed_at ? "Archivado" : "Pendiente",
                "Revisado por": item.reviewer_email || item.reviewer_name || "—",
                "Fecha revisado": item.reviewed_at ? fmtDateTime(item.reviewed_at) : "—",
                "Administrador": item.admin_email || item.admin_name || "—",
            }));
            const XLSX = await loadXlsx();
            const worksheet = XLSX.utils.json_to_sheet(rows);
            worksheet["!cols"] = [
                { wch: 21 }, { wch: 15 }, { wch: 22 }, { wch: 27 }, { wch: 18 },
                { wch: 22 }, { wch: 32 }, { wch: 19 }, { wch: 32 }, { wch: 17 },
                { wch: 32 }, { wch: 20 }, { wch: 30 },
            ];
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Reemplazos");
            const selectedPlatform = platforms.find((platform) => String(platform.id) === String(appliedFilters.platformId));
            const context = (selectedPlatform?.name || "todos").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            const period = appliedFilters.fromDate || appliedFilters.toDate
                ? `${appliedFilters.fromDate || "inicio"}_${appliedFilters.toDate || "hoy"}`
                : currentBogotaDateOnly();
            XLSX.writeFile(workbook, `Reemplazos_${reviewState}_${context}_${period}.xlsx`);
            setNotice(`${allItems.length} reemplazo(s) exportado(s).`);
        } catch (e) {
            setError(e.message || "No se pudo generar el Excel.");
        } finally {
            setExporting(false);
        }
    }

    const totalPages = Math.max(Math.ceil(total / limit), 1);

    function renderSecret(itemId, field, value) {
        const isRevealed = Boolean(revealed[`${itemId}:${field}`]);
        const isPassword = field.endsWith("password");
        const accountSide = field.startsWith("old_") ? "anterior" : "nueva";
        return (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                <code style={{ color: "var(--text)", overflowWrap: "anywhere" }}>{value ? (isRevealed ? value : "••••••••") : "—"}</code>
                {value && (
                    <button
                        type="button"
                        onClick={() => toggleSecret(itemId, field)}
                        aria-label={`${isRevealed ? "Ocultar" : "Mostrar"} ${isPassword ? "contraseña" : "PIN"} de cuenta ${accountSide} ${itemId}`}
                        title={`${isRevealed ? "Ocultar" : "Mostrar"} ${isPassword ? "contraseña" : "PIN"}`}
                        style={{ border: 0, background: "transparent", color: "var(--muted)", padding: 4, cursor: "pointer", display: "inline-flex" }}
                    >
                        {isRevealed ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
                    </button>
                )}
            </span>
        );
    }

    function renderAccountDetails(item, side, label) {
        const credential = credentialData[item.id];
        const prefix = side === "old" ? "old_account" : "new_account";
        return (
            <section key={side} style={{ minWidth: 260, flex: "1 1 280px", padding: 14, border: "1px solid var(--stroke)", borderRadius: 8, background: "var(--bg0)" }}>
                <h3 style={{ margin: "0 0 12px", color: "var(--text)", fontSize: 13 }}>{label}</h3>
                {[
                    ["Correo", credential?.[`${prefix}_email`]],
                    ["Contraseña", renderSecret(item.id, `${side}_password`, credential?.[`${prefix}_password`])],
                    ["PIN", renderSecret(item.id, `${side}_pin`, credential?.[`${prefix}_pin`])],
                    ["Perfil", credential?.[`${prefix}_profile_number`] ? `Perfil ${credential[`${prefix}_profile_number`]}` : "Sin perfil"],
                    ["Estado", credential?.[`${prefix}_status`] || "No disponible"],
                    ["Expira en inventario", credential?.[`${prefix}_expiry`] || "—"],
                ].map(([name, value]) => (
                    <div key={name} style={{ display: "grid", gridTemplateColumns: "135px minmax(0, 1fr)", gap: 8, padding: "6px 0", borderTop: "1px solid var(--stroke2)", fontSize: 12 }}>
                        <span style={{ color: "var(--muted)" }}>{name}</span>
                        <strong style={{ color: "var(--text)", overflowWrap: "anywhere", fontWeight: 650 }}>{value || "—"}</strong>
                    </div>
                ))}
            </section>
        );
    }

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
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, gap: 16, flexWrap: "wrap", borderBottom: "1px solid var(--stroke)", paddingBottom: 20 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#34d399" }}>
                                <ArrowLeftRight size={22} aria-hidden />
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)" }}>Reemplazos</h1>
                                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>Verifica la cuenta que salió, la que entró y archiva cada caso al revisarlo.</p>
                            </div>
                        </div>
                        <div style={{ padding: "9px 13px", borderRadius: 9, border: "1px solid var(--stroke)", background: "var(--card)", color: "var(--muted)", fontSize: 12, fontWeight: 700 }}>
                            {total.toLocaleString("es-CO")} registros
                        </div>
                    </motion.div>

                    <div role="tablist" aria-label="Estado de revisión" style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid var(--stroke)", paddingBottom: 12, overflowX: "auto" }}>
                        {REVIEW_VIEWS.map((view) => (
                            <button
                                key={view.id}
                                type="button"
                                role="tab"
                                aria-selected={reviewState === view.id}
                                onClick={() => { setPage(1); setExpandedId(null); setReviewState(view.id); }}
                                style={{ minHeight: 40, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 9, whiteSpace: "nowrap", border: `1px solid ${reviewState === view.id ? "rgba(13,166,242,.55)" : "var(--stroke)"}`, borderRadius: 8, background: reviewState === view.id ? "rgba(13,166,242,.12)" : "var(--card)", color: reviewState === view.id ? "var(--accent)" : "var(--muted)", fontWeight: 800, cursor: "pointer" }}
                            >
                                {view.id === "reviewed" && <Archive size={15} aria-hidden />}
                                {view.label}
                                <span style={{ minWidth: 22, textAlign: "center", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{Number(counts[view.count] || 0).toLocaleString("es-CO")}</span>
                            </button>
                        ))}
                    </div>

                    <form onSubmit={applyFilters} style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: 12, alignItems: "end" }}>
                            <label style={{ display: "grid", gap: 6, color: "var(--muted)", fontSize: 12, fontWeight: 700 }}>
                                Desde
                                <span style={{ position: "relative" }}>
                                    <CalendarDays size={15} style={{ position: "absolute", left: 11, top: 12, color: "var(--muted)" }} aria-hidden />
                                    <input aria-label="Fecha desde" type="date" value={filters.fromDate} onChange={(event) => updateFilter("fromDate", event.target.value)} style={{ ...fieldStyle, paddingLeft: 34 }} />
                                </span>
                            </label>
                            <label style={{ display: "grid", gap: 6, color: "var(--muted)", fontSize: 12, fontWeight: 700 }}>
                                Hasta
                                <span style={{ position: "relative" }}>
                                    <CalendarDays size={15} style={{ position: "absolute", left: 11, top: 12, color: "var(--muted)" }} aria-hidden />
                                    <input aria-label="Fecha hasta" type="date" value={filters.toDate} onChange={(event) => updateFilter("toDate", event.target.value)} style={{ ...fieldStyle, paddingLeft: 34 }} />
                                </span>
                            </label>
                            <label style={{ display: "grid", gap: 6, color: "var(--muted)", fontSize: 12, fontWeight: 700 }}>
                                Plataforma
                                <select aria-label="Plataforma" value={filters.platformId} onChange={(event) => updateFilter("platformId", event.target.value)} style={fieldStyle}>
                                    <option value="">Todas las plataformas</option>
                                    {platforms.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}
                                </select>
                            </label>
                                <label style={{ display: "grid", gap: 6, color: "var(--muted)", fontSize: 12, fontWeight: 700, gridColumn: "1 / -1" }}>
                                Buscar
                                <input aria-label="Buscar reemplazos" value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Pedido, suscripción, usuario o cuenta" style={fieldStyle} />
                            </label>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 9, flexWrap: "wrap", marginTop: 13 }}>
                            <button type="button" onClick={clearFilters} disabled={loading || exporting} style={{ height: 38, padding: "0 13px", borderRadius: 8, border: "1px solid var(--stroke)", background: "transparent", color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                                <RotateCcw size={15} aria-hidden /> Limpiar
                            </button>
                            <button type="button" onClick={exportExcel} disabled={loading || exporting || total === 0} title="El Excel contiene contraseñas y PIN" style={{ height: 38, padding: "0 13px", borderRadius: 8, border: "1px solid rgba(16,185,129,.45)", background: "rgba(16,185,129,.1)", color: "#34d399", display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 700, cursor: "pointer", opacity: total === 0 ? 0.5 : 1 }}>
                                <Download size={15} aria-hidden /> {exporting ? "Exportando..." : "Exportar Excel"}
                            </button>
                            <button type="submit" disabled={loading || exporting} style={{ height: 38, padding: "0 17px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#0da6f2,#7c5cff)", color: "#fff", display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 800, cursor: "pointer", opacity: loading ? 0.65 : 1 }}>
                                <Search size={15} aria-hidden /> {loading ? "Buscando..." : "Filtrar"}
                            </button>
                        </div>
                    </form>

                    {error && <div className="error" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
                    {notice && <div role="status" style={{ marginBottom: 14, padding: "10px 13px", border: "1px solid rgba(16,185,129,.35)", borderRadius: 9, background: "rgba(16,185,129,.08)", color: "#6ee7b7", fontSize: 13 }}>{notice}</div>}

                    <div style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 12, overflow: "hidden", boxShadow: "0 10px 32px rgba(0,0,0,0.12)" }}>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 1180 }}>
                                <thead>
                                    <tr style={{ background: "rgba(0,0,0,0.2)", borderBottom: "1px solid var(--stroke2)" }}>
                                        {["Fecha (Bogotá)", "Plataforma", "Pedido / cliente", "Cuenta anterior", "Cuenta nueva", "Perfiles", "Expiraba", "Revisión", "Acciones"].map((label) => (
                                            <th key={label} style={{ padding: "12px 13px", textAlign: "left", whiteSpace: "nowrap", color: "var(--muted)" }}>{label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={9} style={{ padding: 40, textAlign: "center" }}><div className="spinner" style={{ margin: "0 auto" }} /></td></tr>
                                    ) : items.length === 0 ? (
                                        <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{reviewState === "pending" ? "No hay reemplazos pendientes de revisión." : "No hay reemplazos para estos filtros."}</td></tr>
                                    ) : items.map((item, index) => {
                                        const accountDetails = credentialData[item.id];
                                        const isExpanded = expandedId === item.id;
                                        return (
                                            <Fragment key={item.id}>
                                                <tr style={{ borderBottom: isExpanded ? 0 : "1px solid var(--stroke2)", background: index % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                                                    <td style={{ padding: "12px 13px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                                                        {fmtDateTime(item.created_at)}
                                                        {item.support_ticket_code && <div style={{ color: "var(--accent)", marginTop: 4 }}>Ticket {item.support_ticket_code}</div>}
                                                    </td>
                                                    <td style={{ padding: "12px 13px", whiteSpace: "nowrap" }}><strong>{item.platform_name || "—"}</strong></td>
                                                    <td style={{ padding: "12px 13px" }}>
                                                        <strong>{item.order_code || (item.order_id ? `#${item.order_id}` : "—")}</strong>
                                                        <div style={{ color: "var(--muted)", marginTop: 3 }}>{item.user_name || item.user_email || "—"}</div>
                                                        {item.user_name && item.user_email && <div style={{ color: "var(--muted)", marginTop: 2 }}>{item.user_email}</div>}
                                                        <div style={{ color: "var(--muted)", marginTop: 2 }}>Suscripción #{item.subscription_id}</div>
                                                    </td>
                                                    <td style={{ padding: "12px 13px" }}>
                                                        <strong>{item.old_account_email || "—"}</strong>
                                                        <div style={{ color: "var(--muted)", marginTop: 3 }}>ID #{item.old_account_id} · {item.old_account_status || "sin estado"}</div>
                                                    </td>
                                                    <td style={{ padding: "12px 13px" }}>
                                                        <strong>{item.new_account_email || "—"}</strong>
                                                        <div style={{ color: "var(--muted)", marginTop: 3 }}>ID #{item.new_account_id} · {item.new_account_status || "sin estado"}</div>
                                                    </td>
                                                    <td style={{ padding: "12px 13px", whiteSpace: "nowrap" }}>
                                                        <div>{item.old_account_profile_number ? `Anterior ${item.old_account_profile_number}` : "Anterior —"}</div>
                                                        <div style={{ color: "var(--muted)", marginTop: 3 }}>{item.new_account_profile_number ? `Nueva ${item.new_account_profile_number}` : "Nueva —"}</div>
                                                    </td>
                                                    <td style={{ padding: "12px 13px", whiteSpace: "nowrap" }}>
                                                        <div>{item.previousExpiresLabel ? formatBogotaDate(item.previousExpiresLabel) : "—"}</div>
                                                        {item.new_account_expiry && <div style={{ color: "var(--muted)", marginTop: 3 }}>Cuenta nueva: {item.new_account_expiry}</div>}
                                                    </td>
                                                    <td style={{ padding: "12px 13px", whiteSpace: "nowrap" }}>
                                                        {item.reviewed_at ? (
                                                            <><strong style={{ color: "#34d399" }}>Archivado</strong><div style={{ color: "var(--muted)", marginTop: 3 }}>{item.reviewer_email || item.reviewer_name || "Admin"}</div><div style={{ color: "var(--muted)", marginTop: 2 }}>{fmtDateTime(item.reviewed_at)}</div></>
                                                        ) : <strong style={{ color: "#fbbf24" }}>Pendiente</strong>}
                                                    </td>
                                                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                                                        <div style={{ display: "grid", gap: 6 }}>
                                                            <button type="button" onClick={() => void toggleDetails(item)} disabled={loadingCredentialsId === item.id} aria-expanded={isExpanded} style={{ minHeight: 34, padding: "0 10px", border: "1px solid var(--stroke)", borderRadius: 7, background: "var(--bg0)", color: "var(--text)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}>
                                                                {isExpanded ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
                                                                {loadingCredentialsId === item.id ? "Cargando..." : isExpanded ? "Ocultar datos" : "Ver cuentas"}
                                                            </button>
                                                            {!item.reviewed_at && <button type="button" onClick={() => void markReviewed(item)} disabled={reviewingId === item.id} style={{ minHeight: 34, padding: "0 10px", border: "1px solid rgba(16,185,129,.4)", borderRadius: 7, background: "rgba(16,185,129,.1)", color: "#34d399", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 750, cursor: "pointer" }}>
                                                                <Archive size={14} aria-hidden /> {reviewingId === item.id ? "Archivando..." : "Revisado"}
                                                            </button>}
                                                        </div>
                                                    </td>
                                                </tr>
                                                {isExpanded && <tr style={{ borderBottom: "1px solid var(--stroke2)" }}><td colSpan={9} style={{ padding: 14, background: "rgba(0,0,0,.12)" }}>
                                                    {loadingCredentialsId === item.id ? <div style={{ padding: 18, color: "var(--muted)" }}>Cargando datos protegidos...</div> : accountDetails ? (
                                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                                                            {renderAccountDetails(item, "old", "Cuenta anterior")}
                                                            {renderAccountDetails(item, "new", "Cuenta de reemplazo")}
                                                            <div style={{ flex: "1 1 100%", color: "var(--muted)", fontSize: 11 }}>Las contraseñas y PIN se consultan del inventario actual, no son una copia histórica. Se ocultan al abrir. El Excel también los incluye y debe compartirse solo con personal autorizado.</div>
                                                        </div>
                                                    ) : <div style={{ padding: 18, color: "var(--muted)" }}>Los datos de esta cuenta ya no están disponibles en el inventario.</div>}
                                                </td></tr>}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {total > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", borderTop: "1px solid var(--stroke)", background: "var(--bg0)", gap: 12, flexWrap: "wrap" }}>
                                <div style={{ fontSize: 12, color: "var(--muted)" }}>Mostrando {items.length} de {total.toLocaleString("es-CO")} · página <b style={{ color: "var(--accent)" }}>{page}</b> de {totalPages}</div>
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
