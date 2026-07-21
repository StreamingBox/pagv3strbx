import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    AlertTriangle,
    CheckCircle2,
    DatabaseZap,
    RefreshCcw,
    Save,
    Search,
    Trash2,
    XCircle,
} from "lucide-react";

import { apiDelete, apiFetch, apiLogout, apiPatch, apiPost } from "../api/api.js";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import "../styles/dashboard.css";

const inputStyle = {
    width: "100%",
    minHeight: 48,
    boxSizing: "border-box",
    border: "1px solid var(--stroke)",
    borderRadius: 8,
    outline: "none",
    background: "var(--input-bg)",
    color: "var(--text)",
    padding: "0 14px",
    font: "inherit",
};

const emptySummary = {
    total: 0,
    inactive: 0,
    active: 0,
    topPlatforms: [],
};

function statusLabel(status) {
    return status === "inactive" ? "Inactiva / caida" : "Activa";
}

function platformIsActive(platform) {
    const value = platform?.is_active ?? platform?.isActive ?? platform?.active;
    return value === undefined || value === null || Number(value) === 1 || value === true;
}

function formatDate(value) {
    if (!value) return "-";
    return new Date(value).toLocaleString("es-CO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

export default function AdminMasterAccounts() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();
    const [items, setItems] = useState([]);
    const [summary, setSummary] = useState(emptySummary);
    const [matching, setMatching] = useState(0);
    const [platforms, setPlatforms] = useState([]);
    const [searchDraft, setSearchDraft] = useState("");
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("all");
    const [platformFilter, setPlatformFilter] = useState("all");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [form, setForm] = useState({
        platformId: "",
        accountEmail: "",
        status: "inactive",
        notes: "",
    });

    const activePlatforms = useMemo(
        () => platforms
            .filter(platformIsActive)
            .slice()
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es")),
        [platforms]
    );

    const topPlatformLabel = summary.topPlatforms?.[0]?.name || "Sin datos";

    async function logout() {
        await apiLogout().catch(() => {});
        setUser(null);
        navigate("/", { replace: true });
    }

    const loadPlatforms = useCallback(async () => {
        const response = await apiFetch("/admin/platforms", { method: "GET" });
        if (response.ok) {
            setPlatforms(Array.isArray(response.data) ? response.data : []);
        }
    }, []);

    const loadItems = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams({ status, limit: "10" });
            if (q.trim()) params.set("q", q.trim());
            if (platformFilter !== "all") params.set("platformId", platformFilter);
            const response = await apiFetch(`/admin/master-accounts?${params.toString()}`, { method: "GET" });
            if (response.ok) {
                setItems(response.data?.items || []);
                setSummary(response.data?.summary || emptySummary);
                setMatching(Number(response.data?.matching || 0));
            } else {
                setError(response.data?.message || "No se pudieron cargar las cuentas maestras.");
            }
        } finally {
            setLoading(false);
        }
    }, [platformFilter, q, status]);

    useEffect(() => {
        void loadPlatforms();
    }, [loadPlatforms]);

    useEffect(() => {
        void loadItems();
    }, [loadItems]);

    async function saveAccount(event) {
        event.preventDefault();
        setError("");
        setSuccess("");
        setSaving(true);
        let response;
        try {
            response = await apiPost("/admin/master-accounts", {
                platformId: form.platformId,
                accountEmail: form.accountEmail,
                status: form.status,
                notes: form.notes,
            });
        } finally {
            setSaving(false);
        }
        if (!response.ok) {
            setError(response.data?.message || "No se pudo guardar la cuenta maestra.");
            return;
        }
        setSuccess("Cuenta maestra guardada.");
        setForm((current) => ({ ...current, accountEmail: "", notes: "" }));
        await loadItems();
    }

    async function updateStatus(item, nextStatus) {
        setError("");
        setSuccess("");
        const response = await apiPatch(`/admin/master-accounts/${item.id}`, { status: nextStatus });
        if (!response.ok) {
            setError(response.data?.message || "No se pudo actualizar la cuenta.");
            return;
        }
        setSuccess(`Cuenta marcada como ${statusLabel(nextStatus).toLowerCase()}.`);
        await loadItems();
    }

    async function removeItem(item) {
        setError("");
        setSuccess("");
        const response = await apiDelete(`/admin/master-accounts/${item.id}`);
        if (!response.ok) {
            setError(response.data?.message || "No se pudo eliminar la cuenta.");
            return;
        }
        setSuccess("Cuenta maestra eliminada.");
        await loadItems();
    }

    function submitSearch(event) {
        event.preventDefault();
        setQ(searchDraft.trim());
    }

    function clearFilters() {
        setSearchDraft("");
        setQ("");
        setStatus("all");
        setPlatformFilter("all");
    }

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden><div className="bg-grid" /></div>
            <div className="page-inner">
                <AdminSidebar
                    user={user}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main master-accounts-page">
                    <header className="master-hero">
                        <div className="master-hero-title">
                            <span className="master-hero-icon"><DatabaseZap size={26} aria-hidden /></span>
                            <div>
                                <p className="master-kicker">Inventario critico</p>
                                <h1>Cuentas maestras</h1>
                                <p>Marca cuentas caidas para que soporte intente reemplazo automatico cuando haya stock.</p>
                            </div>
                        </div>
                        <div className="master-hero-count">
                            <strong>{summary.inactive}</strong>
                            <span>inactivas</span>
                        </div>
                    </header>

                    <section className="master-stats-grid" aria-label="Resumen de cuentas maestras">
                        <article className="master-stat-card">
                            <AlertTriangle size={18} aria-hidden />
                            <span>Inactivas</span>
                            <strong>{summary.inactive}</strong>
                        </article>
                        <article className="master-stat-card">
                            <CheckCircle2 size={18} aria-hidden />
                            <span>Activas</span>
                            <strong>{summary.active}</strong>
                        </article>
                        <article className="master-stat-card">
                            <DatabaseZap size={18} aria-hidden />
                            <span>Total</span>
                            <strong>{summary.total}</strong>
                        </article>
                        <article className="master-stat-card master-stat-wide">
                            <XCircle size={18} aria-hidden />
                            <span>Plataforma con mas alertas</span>
                            <strong>{topPlatformLabel}</strong>
                        </article>
                    </section>

                    {error ? <div className="error master-message">{error}</div> : null}
                    {success ? <div className="master-success master-message">{success}</div> : null}

                    <section className="master-panel master-form-panel">
                        <div className="master-section-heading">
                            <div>
                                <p className="master-kicker">Nueva regla</p>
                                <h2>Agregar cuenta maestra</h2>
                            </div>
                            <span>{activePlatforms.length} plataformas activas</span>
                        </div>

                        <form onSubmit={saveAccount} className="master-form-grid">
                            <label>
                                <span>Plataforma</span>
                                <select
                                    style={inputStyle}
                                    value={form.platformId}
                                    onChange={(event) => setForm((current) => ({ ...current, platformId: event.target.value }))}
                                    required
                                >
                                    <option value="">Seleccionar plataforma</option>
                                    {activePlatforms.map((platform) => (
                                        <option value={platform.id} key={platform.id}>{platform.name}</option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                <span>Correo de cuenta</span>
                                <input
                                    style={inputStyle}
                                    value={form.accountEmail}
                                    onChange={(event) => setForm((current) => ({ ...current, accountEmail: event.target.value }))}
                                    placeholder="cuenta@dominio.com"
                                    required
                                />
                            </label>
                            <label>
                                <span>Estado</span>
                                <select
                                    style={inputStyle}
                                    value={form.status}
                                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                                >
                                    <option value="inactive">Inactiva / caida</option>
                                    <option value="active">Activa</option>
                                </select>
                            </label>
                            <label>
                                <span>Nota interna</span>
                                <input
                                    style={inputStyle}
                                    value={form.notes}
                                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                                    placeholder="Motivo o detalle interno"
                                />
                            </label>
                            <button type="submit" disabled={saving} className="master-primary-button">
                                <Save size={17} aria-hidden />
                                {saving ? "Guardando..." : "Guardar"}
                            </button>
                        </form>
                    </section>

                    <section className="master-panel master-search-panel">
                        <form onSubmit={submitSearch} className="master-search-row">
                            <div className="master-search-box">
                                <Search size={18} aria-hidden />
                                <input
                                    value={searchDraft}
                                    onChange={(event) => setSearchDraft(event.target.value)}
                                    placeholder="Buscar por cuenta, plataforma o nota"
                                />
                            </div>
                            <select style={inputStyle} value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
                                <option value="all">Todas las plataformas activas</option>
                                {activePlatforms.map((platform) => (
                                    <option value={platform.id} key={platform.id}>{platform.name}</option>
                                ))}
                            </select>
                            <select style={inputStyle} value={status} onChange={(event) => setStatus(event.target.value)}>
                                <option value="all">Todos los estados</option>
                                <option value="inactive">Solo inactivas</option>
                                <option value="active">Solo activas</option>
                            </select>
                            <button type="submit" className="master-primary-button">
                                <Search size={16} aria-hidden />
                                Buscar
                            </button>
                            <button type="button" className="btn-ghost" onClick={clearFilters}>Limpiar</button>
                            <button type="button" className="btn-ghost" onClick={() => void loadItems()}>
                                <RefreshCcw size={16} aria-hidden /> Refrescar
                            </button>
                        </form>

                        <div className="master-results-info">
                            <strong>Top 10</strong>
                            <span>{matching} coincidencias con los filtros actuales</span>
                        </div>

                        {summary.topPlatforms?.length ? (
                            <div className="master-top-platforms" aria-label="Top plataformas inactivas">
                                {summary.topPlatforms.map((platform, index) => (
                                    <span key={platform.id}>
                                        #{index + 1} {platform.name} <strong>{platform.total}</strong>
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </section>

                    <section className="master-table-card">
                        <div className="master-table-head">
                            <div>
                                <p className="master-kicker">Listado</p>
                                <h2>Top 10 mas recientes</h2>
                            </div>
                            {loading ? <span>Cargando...</span> : <span>{items.length} visibles</span>}
                        </div>
                        <div className="master-table-wrap">
                            <table className="master-table">
                                <thead>
                                    <tr>
                                        <th>Plataforma</th>
                                        <th>Cuenta</th>
                                        <th>Estado</th>
                                        <th>Nota</th>
                                        <th>Actualizada</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={6} className="master-empty"><div className="spinner" /></td></tr>
                                    ) : items.length ? items.map((item) => (
                                        <tr key={item.id}>
                                            <td data-label="Plataforma"><strong>{item.platformName}</strong></td>
                                            <td data-label="Cuenta">{item.accountEmail}</td>
                                            <td data-label="Estado">
                                                <span className={`master-status master-status-${item.status}`}>
                                                    {statusLabel(item.status)}
                                                </span>
                                            </td>
                                            <td data-label="Nota" className="master-note">{item.notes || "-"}</td>
                                            <td data-label="Actualizada">{formatDate(item.updatedAt)}</td>
                                            <td data-label="Acciones">
                                                <div className="master-actions">
                                                    <button
                                                        type="button"
                                                        className="btn-ghost"
                                                        onClick={() => updateStatus(item, item.status === "inactive" ? "active" : "inactive")}
                                                    >
                                                        {item.status === "inactive" ? "Marcar activa" : "Marcar caida"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn-ghost master-danger-button"
                                                        onClick={() => removeItem(item)}
                                                    >
                                                        <Trash2 size={15} aria-hidden /> Eliminar
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan={6} className="master-empty">No hay cuentas maestras con esos filtros.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
}
