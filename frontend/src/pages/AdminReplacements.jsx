import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeftRight, CalendarDays, Download, RotateCcw, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { apiFetch, apiLogout } from "../api/api.js";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";
import { currentBogotaDateOnly, formatBogotaDate } from "../utils/datetime.js";
import { loadXlsx } from "../utils/loadXlsx.js";

const EMPTY_FILTERS = { q: "", fromDate: "", toDate: "", platformId: "" };
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
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    async function logout() {
        try { await apiLogout(); } catch {}
        setUser(null);
        navigate("/", { replace: true });
    }

    const load = useCallback(async (nextPage = 1) => {
        setLoading(true);
        setError("");
        setNotice("");
        try {
            const params = new URLSearchParams({ page: String(nextPage), limit: String(limit) });
            addFilters(params, appliedFilters);
            const { ok, data } = await apiFetch(`/admin/replacements?${params.toString()}`, { method: "GET" });
            if (!ok) throw new Error(data?.message || "No se pudo cargar el historial.");
            setItems(data.items || []);
            if (Array.isArray(data.platforms)) setPlatforms(data.platforms);
            setPage(Number(data.page || nextPage));
            setTotal(Number(data.total || 0));
        } catch (e) {
            setError(e.message || "Error cargando historial.");
            setItems([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [limit, appliedFilters]);

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

    async function exportExcel() {
        setExporting(true);
        setError("");
        setNotice("");
        try {
            const firstParams = new URLSearchParams({ page: "1", limit: "200" });
            addFilters(firstParams, appliedFilters);
            const first = await apiFetch(`/admin/replacements?${firstParams.toString()}`, { method: "GET" });
            if (!first.ok) throw new Error(first.data?.message || "No se pudo consultar el historial para exportar.");

            const allItems = [...(first.data?.items || [])];
            const totalPages = Math.max(Number(first.data?.totalPages) || 1, 1);
            for (let nextPage = 2; nextPage <= totalPages; nextPage += 1) {
                const params = new URLSearchParams({ page: String(nextPage), limit: "200" });
                addFilters(params, appliedFilters);
                const result = await apiFetch(`/admin/replacements?${params.toString()}`, { method: "GET" });
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
                "Cuenta nueva (ID)": item.new_account_id || "—",
                "Cuenta nueva": item.new_account_email || "—",
                "Expiración anterior": item.previousExpiresLabel ? formatBogotaDate(item.previousExpiresLabel) : "—",
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
            XLSX.writeFile(workbook, `Reemplazos_${context}_${period}.xlsx`);
            setNotice(`${allItems.length} reemplazo(s) exportado(s).`);
        } catch (e) {
            setError(e.message || "No se pudo generar el Excel.");
        } finally {
            setExporting(false);
        }
    }

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
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, gap: 16, flexWrap: "wrap", borderBottom: "1px solid var(--stroke)", paddingBottom: 20 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#34d399" }}>
                                <ArrowLeftRight size={22} aria-hidden />
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)" }}>Historial de Reemplazos</h1>
                                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>Consulta la cuenta anterior, la nueva y cuándo se hizo el cambio.</p>
                            </div>
                        </div>
                        <div style={{ padding: "9px 13px", borderRadius: 9, border: "1px solid var(--stroke)", background: "var(--card)", color: "var(--muted)", fontSize: 12, fontWeight: 700 }}>
                            {total.toLocaleString("es-CO")} registros
                        </div>
                    </motion.div>

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
                            <button type="button" onClick={exportExcel} disabled={loading || exporting || total === 0} style={{ height: 38, padding: "0 13px", borderRadius: 8, border: "1px solid rgba(16,185,129,.45)", background: "rgba(16,185,129,.1)", color: "#34d399", display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 700, cursor: "pointer", opacity: total === 0 ? 0.5 : 1 }}>
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
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 1050 }}>
                                <thead>
                                    <tr style={{ background: "rgba(0,0,0,0.2)", borderBottom: "1px solid var(--stroke2)" }}>
                                        {["Fecha (Bogotá)", "Pedido / suscripción", "Plataforma", "Cliente", "Cuenta anterior", "Cuenta nueva", "Expiraba", "Admin"].map((label) => (
                                            <th key={label} style={{ padding: "12px 13px", textAlign: "left", whiteSpace: "nowrap", color: "var(--muted)" }}>{label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={8} style={{ padding: 40, textAlign: "center" }}><div className="spinner" style={{ margin: "0 auto" }} /></td></tr>
                                    ) : items.length === 0 ? (
                                        <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No hay reemplazos para estos filtros.</td></tr>
                                    ) : items.map((item, index) => (
                                        <tr key={item.id} style={{ borderBottom: "1px solid var(--stroke2)", background: index % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                                            <td style={{ padding: "12px 13px", color: "var(--muted)", whiteSpace: "nowrap" }}>{fmtDateTime(item.created_at)}</td>
                                            <td style={{ padding: "12px 13px" }}><strong>{item.order_code || (item.order_id ? `#${item.order_id}` : "—")}</strong><div style={{ color: "var(--muted)", marginTop: 3 }}>Suscripción #{item.subscription_id}</div></td>
                                            <td style={{ padding: "12px 13px", whiteSpace: "nowrap" }}>{item.platform_name || "—"}</td>
                                            <td style={{ padding: "12px 13px" }}>{item.user_name || item.user_email || "—"}{item.user_name && item.user_email && <div style={{ color: "var(--muted)", marginTop: 3 }}>{item.user_email}</div>}</td>
                                            <td style={{ padding: "12px 13px" }}><strong>{item.old_account_email || "—"}</strong><div style={{ color: "var(--muted)", marginTop: 3 }}>ID #{item.old_account_id}</div></td>
                                            <td style={{ padding: "12px 13px" }}><strong>{item.new_account_email || "—"}</strong><div style={{ color: "var(--muted)", marginTop: 3 }}>ID #{item.new_account_id}</div></td>
                                            <td style={{ padding: "12px 13px", whiteSpace: "nowrap" }}>{item.previousExpiresLabel ? formatBogotaDate(item.previousExpiresLabel) : "—"}</td>
                                            <td style={{ padding: "12px 13px", whiteSpace: "nowrap" }}>{item.admin_email || item.admin_name || "—"}</td>
                                        </tr>
                                    ))}
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
