import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Download, Filter, Plus, RefreshCcw, Search, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { apiGet } from "../api/api.js";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import useAppLogout from "../hooks/useAppLogout.js";
import { loadXlsx } from "../utils/loadXlsx.js";
import { formatBogotaDateTime } from "../utils/datetime.js";
import "../styles/admin-inventory-audit.css";

const STORAGE_KEY = "adminInventoryAuditRules";

function isActivePlatform(platform) {
    const value = platform?.is_active ?? platform?.isActive ?? platform?.active;
    return value === undefined || value === null || Number(value) === 1 || value === true;
}

function platformId(platform) {
    const value = Number(platform?.id ?? platform?.platform_id ?? platform?.platformId);
    return Number.isInteger(value) && value > 0 ? value : 0;
}

function platformName(platform) {
    return String(platform?.name || platform?.platform_name || platform?.platformName || `Plataforma #${platformId(platform) || "?"}`);
}

function rulePlatformName(rule, audit, platformsById) {
    const fromAudit = (audit?.rules || []).find((item) => Number(item.platformId) === Number(rule.platformId));
    return fromAudit?.platformName || platformName(platformsById.get(Number(rule.platformId)) || { id: rule.platformId });
}

function defaultRules(platforms) {
    const netflix = platforms.find((platform) => platformName(platform).toLowerCase().includes("netflix"));
    const disney = platforms.find((platform) => {
        const name = platformName(platform).toLowerCase();
        return name.includes("disney") && name.includes("premium");
    });
    const rules = [];
    if (netflix) rules.push({ platformId: platformId(netflix), expectedProfiles: 5 });
    if (disney && !rules.some((rule) => rule.platformId === platformId(disney))) rules.push({ platformId: platformId(disney), expectedProfiles: 7 });
    return rules;
}

function readStoredRules(platforms) {
    const activeIds = new Set(platforms.filter(isActivePlatform).map(platformId));
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (Array.isArray(stored) && stored.length) {
            return stored
                .map((rule) => ({ platformId: Number(rule.platformId), expectedProfiles: Number(rule.expectedProfiles) }))
                .filter((rule) => activeIds.has(rule.platformId) && Number.isInteger(rule.expectedProfiles) && rule.expectedProfiles > 0);
        }
    } catch {
        // Fall back to the common Netflix and Disney references.
    }
    return defaultRules(platforms);
}

function formatList(values) {
    return values?.length ? values.join(", ") : "-";
}

function formatDate(value) {
    return formatBogotaDateTime(value, { year: "2-digit", month: "2-digit", day: "2-digit" });
}

function statusLabel(classification) {
    if (classification === "complete") return "Completa";
    if (classification === "excluded_down") return "Excluida: cuenta caida";
    return "Revisar";
}

function rowToSheet(row) {
    return {
        Plataforma: row.platformName,
        "Correo de cuenta": row.accountEmail,
        "Perfiles esperados": row.expectedProfiles,
        "Perfiles cubiertos": formatList(row.coveredProfiles),
        "Perfiles sin registro": formatList(row.missingProfiles),
        "Perfiles por revisar": formatList(row.uncoveredProfiles),
        "Registros sin perfil": formatList(row.unprofiledRecords),
        "Perfiles duplicados": formatList(row.duplicateProfiles),
        "Perfiles fuera de referencia": formatList(row.invalidProfiles),
        Estado: statusLabel(row.classification),
        "Cuenta maestra caida": row.masterMarkedDown ? "Si" : "No",
        Nota: row.masterNote || "",
        "IDs de cuenta": formatList(row.accountIds),
        Estados: formatList(row.statuses),
    };
}

export default function AdminInventoryAudit() {
    const navigate = useNavigate();
    const logout = useAppLogout();
    const { user } = useAuth();
    const [platforms, setPlatforms] = useState([]);
    const [rules, setRules] = useState([]);
    const [audit, setAudit] = useState(null);
    const [draftPlatformId, setDraftPlatformId] = useState("");
    const [draftProfiles, setDraftProfiles] = useState(5);
    const [classification, setClassification] = useState("all");
    const [platformFilter, setPlatformFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);
    const [platformLoading, setPlatformLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const activePlatforms = useMemo(
        () => platforms.filter(isActivePlatform).sort((a, b) => platformName(a).localeCompare(platformName(b), "es")),
        [platforms]
    );
    const allPlatformMap = useMemo(() => new Map(platforms.map((platform) => [platformId(platform), platform])), [platforms]);

    const loadPlatforms = useCallback(async () => {
        setPlatformLoading(true);
        const response = await apiGet("/admin/platforms");
        if (!response.ok) {
            setError(response.data?.message || "No se pudieron cargar las plataformas.");
            setPlatformLoading(false);
            return;
        }
        const list = Array.isArray(response.data) ? response.data : [];
        setPlatforms(list);
        setRules((current) => {
            if (!current.length) return readStoredRules(list);
            const activeIds = new Set(list.filter(isActivePlatform).map(platformId));
            return current.filter((rule) => activeIds.has(Number(rule.platformId)));
        });
        setPlatformLoading(false);
    }, []);

    useEffect(() => {
        loadPlatforms().catch(() => {
            setError("No se pudieron cargar las plataformas.");
            setPlatformLoading(false);
        });
    }, [loadPlatforms]);

    useEffect(() => {
        if (!draftPlatformId && activePlatforms[0]) setDraftPlatformId(String(platformId(activePlatforms[0])));
    }, [activePlatforms, draftPlatformId]);

    useEffect(() => {
        if (rules.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
    }, [rules]);

    const runAudit = useCallback(async () => {
        if (!rules.length) {
            setError("Agrega al menos una referencia de perfiles.");
            return;
        }
        setLoading(true);
        setError("");
        setNotice("");
        const params = new URLSearchParams({ rules: JSON.stringify(rules) });
        const response = await apiGet(`/admin/inventory-audit?${params.toString()}`, { timeoutMs: 60000 });
        if (!response.ok) {
            setError(response.data?.message || "No se pudo ejecutar la auditoria.");
            setLoading(false);
            return;
        }
        setAudit(response.data);
        setNotice(`Auditoria actualizada: ${response.data.summary?.totalAccounts || 0} cuentas revisadas.`);
        setLoading(false);
    }, [rules]);

    useEffect(() => {
        if (rules.length && activePlatforms.length) {
            runAudit().catch(() => {
                setError("No se pudo ejecutar la auditoria.");
                setLoading(false);
            });
        }
    }, [activePlatforms.length, runAudit, rules.length]);

    function addRule() {
        const platformId = Number(draftPlatformId);
        const expectedProfiles = Math.min(30, Math.max(1, Number(draftProfiles) || 1));
        if (!platformId || rules.some((rule) => rule.platformId === platformId)) {
            setError("Selecciona una plataforma que aun no este en la auditoria.");
            return;
        }
        setRules((current) => [...current, { platformId, expectedProfiles }]);
        setError("");
    }

    function updateRule(platformId, expectedProfiles) {
        setRules((current) => current.map((rule) => rule.platformId === platformId
            ? { ...rule, expectedProfiles: Math.min(30, Math.max(1, Number(expectedProfiles) || 1)) }
            : rule));
    }

    function removeRule(platformId) {
        setRules((current) => current.filter((rule) => rule.platformId !== platformId));
        setAudit(null);
    }

    const visibleRows = useMemo(() => {
        const query = search.trim().toLowerCase();
        return (audit?.rows || []).filter((row) => {
            if (classification !== "all" && row.classification !== classification) return false;
            if (platformFilter !== "all" && String(row.platformId) !== platformFilter) return false;
            if (!query) return true;
            return [row.platformName, row.accountEmail, row.masterNote, ...(row.accountIds || []).map(String)].join(" ").toLowerCase().includes(query);
        });
    }, [audit, classification, platformFilter, search]);

    async function exportExcel() {
        if (!audit) return;
        setExporting(true);
        setError("");
        try {
            const XLSX = await loadXlsx();
            const workbook = XLSX.utils.book_new();
            const summaryRows = [
                { Indicador: "Generado", Valor: formatDate(audit.generatedAt) },
                { Indicador: "Cuentas revisadas", Valor: audit.summary.totalAccounts },
                { Indicador: "Completas", Valor: audit.summary.complete },
                { Indicador: "Excepciones", Valor: audit.summary.exceptions },
                { Indicador: "Excluidas por cuenta maestra caida", Valor: audit.summary.excludedDown },
                { Indicador: "Con perfiles faltantes", Valor: audit.summary.incomplete },
                { Indicador: "Con perfiles duplicados", Valor: audit.summary.duplicated },
                { Indicador: "Con perfiles fuera de referencia", Valor: audit.summary.invalidProfiles },
            ];
            const references = audit.rules.map((rule) => ({ Plataforma: rule.platformName, Referencia: rule.expectedProfiles }));
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "Resumen");
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(references), "Referencias");
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet((audit.rows || []).map(rowToSheet)), "Auditoria");
            if (visibleRows.length !== (audit.rows || []).length) {
                XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(visibleRows.map(rowToSheet)), "Vista filtrada");
            }
            XLSX.writeFile(workbook, `Auditoria_Inventario_${new Date().toISOString().slice(0, 10)}.xlsx`);
            setNotice("Excel exportado correctamente.");
        } catch (exportError) {
            setError(exportError?.message || "No se pudo exportar el Excel.");
        } finally {
            setExporting(false);
        }
    }

    const summary = audit?.summary || {};

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden><div className="bg-grid" /></div>
            <div className="page-inner">
                <AdminSidebar user={user} uploadingLogo={false} onOpenLogoPicker={() => navigate("/admin")} onLogout={logout} />
                <main className="main admin-audit-main">
                    <header className="admin-audit-header">
                        <div className="admin-audit-title">
                            <span className="admin-audit-icon"><ClipboardCheck size={26} aria-hidden /></span>
                            <div><p className="admin-audit-kicker">Control de inventario</p><h1>Auditoria de perfiles</h1><p>Compara las cuentas cargadas con la cantidad de perfiles que debe tener cada plataforma.</p></div>
                        </div>
                        <div className="admin-audit-actions">
                            <button className="btn-ghost" type="button" onClick={() => navigate("/admin/inventory")}><span aria-hidden>←</span> Inventario</button>
                            <button className="btn-ghost" type="button" onClick={() => loadPlatforms()} disabled={platformLoading}><RefreshCcw size={16} aria-hidden /> Actualizar plataformas</button>
                            <button className="btn-primary" type="button" onClick={exportExcel} disabled={!audit || exporting}><Download size={16} aria-hidden /> {exporting ? "Exportando..." : "Exportar Excel"}</button>
                        </div>
                    </header>

                    {error ? <div className="audit-alert audit-alert-error" role="alert">{error}</div> : null}
                    {notice ? <div className="audit-alert audit-alert-success" role="status">{notice}</div> : null}

                    <section className="audit-panel audit-reference-panel" aria-labelledby="audit-references-title">
                        <div className="audit-section-heading"><div><p className="admin-audit-kicker">Reglas de auditoria</p><h2 id="audit-references-title">Perfiles esperados por cuenta</h2><p className="audit-heading-copy">Define cuantos perfiles deben quedar cubiertos en cada cuenta de una plataforma.</p></div><span className="audit-muted">Solo se pueden auditar plataformas activas.</span></div>
                        <div className="audit-rule-list">
                            {rules.map((rule) => <div className="audit-rule-row" key={rule.platformId}>
                                <div className="audit-rule-platform"><strong>{rulePlatformName(rule, audit, allPlatformMap)}</strong><span>Cuenta completa: {rule.expectedProfiles} perfiles</span></div>
                                <label>Perfiles esperados <input type="number" min="1" max="30" value={rule.expectedProfiles} onChange={(event) => updateRule(rule.platformId, event.target.value)} /></label>
                                <button className="icon-button danger" type="button" title="Quitar referencia" aria-label="Quitar referencia" onClick={() => removeRule(rule.platformId)}><Trash2 size={17} aria-hidden /></button>
                            </div>)}
                            {!rules.length ? <p className="audit-empty">No hay referencias. Agrega una plataforma y su cantidad de perfiles.</p> : null}
                        </div>
                        <div className="audit-add-row">
                            <select value={draftPlatformId} onChange={(event) => setDraftPlatformId(event.target.value)} disabled={platformLoading}><option value="">Seleccionar plataforma activa</option>{activePlatforms.filter((platform) => !rules.some((rule) => rule.platformId === platformId(platform))).map((platform) => <option key={platformId(platform)} value={platformId(platform)}>{platformName(platform)}</option>)}</select>
                            <label className="profile-input">Perfiles <input type="number" min="1" max="30" value={draftProfiles} onChange={(event) => setDraftProfiles(event.target.value)} /></label>
                            <button className="btn-secondary" type="button" onClick={addRule}><Plus size={16} aria-hidden /> Agregar referencia</button>
                            <button className="btn-primary" type="button" onClick={runAudit} disabled={loading || !rules.length}><ClipboardCheck size={16} aria-hidden /> {loading ? "Auditando..." : "Ejecutar auditoria"}</button>
                        </div>
                    </section>

                    <section className="audit-kpi-grid" aria-label="Resumen de auditoria">
                        <article><span>Total revisadas</span><strong>{summary.totalAccounts || 0}</strong></article><article className="good"><span>Completas</span><strong>{summary.complete || 0}</strong></article><article className="warn"><span>Excepciones</span><strong>{summary.exceptions || 0}</strong></article><article className="muted"><span>Excluidas por caida</span><strong>{summary.excludedDown || 0}</strong></article>
                    </section>

                    <section className="audit-panel audit-results">
                        <div className="audit-section-heading"><div><p className="admin-audit-kicker">Resultado</p><h2>Estado de cada cuenta</h2><p className="audit-heading-copy">Un perfil queda cubierto si esta disponible para vender o pertenece a una suscripcion vigente. Los registros sin perfil no cubren una pantalla.</p></div><span className="audit-result-count">{visibleRows.length} de {audit?.rows?.length || 0}</span></div>
                        <div className="audit-filters">
                            <label className="audit-search"><Search size={17} aria-hidden /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar plataforma, correo o ID" /></label>
                            <label><Filter size={16} aria-hidden /><select value={classification} onChange={(event) => setClassification(event.target.value)}><option value="all">Todos los estados</option><option value="exception">Solo excepciones</option><option value="complete">Completas</option><option value="excluded_down">Excluidas por caida</option></select></label>
                            <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}><option value="all">Todas las plataformas</option>{(audit?.rules || []).map((rule) => <option key={rule.platformId} value={rule.platformId}>{rule.platformName}</option>)}</select>
                        </div>
                        <div className="audit-table-wrap"><table className="audit-table"><thead><tr><th>Cuenta</th><th>Meta</th><th>Cobertura</th><th>Que falta o revisar</th><th>Alertas</th><th>Diagnostico</th></tr></thead><tbody>{visibleRows.map((row) => {
                            const coveredCount = row.coveredProfiles?.length || 0;
                            const progress = Math.min(100, Math.round((coveredCount / Math.max(1, row.expectedProfiles)) * 100));
                            return <tr key={`${row.platformId}-${row.accountEmail}`}><td><strong>{row.platformName}</strong><small>{row.accountEmail}</small>{row.accountIds?.length ? <small>Registros: #{formatList(row.accountIds)}</small> : null}</td><td><strong>{row.expectedProfiles} perfiles</strong><small>por cuenta</small></td><td><div className="audit-coverage"><strong>{coveredCount} de {row.expectedProfiles}</strong><span>perfiles cubiertos</span><div className="audit-progress" aria-label={`${coveredCount} de ${row.expectedProfiles} perfiles cubiertos`}><i style={{ width: `${progress}%` }} /></div>{coveredCount ? <small>{formatList(row.coveredProfiles)}</small> : <small className="text-warn">Ninguno cubierto</small>}</div></td><td><div className="audit-issues">{row.missingProfiles?.length ? <span><b>Sin registro:</b> {formatList(row.missingProfiles)}</span> : null}{row.uncoveredProfiles?.length ? <span><b>Sin vigencia:</b> {formatList(row.uncoveredProfiles)}</span> : null}{row.unprofiledRecords?.length ? <span><b>Sin perfil:</b> #{formatList(row.unprofiledRecords)}</span> : null}{!row.missingProfiles?.length && !row.uncoveredProfiles?.length && !row.unprofiledRecords?.length ? <span className="text-good">Todo cubierto</span> : null}</div></td><td><div className="audit-issues">{row.duplicateProfiles?.length ? <span className="text-error"><b>Duplicados:</b> {formatList(row.duplicateProfiles)}</span> : null}{row.invalidProfiles?.length ? <span className="text-warn"><b>Fuera de meta:</b> {formatList(row.invalidProfiles)}</span> : null}{!row.duplicateProfiles?.length && !row.invalidProfiles?.length ? <span>-</span> : null}</div></td><td><span className={`audit-status ${row.classification}`}>{statusLabel(row.classification)}</span>{row.reviewReasons?.length ? <small>{row.reviewReasons.join("; ")}</small> : null}{row.masterNote ? <small>{row.masterNote}</small> : null}</td></tr>;
                        })}</tbody></table>{!visibleRows.length ? <div className="audit-empty">No hay cuentas que coincidan con la auditoria o los filtros.</div> : null}</div>
                    </section>
                </main>
            </div>
        </div>
    );
}
