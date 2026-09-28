import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { animate } from "animejs/animation";
import { createScope } from "animejs/scope";
import { stagger } from "animejs/utils";
import { useNavigate } from "react-router-dom";
import { ArrowRightLeft, CalendarClock, ChevronDown, Crown, Download, Factory, FileSpreadsheet, RefreshCcw, RotateCcw, Save, Search, ShieldCheck, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { apiFetch as baseApiFetch, apiLogout } from "../api/api.js";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import { COUNTRY_OPTIONS, findCountry } from "../data/countries.js";
import { loadXlsx } from "../utils/loadXlsx.js";
import "../styles/special-effects.css";
import "../styles/admin-providers.css";

const LOGO_URL = "/api/branding/logo";

const inputStyle = {
    appearance: "none",
    minHeight: 42,
    padding: "9px 12px",
    background: "var(--bg0)",
    color: "var(--text)",
    border: "1px solid var(--stroke)",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 500,
    outline: "none",
    width: "100%",
    fontFamily: "var(--font)",
};

const labelStyle = {
    display: "block",
    fontSize: 11,
    fontWeight: 800,
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: "0.45px",
    marginBottom: 6,
};

function localToday() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function addCalendarDays(value, days = 30) {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    date.setDate(date.getDate() + days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function shortDate(value) {
    if (!value) return "-";
    const parts = String(value).slice(0, 10).split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
}

function getDaysRemaining(value) {
    if (!value) return null;
    const today = new Date(`${localToday()}T00:00:00`);
    const expiry = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Math.ceil((expiry - today) / 86400000);
}

function providerHistoryLabel(account) {
    const ids = Array.isArray(account?.historyIds) && account.historyIds.length ? account.historyIds : [account?.id];
    return ids.filter(Boolean).map((id) => `#${id}`).join(" → ");
}

function matchesCardRenewalFilter(account, filter) {
    const days = getDaysRemaining(account.cardRenewalDate);
    if (filter === "missing") return days === null;
    if (filter === "expired") return days !== null && days < 0;
    if (filter === "next7") return days !== null && days >= 0 && days <= 7;
    if (filter === "next30") return days !== null && days >= 0 && days <= 30;
    if (filter === "active") return days !== null && days >= 0;
    return true;
}

function CountryPicker({ value, onChange }) {
    const wrapperRef = useRef(null);
    const inputRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const selected = findCountry(value);
    const normalizedQuery = query.trim().toLowerCase();
    const filteredCountries = useMemo(() => {
        if (!normalizedQuery) return COUNTRY_OPTIONS;
        return COUNTRY_OPTIONS.filter((country) => `${country.name} ${country.code} ${country.iso2}`.toLowerCase().includes(normalizedQuery));
    }, [normalizedQuery]);

    useEffect(() => {
        function closeOnOutsideClick(event) {
            if (!wrapperRef.current?.contains(event.target)) setOpen(false);
        }
        document.addEventListener("mousedown", closeOnOutsideClick);
        return () => document.removeEventListener("mousedown", closeOnOutsideClick);
    }, []);

    function openPicker() {
        setOpen(true);
        setQuery("");
        window.requestAnimationFrame(() => inputRef.current?.focus());
    }

    function selectCountry(country) {
        onChange(country.code);
        setQuery("");
        setOpen(false);
    }

    function handleKeyDown(event) {
        if (event.key === "Escape") {
            setOpen(false);
            return;
        }
        if (event.key === "Enter" && filteredCountries.length) {
            event.preventDefault();
            selectCountry(filteredCountries[0]);
        }
    }

    return (
        <div ref={wrapperRef} style={{ position: "relative" }}>
            <div style={{ position: "relative" }}>
                <Search size={15} aria-hidden style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }} />
                <input
                    ref={inputRef}
                    style={{ ...inputStyle, paddingLeft: 36, paddingRight: 38 }}
                    value={open ? query : (selected ? `${selected.flag} ${selected.name} (${selected.code})` : value || "")}
                    onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder="Buscar país o código ISO"
                    autoComplete="off"
                    aria-label="Buscar país de la cuenta"
                    role="combobox"
                    aria-expanded={open}
                    aria-controls="provider-country-options"
                />
                <button type="button" onClick={openPicker} aria-label="Abrir países" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 28, height: 28, display: "grid", placeItems: "center", border: 0, background: "transparent", color: "var(--muted)", cursor: "pointer" }}>
                    <ChevronDown size={16} aria-hidden />
                </button>
            </div>
            {open && (
                <div id="provider-country-options" role="listbox" style={{ position: "absolute", zIndex: 40, top: "calc(100% + 6px)", left: 0, right: 0, maxHeight: 280, overflowY: "auto", padding: 5, background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 10, boxShadow: "0 14px 30px rgba(0,0,0,.32)" }}>
                    {filteredCountries.length ? filteredCountries.map((country) => (
                        <button
                            key={country.code}
                            type="button"
                            role="option"
                            aria-selected={selected?.code === country.code}
                            onClick={() => selectCountry(country)}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", border: 0, borderRadius: 7, background: selected?.code === country.code ? "rgba(13,166,242,.14)" : "transparent", color: "var(--text)", fontFamily: "var(--font)", fontSize: 12, fontWeight: 700, textAlign: "left", cursor: "pointer" }}
                        >
                            <span style={{ width: 24, fontSize: 17, textAlign: "center" }}>{country.flag}</span>
                            <span style={{ flex: 1 }}>{country.name}</span>
                            <span style={{ color: "var(--muted)", fontSize: 10, fontFamily: "monospace" }}>{country.code}</span>
                        </button>
                    )) : <div style={{ padding: "14px 10px", color: "var(--muted)", fontSize: 12 }}>No se encontró ese país.</div>}
                </div>
            )}
        </div>
    );
}
async function apiFetch(path, options = {}) {
    const response = await baseApiFetch(path, options);
    if (!response.ok) throw new Error(response.data?.message || `HTTP ${response.status}`);
    return response.data;
}

const emptyProvider = {
    name: "",
    whatsappNumber: "",
    codePageUrl: "",
    codePageUsername: "",
    codePagePassword: "",
    notes: "",
};

function initialAccount() {
    return {
        providerId: "",
        platformId: "",
        accountEmail: "",
        purchaseDate: localToday(),
        cardRenewalDate: "",
        ipAddress: "",
        amount: "",
        currency: "COP",
    };
}

export default function AdminProviders() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();
    const [providers, setProviders] = useState([]);
    const [platforms, setPlatforms] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [providerForm, setProviderForm] = useState(emptyProvider);
    const [accountForm, setAccountForm] = useState(initialAccount);
    const [filterProviderId, setFilterProviderId] = useState("");
    const [cardRenewalFilter, setCardRenewalFilter] = useState("all");
    const [accountSearch, setAccountSearch] = useState("");
    const [accountOrder, setAccountOrder] = useState("desc");
    const [accountLimit, setAccountLimit] = useState("10");
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState("");
    const [savingProvider, setSavingProvider] = useState(false);
    const [savingAccount, setSavingAccount] = useState(false);
    const [renewingAccountId, setRenewingAccountId] = useState(null);
    const [deletingAccountId, setDeletingAccountId] = useState(null);
    const [editingProviderId, setEditingProviderId] = useState(null);
    const [editingAccountId, setEditingAccountId] = useState(null);
    const [replacementSourceAccount, setReplacementSourceAccount] = useState(null);
    const [replacementTargetId, setReplacementTargetId] = useState("");
    const [replacementReason, setReplacementReason] = useState("");
    const [replacingAccountId, setReplacingAccountId] = useState(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const topRankingRef = useRef(null);
    const renewalListRef = useRef(null);

    async function logout() {
        try { await apiLogout(); } catch { /* logout remains local even if the request fails */ }
        setUser(null);
        try {
            localStorage.removeItem("user");
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
        } catch { /* ignore storage errors */ }
        navigate("/", { replace: true });
    }

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const [providerRows, platformRows, accountRows] = await Promise.all([
                apiFetch("/admin/providers"),
                apiFetch("/admin/provider-platforms"),
                apiFetch("/admin/provider-accounts"),
            ]);
            setProviders(Array.isArray(providerRows) ? providerRows : []);
            setPlatforms(Array.isArray(platformRows) ? platformRows : []);
            setAccounts(Array.isArray(accountRows) ? accountRows : []);
        } catch (requestError) {
            setError(requestError?.message || "No se pudo cargar el módulo de proveedores.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!accountForm.providerId && providers.some((item) => Number(item.isActive) === 1)) {
            const firstActive = providers.find((item) => Number(item.isActive) === 1);
            setAccountForm((current) => ({ ...current, providerId: String(firstActive.id) }));
        }
    }, [providers, accountForm.providerId]);

    const filteredAccounts = useMemo(() => {
        const query = accountSearch.trim().toLowerCase();
        return accounts
            .filter((account) => !filterProviderId || String(account.providerId) === String(filterProviderId))
            .filter((account) => matchesCardRenewalFilter(account, cardRenewalFilter))
            .filter((account) => {
                if (!query) return true;
                return [account.id, account.accountEmail, account.providerName, account.platformName, account.ipAddress]
                    .some((value) => String(value || "").toLowerCase().includes(query));
            })
            .sort((left, right) => accountOrder === "asc"
                ? Number(left.id) - Number(right.id)
                : Number(right.id) - Number(left.id));
    }, [accounts, accountOrder, accountSearch, cardRenewalFilter, filterProviderId]);

    const visibleAccounts = useMemo(() => filteredAccounts.slice(0, Number(accountLimit)), [filteredAccounts, accountLimit]);
    const replacementCandidates = useMemo(() => {
        if (!replacementSourceAccount) return [];
        const sourceId = Number(replacementSourceAccount.id);
        const sourcePlatformId = Number(replacementSourceAccount.platformId);
        const sourceHistoryIds = Array.isArray(replacementSourceAccount.historyIds)
            ? replacementSourceAccount.historyIds.map(Number)
            : [sourceId];
        return accounts
            .filter((account) => Number(account.id) !== sourceId)
            .filter((account) => account.status === "active")
            .filter((account) => Number(account.platformId) === sourcePlatformId)
            .filter((account) => !sourceHistoryIds.includes(Number(account.id)))
            .sort((left, right) => Number(left.id) - Number(right.id));
    }, [accounts, replacementSourceAccount]);

    async function exportAccounts(scope = "filtered") {
        const rows = [...(scope === "all" ? accounts : filteredAccounts)].sort((left, right) => accountOrder === "asc"
            ? Number(left.id) - Number(right.id)
            : Number(right.id) - Number(left.id));
        if (!rows.length) {
            setError(scope === "all" ? "No hay cuentas para exportar." : "No hay cuentas que coincidan con los filtros.");
            return;
        }

        setExporting(scope);
        setError("");
        try {
            const XLSX = await loadXlsx();
            const exportRows = rows.map((account) => {
                const days = getDaysRemaining(account.expiresAt);
                const country = findCountry(account.ipAddress);
                return {
                    ID: account.id,
                    Histórico: providerHistoryLabel(account),
                    Proveedor: account.providerName || "",
                    Plataforma: account.platformName || "",
                    Cuenta: account.accountEmail || "",
                    "Fecha de compra": shortDate(account.purchaseDate),
                    Vencimiento: shortDate(account.expiresAt),
                    "Renovación tarjeta": shortDate(account.cardRenewalDate),
                    "Días restantes": days === null ? "" : days,
                    País: country ? country.name : (account.ipAddress || ""),
                    Valor: Number(account.amount || 0),
                    Moneda: account.currency || "",
                    Estado: account.status === "active" ? "Activo" : account.status === "replaced" ? "Reemplazada" : "Inactivo",
                };
            });
            const worksheet = XLSX.utils.json_to_sheet(exportRows);
            worksheet["!cols"] = [
                { wch: 8 }, { wch: 22 }, { wch: 24 }, { wch: 28 }, { wch: 34 }, { wch: 16 },
                { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 10 }, { wch: 12 },
            ];
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Cuentas");

            const selectedProvider = providers.find((provider) => String(provider.id) === String(filterProviderId));
            const context = scope === "all"
                ? "todas"
                : (selectedProvider?.name || "filtradas");
            const safeContext = context.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "cuentas";
            XLSX.writeFile(workbook, `Cuentas_proveedores_${safeContext}_${localToday()}.xlsx`);
            showMessage(`${rows.length} cuenta(s) exportada(s) correctamente.`);
        } catch (exportError) {
            setError(exportError?.message || "No se pudo generar el archivo de exportación.");
        } finally {
            setExporting("");
        }
    }

    function showMessage(message) {
        setSuccess(message);
        window.setTimeout(() => setSuccess((current) => current === message ? "" : current), 4000);
    }

    async function saveProvider(event) {
        event.preventDefault();
        if (!providerForm.name.trim()) return;
        setSavingProvider(true);
        setError("");
        try {
            const payload = { ...providerForm };
            if (editingProviderId && !payload.codePagePassword.trim()) delete payload.codePagePassword;
            await apiFetch(editingProviderId ? `/admin/providers/${editingProviderId}` : "/admin/providers", {
                method: editingProviderId ? "PATCH" : "POST",
                body: JSON.stringify(payload),
            });
            const wasEditing = Boolean(editingProviderId);
            setEditingProviderId(null);
            setProviderForm(emptyProvider);
            showMessage(wasEditing ? "Proveedor actualizado correctamente." : "Proveedor creado correctamente.");
            await load();
        } catch (requestError) {
            setError(requestError?.message || "No se pudo crear el proveedor.");
        } finally {
            setSavingProvider(false);
        }
    }

    function editProvider(provider) {
        setEditingProviderId(provider.id);
        setProviderForm({
            name: provider.name || "",
            whatsappNumber: provider.whatsappNumber || "",
            codePageUrl: provider.codePageUrl || "",
            codePageUsername: provider.codePageUsername || "",
            codePagePassword: "",
            notes: provider.notes || "",
        });
        window.requestAnimationFrame(() => document.getElementById("provider-form")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }

    function cancelEditProvider() {
        setEditingProviderId(null);
        setProviderForm(emptyProvider);
    }

    async function saveAccount(event) {
        event.preventDefault();
        setSavingAccount(true);
        setError("");
        try {
            await apiFetch(editingAccountId ? `/admin/provider-accounts/${editingAccountId}` : "/admin/provider-accounts", {
                method: editingAccountId ? "PATCH" : "POST",
                body: JSON.stringify({
                    ...accountForm,
                    amount: accountForm.amount === "" ? 0 : Number(accountForm.amount),
                }),
            });
            const wasEditing = Boolean(editingAccountId);
            setEditingAccountId(null);
            setAccountForm((current) => ({ ...initialAccount(), providerId: current.providerId }));
            showMessage(wasEditing ? "Cuenta de proveedor actualizada." : "Cuenta de proveedor creada. El vencimiento se calculó a 30 días calendario.");
            await load();
        } catch (requestError) {
            setError(requestError?.message || "No se pudo crear la cuenta del proveedor.");
        } finally {
            setSavingAccount(false);
        }
    }

    function editAccount(account) {
        setEditingAccountId(account.id);
        setAccountForm({
            providerId: String(account.providerId),
            platformId: String(account.platformId),
            accountEmail: account.accountEmail || "",
            purchaseDate: String(account.purchaseDate || "").slice(0, 10),
            cardRenewalDate: String(account.cardRenewalDate || "").slice(0, 10),
            ipAddress: account.ipAddress || "",
            amount: account.amount ?? "",
            currency: account.currency || "COP",
        });
        window.requestAnimationFrame(() => document.getElementById("provider-account-form")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }

    function cancelEditAccount() {
        setEditingAccountId(null);
        setAccountForm((current) => ({ ...initialAccount(), providerId: current.providerId }));
    }

    async function toggleProvider(provider) {
        setError("");
        try {
            await apiFetch(`/admin/providers/${provider.id}`, {
                method: "PATCH",
                body: JSON.stringify({ isActive: Number(provider.isActive) !== 1 }),
            });
            await load();
        } catch (requestError) {
            setError(requestError?.message || "No se pudo actualizar el proveedor.");
        }
    }

    async function toggleAccount(account) {
        setError("");
        try {
            await apiFetch(`/admin/provider-accounts/${account.id}`, {
                method: "PATCH",
                body: JSON.stringify({ status: account.status === "active" ? "inactive" : "active" }),
            });
            await load();
        } catch (requestError) {
            setError(requestError?.message || "No se pudo actualizar la cuenta.");
        }
    }

    async function deleteAccount(account) {
        const confirmed = window.confirm(`¿Eliminar definitivamente la cuenta #${account.id} (${account.accountEmail})? Esta acción no se puede deshacer.`);
        if (!confirmed) return;

        setDeletingAccountId(account.id);
        setError("");
        try {
            await apiFetch(`/admin/provider-accounts/${account.id}`, { method: "DELETE" });
            if (editingAccountId === account.id) cancelEditAccount();
            showMessage(`Cuenta #${account.id} eliminada correctamente.`);
            await load();
        } catch (requestError) {
            setError(requestError?.message || "No se pudo eliminar la cuenta del proveedor.");
        } finally {
            setDeletingAccountId(null);
        }
    }

    function openReplacement(account) {
        setReplacementSourceAccount(account);
        setReplacementTargetId("");
        setReplacementReason("Cuenta con credenciales inválidas");
        setError("");
    }

    function closeReplacement() {
        setReplacementSourceAccount(null);
        setReplacementTargetId("");
        setReplacementReason("");
    }

    async function replaceAccount() {
        if (!replacementSourceAccount || !replacementTargetId) {
            setError("Selecciona la cuenta que entrará como reemplazo.");
            return;
        }
        setReplacingAccountId(replacementSourceAccount.id);
        setError("");
        try {
            const result = await apiFetch(`/admin/provider-accounts/${replacementSourceAccount.id}/replace`, {
                method: "POST",
                body: JSON.stringify({
                    replacementAccountId: Number(replacementTargetId),
                    reason: replacementReason.trim() || null,
                }),
            });
            showMessage(result?.message || "Reemplazo registrado correctamente.");
            closeReplacement();
            await load();
        } catch (requestError) {
            setError(requestError?.message || "No se pudo registrar el reemplazo de la cuenta.");
        } finally {
            setReplacingAccountId(null);
        }
    }

    async function renewAccount(account) {
        setRenewingAccountId(account.id);
        setError("");
        try {
            await apiFetch(`/admin/provider-accounts/${account.id}`, {
                method: "PATCH",
                body: JSON.stringify({ renew: true, status: "active" }),
            });
            showMessage(`Cuenta ${account.accountEmail} renovada conservando los días pendientes y sumando 30 días.`);
            await load();
        } catch (requestError) {
            setError(requestError?.message || "No se pudo renovar la cuenta.");
        } finally {
            setRenewingAccountId(null);
        }
    }

    const activeProviders = providers.filter((item) => Number(item.isActive) === 1);
    const topProviders = useMemo(() => [...providers]
        .filter((provider) => Number(provider.accountCount || 0) > 0)
        .sort((left, right) => Number(right.activeAccountCount || 0) - Number(left.activeAccountCount || 0)
            || Number(right.accountCount || 0) - Number(left.accountCount || 0)
            || String(left.name || "").localeCompare(String(right.name || "")))
        .slice(0, 5), [providers]);
    const upcomingRenewals = useMemo(() => accounts
        .map((account) => ({ ...account, daysRemaining: getDaysRemaining(account.expiresAt) }))
        .filter((account) => account.status === "active" && account.daysRemaining !== null && account.daysRemaining <= 7)
        .sort((left, right) => left.daysRemaining - right.daysRemaining), [accounts]);
    const topProviderMax = Math.max(1, ...topProviders.map((provider) => Number(provider.activeAccountCount || 0)));

    useEffect(() => {
        const root = topRankingRef.current;
        if (!root || !topProviders.length) return undefined;
        const scope = createScope({
            root,
            mediaQueries: { reduceMotion: "(prefers-reduced-motion: reduce)" },
        }).add(({ matches }) => {
            if (matches.reduceMotion) return;
            animate("[data-provider-rank]", {
                opacity: [0, 1],
                y: [12, 0],
                delay: stagger(65),
                duration: 380,
                ease: "out(4)",
            });
            animate("[data-provider-bar]", {
                scaleX: [0, 1],
                delay: stagger(65, { start: 145 }),
                duration: 620,
                ease: "outExpo",
            });
            root.querySelectorAll("[data-provider-active-count]").forEach((element, index) => {
                const target = Number(element.dataset.value || 0);
                const counter = { value: 0 };
                animate(counter, {
                    value: [0, target],
                    delay: 145 + index * 65,
                    duration: 620,
                    ease: "outExpo",
                    onRender: () => {
                        element.textContent = `${Math.round(counter.value)} activas`;
                    },
                });
            });
        });
        return () => scope.revert();
    }, [topProviders, topProviderMax]);

    useEffect(() => {
        const root = renewalListRef.current;
        if (!root || !upcomingRenewals.length) return undefined;
        const scope = createScope({
            root,
            mediaQueries: { reduceMotion: "(prefers-reduced-motion: reduce)" },
        }).add(({ matches }) => {
            if (matches.reduceMotion) return;
            animate("[data-renewal-row]", {
                opacity: [0, 1],
                x: [14, 0],
                delay: stagger(55),
                duration: 360,
                ease: "out(3)",
            });
        });
        return () => scope.revert();
    }, [upcomingRenewals]);

    return (
        <div className="page-shell admin-providers-page">
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
                    setLogoOk={() => {}}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main admin-providers-main" style={{ padding: "20px 24px 48px", maxWidth: 1320, margin: "0 auto" }}>
                    <header className="admin-providers-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, flexWrap: "wrap", marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--stroke)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ width: 52, height: 52, borderRadius: 14, display: "grid", placeItems: "center", color: "#22d3ee", background: "rgba(34,211,238,.12)", border: "1px solid rgba(34,211,238,.35)" }}>
                                <Factory size={26} aria-hidden />
                            </div>
                            <div>
                                <h1 style={{ margin: 0, color: "var(--text)", fontSize: 23, fontWeight: 900 }}>Proveedores</h1>
                                <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>Catálogo de proveedores y cuentas asociadas.</p>
                            </div>
                        </div>
                        <button className="btn-ghost" type="button" onClick={load} disabled={loading} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 38 }}>
                            <RefreshCcw size={15} style={{ animation: loading ? "spin .8s linear infinite" : "none" }} aria-hidden />
                            Actualizar
                        </button>
                    </header>

                    {error && <div style={{ marginBottom: 16, padding: "12px 15px", borderRadius: 10, color: "#fca5a5", background: "rgba(239,68,68,.11)", border: "1px solid rgba(239,68,68,.35)", fontSize: 13, fontWeight: 700 }}>{error}</div>}
                    {success && <div style={{ marginBottom: 16, padding: "12px 15px", borderRadius: 10, color: "#86efac", background: "rgba(16,185,129,.11)", border: "1px solid rgba(16,185,129,.35)", fontSize: 13, fontWeight: 700 }}>{success}</div>}

                    <section className="admin-providers-summary-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(360px, .85fr)", gap: 18, marginBottom: 18, alignItems: "stretch" }}>
                        <div className="admin-providers-panel" style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: 22, boxShadow: "0 8px 32px rgba(0,0,0,.14)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                                <Crown size={19} color="#fbbf24" aria-hidden />
                                <div>
                                    <h2 style={{ margin: 0, color: "var(--text)", fontSize: 16, fontWeight: 850 }}>Top 5 proveedores</h2>
                                    <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 12 }}>Ranking por cuentas activas de Netflix.</p>
                                </div>
                            </div>
                            {topProviders.length ? (
                                <div ref={topRankingRef} style={{ display: "grid", gap: 10 }}>
                                    {topProviders.map((provider, index) => {
                                        const activeCount = Number(provider.activeAccountCount || 0);
                                        const totalCount = Number(provider.accountCount || 0);
                                        return <div key={provider.id} data-provider-rank className="admin-providers-ranking-row" style={{ display: "grid", gridTemplateColumns: "32px minmax(0, 1fr) auto", gap: 11, alignItems: "center", padding: "10px 0", borderBottom: index === topProviders.length - 1 ? 0 : "1px solid var(--stroke)" }}>
                                            <span style={{ width: 28, height: 28, display: "grid", placeItems: "center", borderRadius: 9, color: index === 0 ? "#111827" : "var(--text)", background: index === 0 ? "#fbbf24" : "rgba(139,92,246,.18)", border: "1px solid rgba(139,92,246,.32)", fontWeight: 900, fontSize: 12 }}>{index + 1}</span>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: "var(--text)", fontSize: 13, fontWeight: 800 }}>
                                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{provider.name}</span>
                                                    <span data-provider-active-count data-value={activeCount} style={{ color: "#86efac", whiteSpace: "nowrap" }}>{activeCount} activas</span>
                                                </div>
                                                <div style={{ height: 5, marginTop: 7, overflow: "hidden", borderRadius: 99, background: "rgba(148,163,184,.16)" }}>
                                                    <div data-provider-bar style={{ transformOrigin: "left center", width: `${activeCount ? Math.max(8, (activeCount / topProviderMax) * 100) : 3}%`, height: "100%", borderRadius: 99, background: index === 0 ? "#fbbf24" : "#8b5cf6" }} />
                                                </div>
                                            </div>
                                            <span style={{ color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap" }}>{totalCount} total</span>
                                        </div>;
                                    })}
                                </div>
                            ) : <div style={{ padding: "18px 0 6px", color: "var(--muted)", fontSize: 13 }}>Aún no hay proveedores para mostrar.</div>}
                        </div>

                        <div className="admin-providers-panel admin-providers-renewal-panel" style={{ background: "var(--card)", border: "1px solid rgba(245,158,11,.38)", borderRadius: 16, padding: 22, boxShadow: "0 8px 32px rgba(0,0,0,.14)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                                <CalendarClock size={19} color="#fbbf24" aria-hidden />
                                <div>
                                    <h2 style={{ margin: 0, color: "var(--text)", fontSize: 16, fontWeight: 850 }}>Recordatorio de renovación</h2>
                                    <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 12 }}>Cuentas activas que vencen en 7 días o menos.</p>
                                </div>
                            </div>
                            {upcomingRenewals.length ? (
                                <div ref={renewalListRef} style={{ display: "grid", gap: 9, maxHeight: 330, overflowY: "auto", paddingRight: 7, scrollbarWidth: "thin", scrollbarColor: "#fbbf24 rgba(148,163,184,.14)" }}>
                                    {upcomingRenewals.map((account) => {
                                        const expired = account.daysRemaining < 0;
                                        return <div key={account.id} data-renewal-row className="admin-providers-renewal-row" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--stroke)" }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)", fontSize: 12, fontWeight: 800 }}>{account.accountEmail}</div>
                                                <div style={{ marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--muted)", fontSize: 11 }}>{account.providerName} · {account.platformName} · vence {shortDate(account.expiresAt)}</div>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <span style={{ color: expired ? "#fca5a5" : "#fbbf24", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" }}>{expired ? `Vencida hace ${Math.abs(account.daysRemaining)} d` : account.daysRemaining === 0 ? "Vence hoy" : `${account.daysRemaining} d`}</span>
                                                <button className="btn-ghost" type="button" onClick={() => renewAccount(account)} disabled={renewingAccountId === account.id} title="Renovar por 30 días" style={{ height: 32, padding: "0 9px", display: "inline-flex", alignItems: "center", gap: 5, color: "#fbbf24", borderColor: "rgba(245,158,11,.35)", fontSize: 11 }}>
                                                    <RotateCcw size={13} aria-hidden /> {renewingAccountId === account.id ? "..." : "Renovar"}
                                                </button>
                                            </div>
                                        </div>;
                                    })}
                                </div>
                            ) : <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "18px 0 6px", color: "#86efac", fontSize: 13, fontWeight: 700 }}><ShieldCheck size={17} aria-hidden /> No hay cuentas próximas a vencer.</div>}
                        </div>
                    </section>

                    <section className="admin-providers-management-grid" style={{ display: "grid", gridTemplateColumns: "minmax(280px, .82fr) minmax(480px, 1.5fr)", gap: 18, alignItems: "start", marginBottom: 18 }}>
                        <div className="admin-providers-panel" style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: 22, boxShadow: "0 8px 32px rgba(0,0,0,.16)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                                <ShieldCheck size={18} color="#22d3ee" aria-hidden />
                                <div>
                                    <h2 style={{ margin: 0, color: "var(--text)", fontSize: 16, fontWeight: 850 }}>{editingProviderId ? "Editar proveedor" : "Nuevo proveedor"}</h2>
                                    <p style={{ margin: "3px 0 0", color: "var(--muted)", fontSize: 12 }}>Datos de contacto y acceso a su página de códigos.</p>
                                </div>
                            </div>
                            <form id="provider-form" onSubmit={saveProvider} style={{ display: "grid", gap: 13 }}>
                                <div>
                                    <label style={labelStyle}>Nombre del proveedor *</label>
                                    <input style={inputStyle} value={providerForm.name} onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })} placeholder="Ej. StoreTools.co" required />
                                </div>
                                <div className="admin-providers-form-grid admin-providers-form-grid--contact" style={{ display: "grid", gridTemplateColumns: "minmax(0, .8fr) minmax(0, 1.2fr)", gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Número de WhatsApp</label>
                                        <input style={inputStyle} type="tel" value={providerForm.whatsappNumber} onChange={(event) => setProviderForm({ ...providerForm, whatsappNumber: event.target.value })} placeholder="+57 300 000 0000" maxLength={40} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Página de códigos *</label>
                                        <input style={inputStyle} type="url" value={providerForm.codePageUrl} onChange={(event) => setProviderForm({ ...providerForm, codePageUrl: event.target.value })} placeholder="https://proveedor.com/consultar" required />
                                    </div>
                                </div>
                                <div className="admin-providers-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Usuario de la página *</label>
                                        <input style={inputStyle} value={providerForm.codePageUsername} onChange={(event) => setProviderForm({ ...providerForm, codePageUsername: event.target.value })} placeholder="Usuario de acceso" required />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Contraseña de la página {editingProviderId ? "" : "*"}</label>
                                        <input style={inputStyle} type="password" value={providerForm.codePagePassword} onChange={(event) => setProviderForm({ ...providerForm, codePagePassword: event.target.value })} placeholder={editingProviderId ? "Vacío = conservar actual" : "Contraseña de acceso"} required={!editingProviderId} />
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>Notas</label>
                                    <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={providerForm.notes} onChange={(event) => setProviderForm({ ...providerForm, notes: event.target.value })} placeholder="Observaciones internas" />
                                </div>
                                <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                                    <button className="btn" type="submit" disabled={savingProvider || !providerForm.name.trim()} style={{ minHeight: 42, flex: "1 1 220px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, fontWeight: 800 }}>
                                        <Save size={16} aria-hidden /> {savingProvider ? "Guardando..." : editingProviderId ? "Actualizar proveedor" : "Guardar proveedor"}
                                    </button>
                                    {editingProviderId && <button className="btn-ghost" type="button" onClick={cancelEditProvider} style={{ minHeight: 42, padding: "0 18px" }}>Cancelar edición</button>}
                                </div>
                            </form>
                        </div>

                        <div className="admin-providers-panel" style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: 22, boxShadow: "0 8px 32px rgba(0,0,0,.16)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                                <Factory size={18} color="#a78bfa" aria-hidden />
                                <div>
                                    <h2 style={{ margin: 0, color: "var(--text)", fontSize: 16, fontWeight: 850 }}>Nueva cuenta de proveedor</h2>
                                    <p style={{ margin: "3px 0 0", color: "var(--muted)", fontSize: 12 }}>La plataforma se lee únicamente entre las plataformas activas.</p>
                                </div>
                            </div>
                            <form id="provider-account-form" onSubmit={saveAccount} style={{ display: "grid", gap: 13 }}>
                                <div className="admin-providers-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Proveedor *</label>
                                        <select style={inputStyle} value={accountForm.providerId} onChange={(event) => setAccountForm({ ...accountForm, providerId: event.target.value })} required>
                                            <option value="">Selecciona un proveedor</option>
                                            {activeProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Cuenta / plataforma activa *</label>
                                        <select style={inputStyle} value={accountForm.platformId} onChange={(event) => setAccountForm({ ...accountForm, platformId: event.target.value })} required>
                                            <option value="">Selecciona una plataforma</option>
                                            {platforms.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <div>
                                        <label style={labelStyle}>Correo de la cuenta *</label>
                                        <input style={inputStyle} type="email" value={accountForm.accountEmail} onChange={(event) => setAccountForm({ ...accountForm, accountEmail: event.target.value })} placeholder="cuenta@dominio.com" required />
                                    </div>
                                </div>
                                <div className="admin-providers-form-grid admin-providers-form-grid--triple" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Fecha de compra *</label>
                                        <input style={inputStyle} type="date" value={accountForm.purchaseDate} onChange={(event) => setAccountForm({ ...accountForm, purchaseDate: event.target.value })} required />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Vence automáticamente</label>
                                        <input style={{ ...inputStyle, color: "#86efac", cursor: "not-allowed" }} value={shortDate(addCalendarDays(accountForm.purchaseDate))} readOnly aria-label="Fecha de vencimiento calculada" />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>País de la cuenta</label>
                                        <CountryPicker value={accountForm.ipAddress} onChange={(countryCode) => setAccountForm({ ...accountForm, ipAddress: countryCode })} />
                                    </div>
                                </div>
                                <div className="admin-providers-form-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Fecha renovación tarjeta</label>
                                        <input style={inputStyle} type="date" value={accountForm.cardRenewalDate} onChange={(event) => setAccountForm({ ...accountForm, cardRenewalDate: event.target.value })} />
                                        <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 11 }}>Opcional. Fecha en que debe renovarse la tarjeta del proveedor.</div>
                                    </div>
                                </div>
                                <div className="admin-providers-form-grid admin-providers-form-grid--amount" style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Valor de compra</label>
                                        <input style={inputStyle} type="number" min="0" step="0.01" value={accountForm.amount} onChange={(event) => setAccountForm({ ...accountForm, amount: event.target.value })} placeholder="0.00" />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Moneda *</label>
                                        <select style={inputStyle} value={accountForm.currency} onChange={(event) => setAccountForm({ ...accountForm, currency: event.target.value })}>
                                            <option value="COP">COP</option>
                                            <option value="USD">USD</option>
                                        </select>
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                                    <button className="btn" type="submit" disabled={savingAccount || !activeProviders.length || !platforms.length} style={{ minHeight: 42, flex: "1 1 220px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, fontWeight: 800 }}>
                                        <Save size={16} aria-hidden /> {savingAccount ? "Guardando..." : editingAccountId ? "Actualizar cuenta" : "Guardar cuenta"}
                                    </button>
                                    {editingAccountId && <button className="btn-ghost" type="button" onClick={cancelEditAccount} style={{ minHeight: 42, padding: "0 18px" }}>Cancelar edición</button>}
                                </div>
                            </form>
                        </div>
                    </section>

                    <section className="admin-providers-panel admin-providers-table-panel" style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: 22, marginBottom: 18, boxShadow: "0 8px 32px rgba(0,0,0,.14)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                            <div>
                                <h2 style={{ margin: 0, color: "var(--text)", fontSize: 16, fontWeight: 850 }}>Proveedores registrados</h2>
                                <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 12 }}>{providers.length} proveedor(es) · {activeProviders.length} activo(s)</p>
                            </div>
                        </div>
                        <div className="admin-providers-table-scroll" style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                                <thead><tr>{["Proveedor", "WhatsApp", "Página de códigos", "Cuentas Netflix", "Estado", "Acción"].map((title) => <th key={title} style={{ textAlign: "left", padding: "10px 12px", color: "var(--muted)", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid var(--stroke)" }}>{title}</th>)}</tr></thead>
                                <tbody>
                                    {providers.map((provider) => {
                                        const active = Number(provider.isActive) === 1;
                                        return <tr key={provider.id}>
                                            <td style={{ padding: "13px 12px", color: "var(--text)", fontWeight: 800 }}>{provider.name}</td>
                                            <td style={{ padding: "13px 12px", color: "var(--muted)", fontSize: 13, whiteSpace: "nowrap" }}>{provider.whatsappNumber || "-"}</td>
                                            <td style={{ padding: "13px 12px", maxWidth: 260 }}><a href={provider.codePageUrl || "#"} target="_blank" rel="noreferrer" style={{ color: "#67e8f9", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{provider.codePageUrl || "-"}</a></td>
                                            <td style={{ padding: "13px 12px", color: "var(--text)", fontWeight: 700 }}>{provider.activeAccountCount || 0} activas <span style={{ color: "var(--muted)", fontWeight: 500 }}>({provider.accountCount || 0} total)</span></td>
                                            <td style={{ padding: "13px 12px" }}><span style={{ color: active ? "#86efac" : "#fca5a5", fontWeight: 800, fontSize: 13 }}>{active ? "Activo" : "Inactivo"}</span></td>
                                            <td style={{ padding: "13px 12px" }}><div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><button className="btn-ghost" type="button" onClick={() => editProvider(provider)} style={{ height: 34, padding: "0 10px" }}>Editar</button><button className="btn-ghost" type="button" onClick={() => toggleProvider(provider)} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 10px" }}>{active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />} {active ? "Desactivar" : "Activar"}</button></div></td>
                                        </tr>;
                                    })}
                                    {!providers.length && <tr><td colSpan="6" style={{ padding: 22, textAlign: "center", color: "var(--muted)" }}>Aún no hay proveedores registrados.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="admin-providers-panel admin-providers-table-panel" style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: 22, boxShadow: "0 8px 32px rgba(0,0,0,.14)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                            <div>
                                <h2 style={{ margin: 0, color: "var(--text)", fontSize: 16, fontWeight: 850 }}>Cuentas de proveedor</h2>
                                <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 12 }}>Organiza, busca, exporta y controla las cuentas por proveedor.</p>
                            </div>
                            <div className="admin-providers-export-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button className="btn-ghost" type="button" onClick={() => exportAccounts("filtered")} disabled={Boolean(exporting)} title="Exportar la vista actual con sus filtros" style={{ minHeight: 38, display: "inline-flex", alignItems: "center", gap: 7 }}>
                                    <Download size={15} aria-hidden /> {exporting === "filtered" ? "Generando..." : "Exportar vista"}
                                </button>
                                <button className="btn" type="button" onClick={() => exportAccounts("all")} disabled={Boolean(exporting)} title="Exportar todas las cuentas de proveedores" style={{ minHeight: 38, display: "inline-flex", alignItems: "center", gap: 7 }}>
                                    <FileSpreadsheet size={15} aria-hidden /> {exporting === "all" ? "Generando..." : "Exportar todas"}
                                </button>
                            </div>
                        </div>
                        {replacementSourceAccount && <div style={{ marginBottom: 14, padding: 16, borderRadius: 12, background: "rgba(13,166,242,.09)", border: "1px solid rgba(34,211,238,.35)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                                <div>
                                    <div style={{ color: "#67e8f9", fontSize: 11, fontWeight: 900, textTransform: "uppercase" }}>Nuevo reemplazo</div>
                                    <h3 style={{ margin: "4px 0 0", color: "var(--text)", fontSize: 15 }}>Reemplazar cuenta #{replacementSourceAccount.id}</h3>
                                    <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 12 }}>La cuenta anterior quedará como reemplazada y se conservará la cadena histórica.</p>
                                </div>
                                <button className="btn-ghost" type="button" onClick={closeReplacement} style={{ height: 32, padding: "0 10px" }}>Cancelar</button>
                            </div>
                            <div className="admin-providers-replacement-form" style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1.2fr) minmax(220px, 1fr) auto", gap: 10, alignItems: "end", marginTop: 13 }}>
                                <div>
                                    <label style={labelStyle}>Cuenta nueva *</label>
                                    <select style={inputStyle} value={replacementTargetId} onChange={(event) => setReplacementTargetId(event.target.value)} disabled={replacingAccountId === replacementSourceAccount.id}>
                                        <option value="">Selecciona una cuenta activa</option>
                                        {replacementCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>#{candidate.id} · {candidate.providerName} · {candidate.accountEmail}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Motivo</label>
                                    <input style={inputStyle} value={replacementReason} onChange={(event) => setReplacementReason(event.target.value)} placeholder="Ej. credenciales inválidas" maxLength={255} />
                                </div>
                                <button className="btn" type="button" onClick={replaceAccount} disabled={replacingAccountId === replacementSourceAccount.id || !replacementCandidates.length} style={{ minHeight: 42, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, whiteSpace: "nowrap" }}>
                                    <ArrowRightLeft size={15} aria-hidden /> {replacingAccountId === replacementSourceAccount.id ? "Guardando..." : "Confirmar reemplazo"}
                                </button>
                            </div>
                            {!replacementCandidates.length && <div style={{ marginTop: 9, color: "#fbbf24", fontSize: 12, fontWeight: 700 }}>No hay otra cuenta activa de la misma plataforma disponible para reemplazarla.</div>}
                        </div>}
                        <div className="admin-providers-account-filters" style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.5fr) minmax(180px, 1fr) minmax(160px, .8fr) 130px minmax(190px, 1fr)", gap: 10, marginBottom: 10 }}>
                            <input style={{ ...inputStyle, minHeight: 38 }} value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder="Buscar cuenta, proveedor o plataforma" aria-label="Buscar cuenta de proveedor" />
                            <select style={{ ...inputStyle, minHeight: 38 }} value={filterProviderId} onChange={(event) => setFilterProviderId(event.target.value)} aria-label="Filtrar cuentas por proveedor">
                                <option value="">Todos los proveedores</option>
                                {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                            </select>
                            <select style={{ ...inputStyle, minHeight: 38 }} value={accountOrder} onChange={(event) => setAccountOrder(event.target.value)} aria-label="Orden de cuentas">
                                <option value="desc">ID descendente</option>
                                <option value="asc">ID ascendente</option>
                            </select>
                            <select style={{ ...inputStyle, minHeight: 38 }} value={accountLimit} onChange={(event) => setAccountLimit(event.target.value)} aria-label="Cantidad de cuentas visibles">
                                {[5, 10, 15, 20].map((amount) => <option key={amount} value={amount}>Últimos {amount}</option>)}
                            </select>
                            <select style={{ ...inputStyle, minHeight: 38 }} value={cardRenewalFilter} onChange={(event) => setCardRenewalFilter(event.target.value)} aria-label="Filtrar vencimientos de renovación de tarjeta">
                                <option value="all">Renovación: todas</option>
                                <option value="expired">Renovación: vencidas</option>
                                <option value="next7">Renovación: próximos 7 días</option>
                                <option value="next30">Renovación: próximos 30 días</option>
                                <option value="active">Renovación: vigentes</option>
                                <option value="missing">Renovación: sin fecha</option>
                            </select>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12, color: "var(--muted)", fontSize: 11 }}>
                            <span>Orden actual: <strong style={{ color: "#67e8f9" }}>{accountOrder === "desc" ? "más recientes primero" : "más antiguas primero"}</strong></span>
                            <span>Mostrando <strong style={{ color: "var(--text)" }}>{Math.min(visibleAccounts.length, Number(accountLimit))}</strong> de <strong style={{ color: "var(--text)" }}>{filteredAccounts.length}</strong> resultado(s)</span>
                        </div>
                        <div className="admin-providers-table-scroll" style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1400 }}>
                                <thead><tr>{["ID", "Histórico", "Proveedor / plataforma", "Cuenta", "Compra", "Vencimiento", "Renovación tarjeta", "País", "Valor", "Estado", "Acción"].map((title) => <th key={title} style={{ textAlign: "left", padding: "10px 11px", color: "var(--muted)", fontSize: 10, textTransform: "uppercase", borderBottom: "1px solid var(--stroke)", whiteSpace: "nowrap" }}>{title}</th>)}</tr></thead>
                                <tbody>
                                    {visibleAccounts.map((account) => {
                                        const active = account.status === "active";
                                        const replaced = account.status === "replaced";
                                        const historyLabel = providerHistoryLabel(account);
                                        const days = getDaysRemaining(account.expiresAt);
                                        const country = findCountry(account.ipAddress);
                                        return <tr key={account.id}>
                                            <td style={{ padding: "13px 11px", color: "#67e8f9", fontWeight: 900, fontSize: 12 }}>#{account.id}</td>
                                            <td title={historyLabel} style={{ padding: "13px 11px", minWidth: 135, maxWidth: 190 }}><div style={{ color: account.historyTotal > 1 ? "#67e8f9" : "var(--muted)", fontWeight: 800, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{historyLabel}</div><div style={{ color: "var(--muted)", fontSize: 10, marginTop: 3 }}>{account.historyTotal > 1 ? `Paso ${account.historySequence} de ${account.historyTotal}` : "Original"}</div></td>
                                            <td style={{ padding: "13px 11px" }}><div style={{ color: "var(--text)", fontWeight: 800 }}>{account.providerName}</div><div style={{ color: "#a78bfa", fontSize: 12, marginTop: 3 }}>{account.platformName}</div></td>
                                            <td style={{ padding: "13px 11px", color: "var(--text)", fontSize: 13 }}>{account.accountEmail}</td>
                                            <td style={{ padding: "13px 11px", color: "var(--muted)", whiteSpace: "nowrap", fontSize: 12 }}>{shortDate(account.purchaseDate)}</td>
                                            <td style={{ padding: "13px 11px", whiteSpace: "nowrap" }}><div style={{ color: days !== null && days < 0 ? "#fca5a5" : "#86efac", fontWeight: 800, fontSize: 12 }}>{shortDate(account.expiresAt)}</div><div style={{ color: "var(--muted)", fontSize: 11, marginTop: 3 }}>{days === null ? "-" : days < 0 ? `Vencida hace ${Math.abs(days)} día(s)` : `${days} día(s)`}</div></td>
                                            <td style={{ padding: "13px 11px", color: account.cardRenewalDate ? "#fbbf24" : "var(--muted)", fontWeight: account.cardRenewalDate ? 800 : 500, whiteSpace: "nowrap", fontSize: 12 }}>{shortDate(account.cardRenewalDate)}</td>
                                            <td style={{ padding: "13px 11px", color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap" }}>{country ? `${country.flag} ${country.code}` : account.ipAddress || "-"}</td>
                                            <td style={{ padding: "13px 11px", color: "var(--text)", fontSize: 12, whiteSpace: "nowrap" }}>{Number(account.amount || 0).toFixed(2)} {account.currency}</td>
                                            <td style={{ padding: "13px 11px", color: replaced ? "#fbbf24" : active ? "#86efac" : "#fca5a5", fontSize: 12, fontWeight: 800 }}>{replaced ? "Reemplazada" : active ? "Activo" : "Inactivo"}</td>
                                            <td style={{ padding: "13px 11px", minWidth: 360, whiteSpace: "nowrap", verticalAlign: "top" }}><div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "nowrap" }}><button className="btn-ghost" type="button" onClick={() => editAccount(account)} style={{ height: 32, padding: "0 9px", fontSize: 12, flex: "0 0 auto" }}>Editar</button>{!replaced && <button className="btn-ghost" type="button" onClick={() => openReplacement(account)} disabled={!active} title="Registrar reemplazo y conservar el historial" style={{ height: 32, padding: "0 9px", display: "inline-flex", alignItems: "center", gap: 5, color: "#67e8f9", borderColor: "rgba(34,211,238,.35)", fontSize: 12, flex: "0 0 auto" }}><ArrowRightLeft size={14} aria-hidden />Reemplazar</button>}{!replaced && <button className="btn-ghost" type="button" onClick={() => toggleAccount(account)} style={{ height: 32, padding: "0 9px", fontSize: 12, flex: "0 0 auto" }}>{active ? "Desactivar" : "Activar"}</button>}<button className="btn-ghost" type="button" onClick={() => deleteAccount(account)} disabled={deletingAccountId === account.id || account.historyTotal > 1} title={account.historyTotal > 1 ? "Las cuentas con historial no se pueden eliminar" : "Eliminar cuenta duplicada"} aria-label={`Eliminar cuenta ${account.id}`} style={{ height: 32, padding: "0 9px", display: "inline-flex", alignItems: "center", gap: 5, color: "#fca5a5", borderColor: "rgba(239,68,68,.38)", fontSize: 12, flex: "0 0 auto" }}><Trash2 size={14} aria-hidden />{deletingAccountId === account.id ? "..." : "Eliminar"}</button></div></td>
                                        </tr>;
                                    })}
                                    {!visibleAccounts.length && <tr><td colSpan="11" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>No hay cuentas de proveedor para este filtro.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
}
