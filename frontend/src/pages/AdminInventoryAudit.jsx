import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Plus, RefreshCcw, Search, SlidersHorizontal, Trash2, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../api/api.js";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import useAppLogout from "../hooks/useAppLogout.js";
import { loadXlsx } from "../utils/loadXlsx.js";
import { currentBogotaDateOnly, formatDateOnlyDisplay, formatBogotaDateTime } from "../utils/datetime.js";
import { filterAvailabilityRows, availabilityTotals, availabilitySheets, PROFILE_LABELS } from "../utils/inventoryAvailability.js";
import "../styles/admin-inventory-audit.css";

const STORAGE_KEY = "adminInventoryAuditRules";
const AVAILABILITY_STORAGE_KEY = "adminInventoryAvailabilityRules";
const FILTERS = [
    { value: "with_free", label: "Con perfiles libres" },
    { value: "all", label: "Todas las activas" },
    { value: "full", label: "Ocupadas completas" },
    { value: "review", label: "Por revisar" },
];

function storedRules(key = STORAGE_KEY) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || "null");
        return Array.isArray(value) ? value : [];
    } catch { return []; }
}

function ProfileBadge({ profile, duplicate = false }) {
    const label = duplicate ? PROFILE_LABELS.duplicate : PROFILE_LABELS[profile.state];
    const inventoryIds = profile.accountIds?.map((id) => `#${id}`).join(", ");
    return <span className={`availability-profile ${profile.state}${duplicate ? " duplicate" : ""}`} title={duplicate ? `Perfil ${profile.number} duplicado en inventarios ${inventoryIds}` : `Perfil ${profile.number}: ${label}`}>
        <b>{profile.number}</b><span>{label}</span>
    </span>;
}

function duplicateProfileSummary(row) {
    const duplicates = row.duplicateProfiles || [];
    if (!duplicates.length) return "";
    const profileIds = duplicates.map((number) => row.profiles.find((profile) => profile.number === number)?.accountIds || []).flat();
    const inventory = [...new Set(profileIds)].map((id) => `#${id}`).join(", ");
    return `Perfil${duplicates.length > 1 ? "es" : ""} ${duplicates.join(", ")} duplicado${duplicates.length > 1 ? "s" : ""}${inventory ? ` · inventario ${inventory}` : ""}`;
}

export default function AdminInventoryAudit() {
    const navigate = useNavigate();
    const logout = useAppLogout();
    const { user } = useAuth();
    const requestId = useRef(0);
    const [platforms, setPlatforms] = useState([]);
    const [rules, setRules] = useState([]);
    const [audit, setAudit] = useState(null);
    const [availability, setAvailability] = useState("with_free");
    const [providerFilter, setProviderFilter] = useState("all");
    const [platformFilter, setPlatformFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState("free");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [expanded, setExpanded] = useState(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [draftPlatformId, setDraftPlatformId] = useState("");
    const [draftProfiles, setDraftProfiles] = useState(5);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [copied, setCopied] = useState("");

    const loadAudit = useCallback(async (references) => {
        const id = ++requestId.current;
        setLoading(true);
        setError("");
        setNotice("");
        try {
            const query = references ? `?${new URLSearchParams({ rules: JSON.stringify(references) })}` : "";
            const response = await apiGet(`/admin/inventory-audit${query}`, { timeoutMs: 60000 });
            if (id !== requestId.current) return;
            if (!response.ok) throw new Error(response.data?.message || "No se pudo cargar la disponibilidad.");
            setAudit(response.data);
            setPage(1);
        } catch (loadError) {
            if (id === requestId.current) setError(loadError.message || "No se pudo cargar la disponibilidad.");
        } finally {
            if (id === requestId.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        async function initialize() {
            try {
                const [platformResponse, auditResponse] = await Promise.all([
                    apiGet("/admin/platforms"),
                    apiGet("/admin/inventory-audit", { timeoutMs: 60000 }),
                ]);
                if (cancelled) return;
                if (!auditResponse.ok) throw new Error(auditResponse.data?.message || "No se pudo cargar la disponibilidad.");
                const platformList = Array.isArray(platformResponse.data) ? platformResponse.data : [];
                if (platformResponse.ok) setPlatforms(platformList);
                const saved = storedRules();
                const defaults = auditResponse.data.rules || [];
                const activeIds = new Set(platformList.filter((platform) => Number(platform.is_active ?? platform.isActive ?? 1) === 1).map((platform) => Number(platform.id)));
                const configured = storedRules(AVAILABILITY_STORAGE_KEY).filter((rule) => activeIds.has(Number(rule.platformId))
                    && Number.isInteger(Number(rule.expectedProfiles)) && rule.expectedProfiles >= 1 && rule.expectedProfiles <= 30);
                const references = configured.length ? configured.map((rule) => ({ platformId: Number(rule.platformId), expectedProfiles: Number(rule.expectedProfiles) })) : defaults.map((rule) => {
                    const stored = saved.find((item) => Number(item.platformId) === Number(rule.platformId));
                    const count = Number(stored?.expectedProfiles);
                    return { platformId: rule.platformId, expectedProfiles: Number.isInteger(count) && count > 0 && count <= 30 ? count : rule.expectedProfiles };
                });
                setRules(references);
                setAudit(auditResponse.data);
                if (configured.length || references.some((rule, index) => rule.expectedProfiles !== defaults[index].expectedProfiles)) await loadAudit(references);
            } catch (loadError) {
                if (!cancelled) setError(loadError.message || "No se pudo cargar la disponibilidad.");
            } finally { if (!cancelled) setLoading(false); }
        }
        initialize();
        return () => { cancelled = true; requestId.current += 1; };
    }, [loadAudit]);

    const activeRows = useMemo(() => (audit?.rows || []).filter((row) => row.accountActive), [audit]);
    const providerOptions = useMemo(() => [...new Map(activeRows.map((row) => [String(row.providerId || "none"), row.providerName])).entries()]
        .sort((a, b) => a[1].localeCompare(b[1], "es")), [activeRows]);
    const platformOptions = useMemo(() => [...new Map(activeRows.map((row) => [String(row.platformId), row.platformName])).entries()]
        .sort((a, b) => a[1].localeCompare(b[1], "es")), [activeRows]);
    const scopedRows = useMemo(() => filterAvailabilityRows(activeRows, { providerFilter, platformFilter, search }), [activeRows, providerFilter, platformFilter, search]);
    const totals = useMemo(() => availabilityTotals(scopedRows), [scopedRows]);
    const visibleRows = useMemo(() => filterAvailabilityRows(scopedRows, { availability }).sort((a, b) => {
        if (sort === "email") return a.accountEmail.localeCompare(b.accountEmail);
        if (sort === "expires") return (a.providerExpiresAt || "9999").localeCompare(b.providerExpiresAt || "9999") || a.accountEmail.localeCompare(b.accountEmail);
        return b.freeProfiles.length - a.freeProfiles.length || a.accountEmail.localeCompare(b.accountEmail);
    }), [scopedRows, availability, sort]);
    const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
    const currentPage = Math.min(page, pageCount);
    const pageRows = visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const excluded = Object.values(audit?.excluded || {}).reduce((sum, count) => sum + Number(count), 0);
    const activePlatforms = platforms.filter((platform) => Number(platform.is_active ?? platform.isActive ?? 1) === 1);
    const platformNames = new Map(platforms.map((platform) => [Number(platform.id), platform.name]));
    const rulesChanged = audit && JSON.stringify(rules.map(({ platformId, expectedProfiles }) => ({ platformId, expectedProfiles })))
        !== JSON.stringify(audit.rules.map(({ platformId, expectedProfiles }) => ({ platformId, expectedProfiles })));

    function changeFilter(setter, value) { setter(value); setPage(1); setExpanded(null); }

    async function applyRules() {
        if (!rules.length) { setError("Agrega al menos una plataforma."); return; }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
        localStorage.setItem(AVAILABILITY_STORAGE_KEY, JSON.stringify(rules));
        await loadAudit(rules);
    }

    async function copyEmail(email) {
        try { await navigator.clipboard.writeText(email); setCopied(email); }
        catch { setError("No se pudo copiar el correo."); }
    }

    async function exportExcel(all = false) {
        const rows = all ? activeRows : visibleRows;
        if (!rows.length || loading || rulesChanged) return;
        setExporting(true);
        setError("");
        try {
            const XLSX = await loadXlsx();
            const workbook = XLSX.utils.book_new();
            for (const [name, data] of Object.entries(availabilitySheets(rows))) {
                const sheet = XLSX.utils.json_to_sheet(data);
                sheet["!cols"] = Object.keys(data[0] || {}).map((key) => ({ wch: key.includes("Correo") ? 42 : key.includes("Proveedor") ? 24 : 22 }));
                if (sheet["!ref"]) sheet["!autofilter"] = { ref: sheet["!ref"] };
                XLSX.utils.book_append_sheet(workbook, sheet, name);
            }
            XLSX.writeFile(workbook, `Disponibilidad_${all ? "activas" : "filtrada"}_${currentBogotaDateOnly()}.xlsx`);
            setNotice(`Exportadas ${rows.length} cuentas activas.`);
        } catch (exportError) { setError(exportError.message || "No se pudo exportar el Excel."); }
        finally { setExporting(false); }
    }

    return <div className="page-shell">
        <div className="page-shell-bg" aria-hidden><div className="bg-grid" /></div>
        <div className="page-inner">
            <AdminSidebar user={user} uploadingLogo={false} onOpenLogoPicker={() => navigate("/admin")} onLogout={logout} />
            <main className="main admin-audit-main">
                <header className="availability-header">
                    <div className="availability-title"><Users size={26} aria-hidden /><div><h1>Disponibilidad de perfiles</h1><span>{audit ? `Actualizado ${formatBogotaDateTime(audit.generatedAt)}` : "Cuentas activas"}</span></div></div>
                    <div className="availability-actions">
                        <button className="availability-icon" title="Volver al inventario" aria-label="Volver al inventario" onClick={() => navigate("/admin/inventory")}><ArrowLeft size={18} /></button>
                        <button className="availability-icon" title="Configurar perfiles por plataforma" aria-label="Configurar perfiles por plataforma" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}><SlidersHorizontal size={18} /></button>
                        <button className="availability-icon" title="Actualizar disponibilidad" aria-label="Actualizar disponibilidad" disabled={loading} onClick={() => loadAudit(audit?.rules)}><RefreshCcw size={18} className={loading ? "availability-spin" : ""} /></button>
                        <button className="availability-button" disabled={loading || exporting || rulesChanged || !activeRows.length} onClick={() => exportExcel(true)}><Download size={16} />Exportar activas</button>
                        <button className="availability-button primary" disabled={loading || exporting || rulesChanged || !visibleRows.length} onClick={() => exportExcel()}><Download size={16} />{exporting ? "Exportando..." : "Exportar vista"}</button>
                    </div>
                </header>
                {error && <div className="availability-alert error" role="alert">{error}</div>}
                {notice && <div className="availability-alert" role="status">{notice}</div>}
                {settingsOpen && <section className="availability-settings" aria-label="Configuración de perfiles">
                    <h2>Perfiles por cuenta</h2>
                    <div className="availability-rules">{rules.map((rule) => <div key={rule.platformId}>
                        <label>{platformNames.get(Number(rule.platformId)) || audit?.rules.find((item) => item.platformId === rule.platformId)?.platformName || `Plataforma #${rule.platformId}`}<input aria-label={`Perfiles de ${platformNames.get(Number(rule.platformId)) || rule.platformId}`} type="number" min="1" max="30" value={rule.expectedProfiles} onChange={(event) => setRules(rules.map((item) => item.platformId === rule.platformId ? { ...item, expectedProfiles: Math.min(30, Math.max(1, Number(event.target.value) || 1)) } : item))} /></label>
                        <button className="availability-icon danger" title="Quitar plataforma" aria-label="Quitar plataforma" onClick={() => setRules(rules.filter((item) => item.platformId !== rule.platformId))}><Trash2 size={16} /></button>
                    </div>)}</div>
                    <div className="availability-add-rule"><select aria-label="Agregar plataforma" value={draftPlatformId} onChange={(event) => setDraftPlatformId(event.target.value)}><option value="">Seleccionar plataforma</option>{activePlatforms.filter((platform) => !rules.some((rule) => rule.platformId === Number(platform.id))).map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}</select>
                        <input aria-label="Cantidad de perfiles" type="number" min="1" max="30" value={draftProfiles} onChange={(event) => setDraftProfiles(event.target.value)} />
                        <button className="availability-icon" title="Agregar plataforma" aria-label="Agregar plataforma" disabled={!draftPlatformId} onClick={() => { setRules([...rules, { platformId: Number(draftPlatformId), expectedProfiles: Math.min(30, Math.max(1, Number(draftProfiles) || 1)) }]); setDraftPlatformId(""); }}><Plus size={18} /></button>
                        <button className="availability-button primary" disabled={loading || !rules.length} onClick={applyRules}>Aplicar cambios</button>
                    </div>
                </section>}
                <section className="availability-filters" aria-label="Filtros de disponibilidad">
                    <label className="availability-search"><Search size={18} /><input aria-label="Buscar cuenta" value={search} onChange={(event) => changeFilter(setSearch, event.target.value)} placeholder="Correo, proveedor o ID de cuenta" /></label>
                    <select aria-label="Proveedor" value={providerFilter} onChange={(event) => changeFilter(setProviderFilter, event.target.value)}><option value="all">Todos los proveedores</option>{providerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
                    <select aria-label="Plataforma" value={platformFilter} onChange={(event) => changeFilter(setPlatformFilter, event.target.value)}><option value="all">Todas las plataformas</option>{platformOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
                    <select aria-label="Ordenar cuentas" value={sort} onChange={(event) => changeFilter(setSort, event.target.value)}><option value="free">Más perfiles libres</option><option value="expires">Vencimiento más cercano</option><option value="email">Correo A a Z</option></select>
                </section>
                <section className="availability-totals" aria-label="Resumen de cuentas activas">
                    <div><span>Cuentas activas</span><strong>{totals.accounts}</strong></div>
                    <div className="free"><span>Con cupos libres</span><strong>{totals.withFree}</strong></div>
                    <div className="free"><span>Perfiles libres</span><strong>{totals.free}</strong></div>
                    <div className="occupied"><span>Perfiles ocupados</span><strong>{totals.occupied}</strong></div>
                    <div className="review"><span>Cuentas por revisar</span><strong>{totals.review}</strong></div>
                </section>
                <div className="availability-result-bar"><div className="availability-tabs" role="tablist" aria-label="Estado de disponibilidad">{FILTERS.map((filter) => <button key={filter.value} role="tab" aria-selected={availability === filter.value} className={availability === filter.value ? "selected" : ""} onClick={() => changeFilter(setAvailability, filter.value)}>{filter.label}<span>{filter.value === "all" ? totals.accounts : filter.value === "with_free" ? totals.withFree : filter.value === "full" ? totals.full : totals.review}</span></button>)}</div></div>
                <div className="availability-results-meta"><span>{visibleRows.length} cuenta{visibleRows.length !== 1 ? "s" : ""}{providerFilter !== "all" ? ` · ${providerOptions.find(([id]) => id === providerFilter)?.[1] || ""}` : ""}</span>{excluded > 0 && <span>{excluded} excluidas por desactivación, caída o vencimiento</span>}</div>
                {loading ? <div className="availability-empty" role="status">Cargando disponibilidad...</div> : !pageRows.length ? <div className="availability-empty"><Users size={32} /><h2>{availability === "with_free" ? "No hay perfiles libres con estos filtros" : "No hay cuentas con estos filtros"}</h2><button className="availability-button" onClick={() => { setAvailability("all"); setProviderFilter("all"); setPlatformFilter("all"); setSearch(""); setPage(1); }}>Ver todas las activas</button></div> : <div className="availability-table-wrap"><table className="availability-table"><thead><tr><th>Cuenta / proveedor</th><th>Disponibilidad</th><th>Perfiles</th><th>Vencimiento proveedor</th><th><span className="availability-sr-only">Acciones</span></th></tr></thead><tbody>{pageRows.map((row) => {
                    const key = `${row.platformId}:${row.accountEmail}`;
                    const duplicates = new Set(row.duplicateProfiles || []);
                    const duplicateSummary = duplicateProfileSummary(row);
                    return <Fragment key={key}><tr>
                        <td data-label="Cuenta"><strong className="availability-email">{row.accountEmail}</strong><span className="availability-platform">{row.platformName}</span><small>{row.providerName}{row.providerAccountId ? ` · #${row.providerAccountId}` : ""}</small></td>
                        <td data-label="Disponibilidad"><strong className={`availability-count ${row.freeProfiles.length ? "free" : ""}`}>{row.freeProfiles.length} libre{row.freeProfiles.length !== 1 ? "s" : ""}</strong><small>{row.occupiedProfiles.length} ocupado{row.occupiedProfiles.length !== 1 ? "s" : ""}{row.reviewProfiles.length ? ` · ${row.reviewProfiles.length} por revisar` : ""}{duplicates.size ? ` · ${duplicates.size} duplicado${duplicates.size !== 1 ? "s" : ""}` : ""}</small>{duplicateSummary && <span className="availability-duplicate-summary"><AlertTriangle size={13} aria-hidden="true" />{duplicateSummary}</span>}{row.freeProfiles.length > 0 && <span className="availability-free-list">Perfil{row.freeProfiles.length !== 1 ? "es" : ""} {row.freeProfiles.join(", ")}</span>}</td>
                        <td data-label="Perfiles"><div className="availability-profile-list">{row.profiles.map((profile) => <ProfileBadge key={profile.number} profile={profile} duplicate={duplicates.has(profile.number)} />)}</div></td>
                        <td data-label="Vencimiento"><span>{row.providerExpiresAt ? formatDateOnlyDisplay(row.providerExpiresAt, { day: "2-digit", month: "2-digit", year: "numeric" }) : "Sin fecha de proveedor"}</span>{row.cardRenewalDate && <small>Tarjeta: {formatDateOnlyDisplay(row.cardRenewalDate, { day: "2-digit", month: "2-digit", year: "numeric" })}</small>}</td>
                        <td className="availability-row-actions"><button className="availability-icon" title="Copiar correo" aria-label={`Copiar correo ${row.accountEmail}`} onClick={() => copyEmail(row.accountEmail)}>{copied === row.accountEmail ? <Check size={16} /> : <Copy size={16} />}</button><button className="availability-icon" title={expanded === key ? "Cerrar detalle de perfiles" : "Ver detalle de perfiles"} aria-label={`Detalle de ${row.accountEmail}`} aria-expanded={expanded === key} onClick={() => setExpanded(expanded === key ? null : key)}><ChevronDown size={18} className={expanded === key ? "availability-rotated" : ""} /></button></td>
                    </tr>{expanded === key && <tr className="availability-detail"><td colSpan={5}><div className="availability-detail-heading"><h2>Perfiles de {row.accountEmail}</h2>{row.classification === "exception" && <span>{row.reviewReasons.join(" · ")}</span>}</div><div className="availability-detail-grid">{row.profiles.map((profile) => {
                        const duplicate = duplicates.has(profile.number);
                        return <article key={profile.number} className={`${profile.state}${duplicate ? " duplicate" : ""}`}><h3>Perfil {profile.number}<span>{duplicate ? PROFILE_LABELS.duplicate : PROFILE_LABELS[profile.state]}</span></h3>{duplicate ? <p>Hay varias asignaciones activas en este perfil. Verifica cuál cliente debe conservarlo antes de volver a ofrecerlo.</p> : profile.state === "free" ? <p>Disponible para vender.</p> : profile.state === "occupied" ? <p>{profile.buyerEmails.join(", ") || "Cliente asignado"}</p> : profile.state === "missing" ? <p>No tiene un registro cargado en inventario.</p> : profile.state === "replaced" ? <p>El cliente fue trasladado a otra cuenta. Pendiente de revisión para volver a usarlo.</p> : <p>Necesita revisión antes de venderse.</p>}{profile.accountIds.length > 0 && <small>Inventario: {profile.accountIds.map((id) => `#${id}`).join(", ")}</small>}{duplicate && profile.buyerEmails.length > 0 && <small>Clientes: {profile.buyerEmails.join(", ")}</small>}{profile.expiresAt && <small>Fecha del perfil: {formatDateOnlyDisplay(profile.expiresAt)}</small>}</article>;
                    })}</div></td></tr>}</Fragment>;
                })}</tbody></table></div>}
                <footer className="availability-pagination"><label>Por página <select aria-label="Cuentas por página" value={pageSize} onChange={(event) => changeFilter(setPageSize, Number(event.target.value))}>{[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label><span>{visibleRows.length ? `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, visibleRows.length)}` : "0"} de {visibleRows.length}</span><div><button className="availability-icon" title="Página anterior" aria-label="Página anterior" disabled={currentPage === 1 || loading} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>{currentPage} / {pageCount}</span><button className="availability-icon" title="Página siguiente" aria-label="Página siguiente" disabled={currentPage >= pageCount || loading} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></div></footer>
            </main>
        </div>
    </div>;
}
