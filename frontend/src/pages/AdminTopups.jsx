import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { apiFetch, apiLogout, apiPatch } from "../api/api";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";

const LOGO_URL = "/api/branding/logo";

const STATUS_OPTIONS = [
    { value: "", label: "Todas" },
    { value: "submitted", label: "Enviadas" },
    { value: "reviewing", label: "Revisando" },
    { value: "approved", label: "Aprobadas" },
    { value: "rejected", label: "Rechazadas" },
];

const STATUS_META = {
    submitted: { label: "Enviada", color: "#f59e0b" },
    reviewing: { label: "Revisando", color: "#0ea5e9" },
    approved: { label: "Aprobada", color: "#10b981" },
    rejected: { label: "Rechazada", color: "#ef4444" },
};

export default function AdminTopups() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();
    const [items, setItems] = useState([]);
    const [status, setStatus] = useState("");
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState(null);
    const [adminNoteDrafts, setAdminNoteDrafts] = useState({});
    const [configLoading, setConfigLoading] = useState(true);
    const [configSaving, setConfigSaving] = useState(false);
    const [configMessage, setConfigMessage] = useState("");
    const [configError, setConfigError] = useState("");
    const [configForm, setConfigForm] = useState({
        methodLabel: "Binance",
        accountName: "",
        binanceId: "",
        binanceAlias: "",
        minAmount: "10",
        currency: "USD",
        instructions: "",
    });

    async function logout() {
        try { await apiLogout(); } catch { }
        setUser(null);
        try {
            localStorage.removeItem("user");
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
        } catch { }
        navigate("/", { replace: true });
    }

    async function loadItems() {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (status) params.set("status", status);
            if (query.trim()) params.set("q", query.trim());
            params.set("limit", "100");
            const response = await apiFetch(`/admin/manual-topups?${params.toString()}`, { method: "GET" });
            if (response.ok) {
                setItems(Array.isArray(response.data?.items) ? response.data.items : []);
            }
        } finally {
            setLoading(false);
        }
    }

    async function loadConfig() {
        setConfigLoading(true);
        try {
            const response = await apiFetch("/admin/manual-topups/config", { method: "GET" });
            if (response.ok && response.data?.config) {
                const config = response.data.config;
                setConfigForm({
                    methodLabel: config.methodLabel || "Binance",
                    accountName: config.accountName || "",
                    binanceId: config.binanceId || "",
                    binanceAlias: config.binanceAlias || "",
                    minAmount: String(config.minAmount ?? 10),
                    currency: config.currency || "USD",
                    instructions: config.instructions || "",
                });
            }
        } finally {
            setConfigLoading(false);
        }
    }

    useEffect(() => {
        void loadItems();
    }, [status]);

    useEffect(() => {
        void loadConfig();
    }, []);

    async function updateStatus(item, nextStatus) {
        setSavingId(item.id);
        try {
            const response = await apiPatch(`/admin/manual-topups/${item.id}/status`, {
                status: nextStatus,
                adminNote: adminNoteDrafts[item.id] || "",
            });
            if (!response.ok) {
                throw new Error(response.data?.message || "No se pudo actualizar.");
            }
            setItems((prev) => prev.map((current) => current.id === item.id ? response.data?.item || current : current));
        } catch (error) {
            window.alert(error?.message || "No se pudo actualizar la solicitud.");
        } finally {
            setSavingId(null);
        }
    }

    async function saveConfig() {
        setConfigSaving(true);
        setConfigMessage("");
        setConfigError("");
        try {
            const response = await apiFetch("/admin/manual-topups/config", {
                method: "PUT",
                body: JSON.stringify({
                    methodLabel: configForm.methodLabel,
                    accountName: configForm.accountName,
                    binanceId: configForm.binanceId,
                    binanceAlias: configForm.binanceAlias,
                    minAmount: Number(configForm.minAmount),
                    currency: configForm.currency,
                    instructions: configForm.instructions,
                }),
            });
            if (!response.ok) {
                throw new Error(response.data?.message || "No se pudo guardar la configuracion.");
            }
            const config = response.data?.config || {};
            setConfigForm({
                methodLabel: config.methodLabel || "Binance",
                accountName: config.accountName || "",
                binanceId: config.binanceId || "",
                binanceAlias: config.binanceAlias || "",
                minAmount: String(config.minAmount ?? 10),
                currency: config.currency || "USD",
                instructions: config.instructions || "",
            });
            setConfigMessage("Configuracion guardada.");
        } catch (error) {
            setConfigError(error?.message || "No se pudo guardar la configuracion.");
        } finally {
            setConfigSaving(false);
        }
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
                    logoSrc={LOGO_URL}
                    logoOk={true}
                    setLogoOk={() => { }}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main" style={{ padding: "20px 24px 32px" }}>
                    <div style={{ marginBottom: 22 }}>
                        <button className="btn-ghost" onClick={() => navigate("/admin")} style={{ marginBottom: 14 }}>
                            {"<-"} Volver al panel
                        </button>
                        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Recargas internacionales</h1>
                        <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
                            Edita aqui los datos de pago que ve el usuario y revisa las solicitudes de comprobante.
                        </p>
                    </div>

                    <section
                        style={{
                            border: "1px solid var(--stroke)",
                            borderRadius: 18,
                            background: "linear-gradient(180deg, var(--card), var(--card2))",
                            boxShadow: "var(--shadow)",
                            padding: 16,
                            display: "grid",
                            gap: 14,
                            marginBottom: 18,
                        }}
                    >
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>Configuracion de pago</div>
                            <div style={{ color: "var(--muted)", fontSize: 13 }}>
                                Estos datos se reflejan en el frontend de recarga internacional.
                            </div>
                        </div>

                        {configLoading ? (
                            <div style={{ color: "var(--muted)" }}>Cargando configuracion...</div>
                        ) : (
                            <>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                                    <label className="wallet-label">
                                        <span>Metodo</span>
                                        <input className="wallet-input" value={configForm.methodLabel} onChange={(event) => setConfigForm((prev) => ({ ...prev, methodLabel: event.target.value }))} />
                                    </label>
                                    <label className="wallet-label">
                                        <span>Titular</span>
                                        <input className="wallet-input" value={configForm.accountName} onChange={(event) => setConfigForm((prev) => ({ ...prev, accountName: event.target.value }))} />
                                    </label>
                                    <label className="wallet-label">
                                        <span>Moneda</span>
                                        <input className="wallet-input" value={configForm.currency} onChange={(event) => setConfigForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))} />
                                    </label>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                                    <label className="wallet-label">
                                        <span>ID Binance</span>
                                        <input className="wallet-input" value={configForm.binanceId} onChange={(event) => setConfigForm((prev) => ({ ...prev, binanceId: event.target.value }))} />
                                    </label>
                                    <label className="wallet-label">
                                        <span>Alias Binance</span>
                                        <input className="wallet-input" value={configForm.binanceAlias} onChange={(event) => setConfigForm((prev) => ({ ...prev, binanceAlias: event.target.value }))} />
                                    </label>
                                    <label className="wallet-label">
                                        <span>Monto minimo</span>
                                        <input className="wallet-input" inputMode="numeric" value={configForm.minAmount} onChange={(event) => setConfigForm((prev) => ({ ...prev, minAmount: event.target.value }))} />
                                    </label>
                                </div>

                                <label className="wallet-label">
                                    <span>Instrucciones</span>
                                    <textarea
                                        value={configForm.instructions}
                                        onChange={(event) => setConfigForm((prev) => ({ ...prev, instructions: event.target.value }))}
                                        style={{
                                            minHeight: 100,
                                            resize: "vertical",
                                            padding: 12,
                                            borderRadius: 14,
                                            border: "1px solid var(--input-stroke)",
                                            background: "var(--input-bg)",
                                            color: "var(--text)",
                                        }}
                                    />
                                </label>

                                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                    <button className="btn" style={{ width: "auto" }} onClick={saveConfig} disabled={configSaving}>
                                        {configSaving ? "Guardando..." : "Guardar configuracion"}
                                    </button>
                                    {configMessage ? <span style={{ color: "#10b981", fontWeight: 700 }}>{configMessage}</span> : null}
                                    {configError ? <span style={{ color: "#ef4444", fontWeight: 700 }}>{configError}</span> : null}
                                </div>
                            </>
                        )}
                    </section>

                    <section
                        style={{
                            display: "grid",
                            gridTemplateColumns: "220px 1fr auto",
                            gap: 12,
                            alignItems: "end",
                            marginBottom: 16,
                        }}
                    >
                        <label className="wallet-label">
                            <span>Estado</span>
                            <select className="wallet-input" value={status} onChange={(event) => setStatus(event.target.value)}>
                                {STATUS_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </label>

                        <label className="wallet-label">
                            <span>Buscar</span>
                            <input
                                className="wallet-input"
                                placeholder="Codigo, nombre o correo"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                            />
                        </label>

                        <button className="btn" style={{ width: "auto" }} onClick={loadItems}>Buscar</button>
                    </section>

                    {loading ? (
                        <div style={{ padding: 40, color: "var(--muted)" }}>Cargando solicitudes...</div>
                    ) : (
                        <div style={{ display: "grid", gap: 12 }}>
                            {items.map((item) => {
                                const meta = STATUS_META[String(item.status || "").toLowerCase()] || { label: item.status, color: "#94a3b8" };
                                const closed = item.status === "approved" || item.status === "rejected";
                                return (
                                    <section
                                        key={item.id}
                                        style={{
                                            border: "1px solid var(--stroke)",
                                            borderRadius: 18,
                                            background: "linear-gradient(180deg, var(--card), var(--card2))",
                                            boxShadow: "var(--shadow)",
                                            padding: 16,
                                            display: "grid",
                                            gap: 14,
                                        }}
                                    >
                                        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
                                            <div>
                                                <div style={{ fontSize: 18, fontWeight: 900 }}>{item.requestCode}</div>
                                                <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                                                    {item.userName || item.userEmail} · {item.userEmail}
                                                </div>
                                            </div>
                                            <span
                                                style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    borderRadius: 999,
                                                    padding: "6px 12px",
                                                    border: `1px solid ${meta.color}55`,
                                                    background: `${meta.color}18`,
                                                    color: meta.color,
                                                    fontWeight: 800,
                                                    fontSize: 12,
                                                }}
                                            >
                                                {meta.label}
                                            </span>
                                        </div>

                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
                                            <div>
                                                <div style={{ fontSize: 12, color: "var(--muted)" }}>Monto</div>
                                                <div style={{ fontWeight: 800 }}>{Number(item.amount || 0).toLocaleString("es-CO")} {item.currency || "USD"}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, color: "var(--muted)" }}>Metodo</div>
                                                <div style={{ fontWeight: 800 }}>{item.methodLabel || "Binance"}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, color: "var(--muted)" }}>Creada</div>
                                                <div style={{ fontWeight: 700 }}>{new Date(item.createdAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, color: "var(--muted)" }}>Comprobante</div>
                                                <a className="wallet-link" href={item.proofFileUrl} target="_blank" rel="noreferrer">Abrir archivo</a>
                                            </div>
                                        </div>

                                        {item.balanceAfter != null ? (
                                            <div style={{ fontSize: 13, color: "var(--muted)" }}>
                                                Saldo: {Number(item.balanceBefore || 0).toLocaleString("es-CO")} → {Number(item.balanceAfter || 0).toLocaleString("es-CO")} {item.currency || "USD"}
                                            </div>
                                        ) : null}

                                        <label className="wallet-label">
                                            <span>Nota admin</span>
                                            <textarea
                                                value={adminNoteDrafts[item.id] ?? item.adminNote ?? ""}
                                                onChange={(event) => setAdminNoteDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))}
                                                style={{
                                                    minHeight: 92,
                                                    resize: "vertical",
                                                    padding: 12,
                                                    borderRadius: 14,
                                                    border: "1px solid var(--input-stroke)",
                                                    background: "var(--input-bg)",
                                                    color: "var(--text)",
                                                }}
                                            />
                                        </label>

                                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                            <button
                                                className="btn-ghost"
                                                disabled={closed || savingId === item.id}
                                                onClick={() => updateStatus(item, "reviewing")}
                                            >
                                                Marcar revisando
                                            </button>
                                            <button
                                                className="btn"
                                                disabled={closed || savingId === item.id}
                                                onClick={() => updateStatus(item, "approved")}
                                            >
                                                Aprobar y recargar
                                            </button>
                                            <button
                                                className="btn-ghost"
                                                style={{ borderColor: "rgba(239,68,68,.35)", color: "#ef4444" }}
                                                disabled={closed || savingId === item.id}
                                                onClick={() => updateStatus(item, "rejected")}
                                            >
                                                Rechazar
                                            </button>
                                        </div>
                                    </section>
                                );
                            })}

                            {!items.length ? (
                                <div style={{ padding: 28, color: "var(--muted)" }}>
                                    No hay solicitudes con los filtros aplicados.
                                </div>
                            ) : null}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
