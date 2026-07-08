import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DatabaseZap, RefreshCcw, Save, Search, Trash2 } from "lucide-react";

import { apiDelete, apiFetch, apiLogout, apiPatch, apiPost } from "../api/api.js";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import "../styles/dashboard.css";

const inputStyle = {
    width: "100%",
    minHeight: 42,
    boxSizing: "border-box",
    border: "1px solid var(--stroke)",
    borderRadius: 8,
    outline: "none",
    background: "var(--input-bg)",
    color: "var(--text)",
    padding: "0 12px",
    font: "inherit",
};

function statusLabel(status) {
    return status === "inactive" ? "Inactiva / caída" : "Activa";
}

export default function AdminMasterAccounts() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();
    const [items, setItems] = useState([]);
    const [platforms, setPlatforms] = useState([]);
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("all");
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

    const inactiveCount = useMemo(
        () => items.filter((item) => item.status === "inactive").length,
        [items]
    );

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
        const params = new URLSearchParams({ status });
        if (q.trim()) params.set("q", q.trim());
        const response = await apiFetch(`/admin/master-accounts?${params.toString()}`, { method: "GET" });
        if (response.ok) {
            setItems(response.data?.items || []);
        } else {
            setError(response.data?.message || "No se pudieron cargar las cuentas maestras.");
        }
        setLoading(false);
    }, [q, status]);

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
        const response = await apiPost("/admin/master-accounts", {
            platformId: form.platformId,
            accountEmail: form.accountEmail,
            status: form.status,
            notes: form.notes,
        });
        setSaving(false);
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

                <main className="main" style={{ padding: "22px 24px 44px", minWidth: 0 }}>
                    <header style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 16,
                        flexWrap: "wrap",
                        paddingBottom: 22,
                        marginBottom: 22,
                        borderBottom: "1px solid var(--stroke)",
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                            <span style={{
                                width: 50,
                                height: 50,
                                display: "grid",
                                placeItems: "center",
                                border: "1px solid rgba(34,211,238,.35)",
                                borderRadius: 10,
                                color: "#22d3ee",
                                background: "rgba(34,211,238,.11)",
                                flexShrink: 0,
                            }}>
                                <DatabaseZap size={25} aria-hidden />
                            </span>
                            <div style={{ minWidth: 0 }}>
                                <h1 style={{ margin: 0, color: "var(--text)", fontSize: 24, letterSpacing: 0 }}>
                                    Cuentas maestras
                                </h1>
                                <p style={{ margin: "5px 0 0", color: "var(--muted)", fontSize: 13 }}>
                                    Marca cuentas caídas para que soporte intente reemplazo automático cuando haya stock.
                                </p>
                            </div>
                        </div>
                        <span style={{
                            padding: "8px 12px",
                            border: "1px solid rgba(245,158,11,.32)",
                            borderRadius: 999,
                            color: "#fbbf24",
                            background: "rgba(245,158,11,.10)",
                            fontSize: 12,
                            fontWeight: 900,
                        }}>
                            {inactiveCount} inactivas
                        </span>
                    </header>

                    {error ? <div className="error" style={{ marginBottom: 14 }}>{error}</div> : null}
                    {success ? (
                        <div style={{
                            marginBottom: 14,
                            padding: "12px 14px",
                            border: "1px solid rgba(16,185,129,.32)",
                            borderRadius: 8,
                            color: "#6ee7b7",
                            background: "rgba(16,185,129,.10)",
                            fontWeight: 800,
                        }}>{success}</div>
                    ) : null}

                    <section style={{
                        padding: 18,
                        marginBottom: 18,
                        border: "1px solid var(--stroke)",
                        borderRadius: 12,
                        background: "var(--card)",
                    }}>
                        <form
                            onSubmit={saveAccount}
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                                gap: 12,
                                alignItems: "end",
                            }}
                        >
                            <label style={{ display: "grid", gap: 7 }}>
                                <span style={{ color: "var(--text)", fontSize: 12, fontWeight: 900 }}>Plataforma</span>
                                <select
                                    style={inputStyle}
                                    value={form.platformId}
                                    onChange={(event) => setForm((current) => ({ ...current, platformId: event.target.value }))}
                                    required
                                >
                                    <option value="">Seleccionar plataforma</option>
                                    {platforms.map((platform) => (
                                        <option value={platform.id} key={platform.id}>{platform.name}</option>
                                    ))}
                                </select>
                            </label>
                            <label style={{ display: "grid", gap: 7 }}>
                                <span style={{ color: "var(--text)", fontSize: 12, fontWeight: 900 }}>Correo de cuenta</span>
                                <input
                                    style={inputStyle}
                                    value={form.accountEmail}
                                    onChange={(event) => setForm((current) => ({ ...current, accountEmail: event.target.value }))}
                                    placeholder="cuenta@dominio.com"
                                    required
                                />
                            </label>
                            <label style={{ display: "grid", gap: 7 }}>
                                <span style={{ color: "var(--text)", fontSize: 12, fontWeight: 900 }}>Estado</span>
                                <select
                                    style={inputStyle}
                                    value={form.status}
                                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                                >
                                    <option value="inactive">Inactiva / caída</option>
                                    <option value="active">Activa</option>
                                </select>
                            </label>
                            <label style={{ display: "grid", gap: 7 }}>
                                <span style={{ color: "var(--text)", fontSize: 12, fontWeight: 900 }}>Nota</span>
                                <input
                                    style={inputStyle}
                                    value={form.notes}
                                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                                    placeholder="Motivo o detalle interno"
                                />
                            </label>
                            <button
                                type="submit"
                                disabled={saving}
                                style={{
                                    minHeight: 42,
                                    border: 0,
                                    borderRadius: 8,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 8,
                                    color: "#07111f",
                                    background: "#22d3ee",
                                    fontWeight: 900,
                                    cursor: saving ? "wait" : "pointer",
                                }}
                            >
                                <Save size={17} aria-hidden />
                                {saving ? "Guardando..." : "Guardar"}
                            </button>
                        </form>
                    </section>

                    <section style={{
                        padding: 14,
                        marginBottom: 18,
                        border: "1px solid var(--stroke)",
                        borderRadius: 12,
                        background: "var(--card)",
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                    }}>
                        <div style={{ flex: "1 1 260px", display: "flex", alignItems: "center", gap: 8, padding: "0 12px", border: "1px solid var(--stroke)", borderRadius: 8, background: "var(--input-bg)" }}>
                            <Search size={17} color="var(--muted)" aria-hidden />
                            <input
                                value={q}
                                onChange={(event) => setQ(event.target.value)}
                                placeholder="Buscar cuenta, plataforma o nota"
                                style={{ flex: 1, minWidth: 0, height: 40, border: 0, outline: 0, color: "var(--text)", background: "transparent" }}
                            />
                        </div>
                        <select style={{ ...inputStyle, width: 180 }} value={status} onChange={(event) => setStatus(event.target.value)}>
                            <option value="all">Todos</option>
                            <option value="inactive">Inactivas</option>
                            <option value="active">Activas</option>
                        </select>
                        <button type="button" className="btn-ghost" onClick={() => void loadItems()}>
                            <RefreshCcw size={16} aria-hidden /> Refrescar
                        </button>
                    </section>

                    <section style={{ border: "1px solid var(--stroke)", borderRadius: 14, overflow: "hidden", background: "var(--card)" }}>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: "rgba(0,0,0,.18)", borderBottom: "1px solid var(--stroke)" }}>
                                        <th style={{ padding: 14, textAlign: "left" }}>Plataforma</th>
                                        <th style={{ padding: 14, textAlign: "left" }}>Cuenta</th>
                                        <th style={{ padding: 14, textAlign: "left" }}>Estado</th>
                                        <th style={{ padding: 14, textAlign: "left" }}>Nota</th>
                                        <th style={{ padding: 14, textAlign: "left" }}>Actualizada</th>
                                        <th style={{ padding: 14, textAlign: "left" }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={6} style={{ padding: 36, textAlign: "center" }}><div className="spinner" style={{ margin: "0 auto" }} /></td></tr>
                                    ) : items.length ? items.map((item) => (
                                        <tr key={item.id} style={{ borderBottom: "1px solid var(--stroke2)" }}>
                                            <td style={{ padding: 14, color: "var(--text)", fontWeight: 900 }}>{item.platformName}</td>
                                            <td style={{ padding: 14 }}>{item.accountEmail}</td>
                                            <td style={{ padding: 14 }}>
                                                <span style={{
                                                    display: "inline-flex",
                                                    padding: "5px 9px",
                                                    borderRadius: 999,
                                                    color: item.status === "inactive" ? "#fbbf24" : "#6ee7b7",
                                                    background: item.status === "inactive" ? "rgba(245,158,11,.12)" : "rgba(16,185,129,.12)",
                                                    fontSize: 11,
                                                    fontWeight: 900,
                                                }}>
                                                    {statusLabel(item.status)}
                                                </span>
                                            </td>
                                            <td style={{ padding: 14, color: "var(--muted)", maxWidth: 260 }}>{item.notes || "-"}</td>
                                            <td style={{ padding: 14, color: "var(--muted)" }}>{item.updatedAt ? new Date(item.updatedAt).toLocaleString("es-CO") : "-"}</td>
                                            <td style={{ padding: 14 }}>
                                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                                    <button
                                                        type="button"
                                                        className="btn-ghost"
                                                        onClick={() => updateStatus(item, item.status === "inactive" ? "active" : "inactive")}
                                                    >
                                                        {item.status === "inactive" ? "Marcar activa" : "Marcar caída"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn-ghost"
                                                        onClick={() => removeItem(item)}
                                                        style={{ color: "#fca5a5" }}
                                                    >
                                                        <Trash2 size={15} aria-hidden /> Eliminar
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan={6} style={{ padding: 36, textAlign: "center", color: "var(--muted)" }}>No hay cuentas maestras registradas.</td></tr>
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
