import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Factory, RefreshCcw, Save, ShieldCheck, ToggleLeft, ToggleRight } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { apiFetch as baseApiFetch, apiLogout } from "../api/api.js";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";

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

async function apiFetch(path, options = {}) {
    const response = await baseApiFetch(path, options);
    if (!response.ok) throw new Error(response.data?.message || `HTTP ${response.status}`);
    return response.data;
}

const emptyProvider = { name: "", contactEmail: "", notes: "" };

function initialAccount() {
    return {
        providerId: "",
        platformId: "",
        accountEmail: "",
        accountPassword: "",
        purchaseDate: localToday(),
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
    const [visiblePasswords, setVisiblePasswords] = useState({});
    const [loading, setLoading] = useState(true);
    const [savingProvider, setSavingProvider] = useState(false);
    const [savingAccount, setSavingAccount] = useState(false);
    const [editingAccountId, setEditingAccountId] = useState(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

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
        if (!filterProviderId) return accounts;
        return accounts.filter((account) => String(account.providerId) === String(filterProviderId));
    }, [accounts, filterProviderId]);

    function showMessage(message) {
        setSuccess(message);
        window.setTimeout(() => setSuccess((current) => current === message ? "" : current), 4000);
    }

    async function createProvider(event) {
        event.preventDefault();
        if (!providerForm.name.trim()) return;
        setSavingProvider(true);
        setError("");
        try {
            await apiFetch("/admin/providers", {
                method: "POST",
                body: JSON.stringify(providerForm),
            });
            setProviderForm(emptyProvider);
            showMessage("Proveedor creado correctamente.");
            await load();
        } catch (requestError) {
            setError(requestError?.message || "No se pudo crear el proveedor.");
        } finally {
            setSavingProvider(false);
        }
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
            accountPassword: account.accountPassword || "",
            purchaseDate: String(account.purchaseDate || "").slice(0, 10),
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

    const activeProviders = providers.filter((item) => Number(item.isActive) === 1);

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
                    logoSrc={LOGO_URL}
                    logoOk={true}
                    setLogoOk={() => {}}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main" style={{ padding: "20px 24px 48px", maxWidth: 1320, margin: "0 auto" }}>
                    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, flexWrap: "wrap", marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--stroke)" }}>
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

                    <section style={{ display: "grid", gridTemplateColumns: "minmax(280px, .82fr) minmax(480px, 1.5fr)", gap: 18, alignItems: "start", marginBottom: 18 }}>
                        <div style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: 22, boxShadow: "0 8px 32px rgba(0,0,0,.16)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                                <ShieldCheck size={18} color="#22d3ee" aria-hidden />
                                <div>
                                    <h2 style={{ margin: 0, color: "var(--text)", fontSize: 16, fontWeight: 850 }}>Nuevo proveedor</h2>
                                    <p style={{ margin: "3px 0 0", color: "var(--muted)", fontSize: 12 }}>El proveedor agrupa sus cuentas de acceso.</p>
                                </div>
                            </div>
                            <form onSubmit={createProvider} style={{ display: "grid", gap: 13 }}>
                                <div>
                                    <label style={labelStyle}>Nombre del proveedor *</label>
                                    <input style={inputStyle} value={providerForm.name} onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })} placeholder="Ej. StoreTools.co" required />
                                </div>
                                <div>
                                    <label style={labelStyle}>Correo de contacto</label>
                                    <input style={inputStyle} type="email" value={providerForm.contactEmail} onChange={(event) => setProviderForm({ ...providerForm, contactEmail: event.target.value })} placeholder="proveedor@dominio.com" />
                                </div>
                                <div>
                                    <label style={labelStyle}>Notas</label>
                                    <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={providerForm.notes} onChange={(event) => setProviderForm({ ...providerForm, notes: event.target.value })} placeholder="Observaciones internas" />
                                </div>
                                <button className="btn" type="submit" disabled={savingProvider || !providerForm.name.trim()} style={{ minHeight: 42, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, fontWeight: 800 }}>
                                    <Save size={16} aria-hidden /> {savingProvider ? "Guardando..." : "Guardar proveedor"}
                                </button>
                            </form>
                        </div>

                        <div style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: 22, boxShadow: "0 8px 32px rgba(0,0,0,.16)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                                <Factory size={18} color="#a78bfa" aria-hidden />
                                <div>
                                    <h2 style={{ margin: 0, color: "var(--text)", fontSize: 16, fontWeight: 850 }}>Nueva cuenta de proveedor</h2>
                                    <p style={{ margin: "3px 0 0", color: "var(--muted)", fontSize: 12 }}>La plataforma se lee únicamente entre las plataformas activas.</p>
                                </div>
                            </div>
                            <form id="provider-account-form" onSubmit={saveAccount} style={{ display: "grid", gap: 13 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Correo de la cuenta *</label>
                                        <input style={inputStyle} type="email" value={accountForm.accountEmail} onChange={(event) => setAccountForm({ ...accountForm, accountEmail: event.target.value })} placeholder="cuenta@dominio.com" required />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Contraseña *</label>
                                        <input style={inputStyle} type="password" value={accountForm.accountPassword} onChange={(event) => setAccountForm({ ...accountForm, accountPassword: event.target.value })} placeholder="Contraseña de la cuenta" required />
                                    </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Fecha de compra *</label>
                                        <input style={inputStyle} type="date" value={accountForm.purchaseDate} onChange={(event) => setAccountForm({ ...accountForm, purchaseDate: event.target.value })} required />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Vence automáticamente</label>
                                        <input style={{ ...inputStyle, color: "#86efac", cursor: "not-allowed" }} value={shortDate(addCalendarDays(accountForm.purchaseDate))} readOnly aria-label="Fecha de vencimiento calculada" />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>IP de la cuenta</label>
                                        <input style={inputStyle} value={accountForm.ipAddress} onChange={(event) => setAccountForm({ ...accountForm, ipAddress: event.target.value })} placeholder="192.168.1.10" maxLength={64} />
                                    </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 12 }}>
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

                    <section style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: 22, marginBottom: 18, boxShadow: "0 8px 32px rgba(0,0,0,.14)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                            <div>
                                <h2 style={{ margin: 0, color: "var(--text)", fontSize: 16, fontWeight: 850 }}>Proveedores registrados</h2>
                                <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 12 }}>{providers.length} proveedor(es) · {activeProviders.length} activo(s)</p>
                            </div>
                        </div>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 650 }}>
                                <thead><tr>{["Proveedor", "Contacto", "Cuentas", "Estado", "Acción"].map((title) => <th key={title} style={{ textAlign: "left", padding: "10px 12px", color: "var(--muted)", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid var(--stroke)" }}>{title}</th>)}</tr></thead>
                                <tbody>
                                    {providers.map((provider) => {
                                        const active = Number(provider.isActive) === 1;
                                        return <tr key={provider.id}>
                                            <td style={{ padding: "13px 12px", color: "var(--text)", fontWeight: 800 }}>{provider.name}</td>
                                            <td style={{ padding: "13px 12px", color: "var(--muted)", fontSize: 13 }}>{provider.contactEmail || "-"}</td>
                                            <td style={{ padding: "13px 12px", color: "var(--text)", fontWeight: 700 }}>{provider.activeAccountCount || 0} activas <span style={{ color: "var(--muted)", fontWeight: 500 }}>({provider.accountCount || 0} total)</span></td>
                                            <td style={{ padding: "13px 12px" }}><span style={{ color: active ? "#86efac" : "#fca5a5", fontWeight: 800, fontSize: 13 }}>{active ? "Activo" : "Inactivo"}</span></td>
                                            <td style={{ padding: "13px 12px" }}><button className="btn-ghost" type="button" onClick={() => toggleProvider(provider)} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 10px" }}>{active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />} {active ? "Desactivar" : "Activar"}</button></td>
                                        </tr>;
                                    })}
                                    {!providers.length && <tr><td colSpan="5" style={{ padding: 22, textAlign: "center", color: "var(--muted)" }}>Aún no hay proveedores registrados.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: 22, boxShadow: "0 8px 32px rgba(0,0,0,.14)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                            <div>
                                <h2 style={{ margin: 0, color: "var(--text)", fontSize: 16, fontWeight: 850 }}>Cuentas de proveedor</h2>
                                <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 12 }}>El vencimiento se conserva en la base de datos como compra + 30 días calendario.</p>
                            </div>
                            <select style={{ ...inputStyle, width: 240, minHeight: 38 }} value={filterProviderId} onChange={(event) => setFilterProviderId(event.target.value)} aria-label="Filtrar cuentas por proveedor">
                                <option value="">Todos los proveedores</option>
                                {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                            </select>
                        </div>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
                                <thead><tr>{["Proveedor / plataforma", "Cuenta", "Contraseña", "Compra", "Vencimiento", "IP", "Valor", "Estado", "Acción"].map((title) => <th key={title} style={{ textAlign: "left", padding: "10px 11px", color: "var(--muted)", fontSize: 10, textTransform: "uppercase", borderBottom: "1px solid var(--stroke)", whiteSpace: "nowrap" }}>{title}</th>)}</tr></thead>
                                <tbody>
                                    {filteredAccounts.map((account) => {
                                        const active = account.status === "active";
                                        const days = getDaysRemaining(account.expiresAt);
                                        const passwordVisible = Boolean(visiblePasswords[account.id]);
                                        return <tr key={account.id}>
                                            <td style={{ padding: "13px 11px" }}><div style={{ color: "var(--text)", fontWeight: 800 }}>{account.providerName}</div><div style={{ color: "#a78bfa", fontSize: 12, marginTop: 3 }}>{account.platformName}</div></td>
                                            <td style={{ padding: "13px 11px", color: "var(--text)", fontSize: 13 }}>{account.accountEmail}</td>
                                            <td style={{ padding: "13px 11px", color: "var(--muted)", fontFamily: "monospace", fontSize: 12, whiteSpace: "nowrap" }}>{passwordVisible ? account.accountPassword : "••••••••"} <button type="button" title={passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"} onClick={() => setVisiblePasswords((current) => ({ ...current, [account.id]: !passwordVisible }))} style={{ display: "inline-grid", placeItems: "center", border: 0, background: "transparent", color: "#22d3ee", cursor: "pointer", verticalAlign: "middle" }}>{passwordVisible ? <EyeOff size={14} /> : <Eye size={14} />}</button></td>
                                            <td style={{ padding: "13px 11px", color: "var(--muted)", whiteSpace: "nowrap", fontSize: 12 }}>{shortDate(account.purchaseDate)}</td>
                                            <td style={{ padding: "13px 11px", whiteSpace: "nowrap" }}><div style={{ color: days !== null && days < 0 ? "#fca5a5" : "#86efac", fontWeight: 800, fontSize: 12 }}>{shortDate(account.expiresAt)}</div><div style={{ color: "var(--muted)", fontSize: 11, marginTop: 3 }}>{days === null ? "-" : days < 0 ? `Vencida hace ${Math.abs(days)} día(s)` : `${days} día(s)`}</div></td>
                                            <td style={{ padding: "13px 11px", color: "var(--muted)", fontSize: 12 }}>{account.ipAddress || "-"}</td>
                                            <td style={{ padding: "13px 11px", color: "var(--text)", fontSize: 12, whiteSpace: "nowrap" }}>{Number(account.amount || 0).toFixed(2)} {account.currency}</td>
                                            <td style={{ padding: "13px 11px", color: active ? "#86efac" : "#fca5a5", fontSize: 12, fontWeight: 800 }}>{active ? "Activo" : "Inactivo"}</td>
                                            <td style={{ padding: "13px 11px" }}><div style={{ display: "flex", gap: 6, alignItems: "center" }}><button className="btn-ghost" type="button" onClick={() => editAccount(account)} style={{ height: 32, padding: "0 9px", fontSize: 12 }}>Editar</button><button className="btn-ghost" type="button" onClick={() => toggleAccount(account)} style={{ height: 32, padding: "0 9px", fontSize: 12 }}>{active ? "Desactivar" : "Activar"}</button></div></td>
                                        </tr>;
                                    })}
                                    {!filteredAccounts.length && <tr><td colSpan="9" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>No hay cuentas de proveedor para este filtro.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
}
