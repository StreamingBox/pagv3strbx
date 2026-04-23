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

const CURRENCY_OPTIONS = ["COP", "USD", "MXN"];
let nextMethodRowId = 1;

const ADMIN_FIELD_STYLE = {
    width: "100%",
    minWidth: 0,
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid var(--input-stroke)",
    background: "var(--input-bg)",
    color: "var(--text)",
    outline: "none",
    fontSize: 14,
};

const ADMIN_LABEL_STYLE = {
    display: "grid",
    gap: 8,
    color: "var(--muted)",
    fontSize: 12,
    fontWeight: 700,
};

function resolveQrImageUrl(value) {
    const input = String(value || "").trim();
    if (!input) return "";

    try {
        const url = new URL(input);
        if (url.hostname.includes("drive.google.com")) {
            const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/i);
            const directId = fileMatch?.[1] || url.searchParams.get("id");
            if (directId) {
                return `https://drive.google.com/uc?export=view&id=${directId}`;
            }
        }
    } catch {
        return input;
    }

    return input;
}

function emptyMethod() {
    return {
        _rowId: `method-row-${nextMethodRowId++}`,
        key: "",
        label: "",
        currency: "COP",
        holderName: "",
        accountLabel: "",
        accountValue: "",
        accountAlias: "",
        accountType: "",
        qrImageUrl: "",
        minAmount: "0",
        instructions: "",
    };
}

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
    const [methods, setMethods] = useState([]);
    const [previewItem, setPreviewItem] = useState(null);

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
            if (response.ok) {
                const nextMethods = Array.isArray(response.data?.config?.methods) ? response.data.config.methods : [];
                setMethods(nextMethods.map((item) => ({ ...emptyMethod(), ...item, minAmount: String(item.minAmount ?? 0) })));
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

    function updateMethod(index, field, value) {
        setMethods((prev) => prev.map((method, currentIndex) => currentIndex === index ? { ...method, [field]: value } : method));
    }

    function addMethod() {
        setMethods((prev) => [...prev, emptyMethod()]);
    }

    function removeMethod(index) {
        setMethods((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
    }

    async function saveConfig() {
        setConfigSaving(true);
        setConfigMessage("");
        setConfigError("");
        try {
            const payload = methods.map((item) => ({
                ...item,
                minAmount: Number(item.minAmount || 0),
            }));
            const response = await apiFetch("/admin/manual-topups/config", {
                method: "PUT",
                body: JSON.stringify({ methods: payload }),
            });
            if (!response.ok) throw new Error(response.data?.message || "No se pudo guardar la configuracion.");
            const nextMethods = Array.isArray(response.data?.config?.methods) ? response.data.config.methods : [];
            setMethods(nextMethods.map((item) => ({ ...emptyMethod(), ...item, minAmount: String(item.minAmount ?? 0) })));
            setConfigMessage("Configuracion guardada.");
        } catch (error) {
            setConfigError(error?.message || "No se pudo guardar la configuracion.");
        } finally {
            setConfigSaving(false);
        }
    }

    async function updateStatus(item, nextStatus) {
        setSavingId(item.id);
        try {
            const response = await apiPatch(`/admin/manual-topups/${item.id}/status`, {
                status: nextStatus,
                adminNote: adminNoteDrafts[item.id] || "",
            });
            if (!response.ok) throw new Error(response.data?.message || "No se pudo actualizar.");
            setItems((prev) => prev.map((current) => current.id === item.id ? response.data?.item || current : current));
        } catch (error) {
            window.alert(error?.message || "No se pudo actualizar la solicitud.");
        } finally {
            setSavingId(null);
        }
    }

    const submittedCount = items.filter((item) => String(item.status || "").toLowerCase() === "submitted").length;
    const reviewingCount = items.filter((item) => String(item.status || "").toLowerCase() === "reviewing").length;
    const approvedCount = items.filter((item) => String(item.status || "").toLowerCase() === "approved").length;
    const rejectedCount = items.filter((item) => String(item.status || "").toLowerCase() === "rejected").length;

    function proofIsPdf(url) {
        return String(url || "").toLowerCase().includes(".pdf");
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
                        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Recargas</h1>
                        <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
                            Configura medios de pago y revisa los comprobantes de recarga cargados por los usuarios.
                        </p>
                    </div>

                    {submittedCount > 0 ? (
                        <section
                            style={{
                                border: "1px solid rgba(245,158,11,.35)",
                                borderRadius: 18,
                                background: "linear-gradient(135deg, rgba(245,158,11,.14), rgba(245,158,11,.05))",
                                boxShadow: "0 0 24px rgba(245,158,11,.08)",
                                padding: 16,
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 16,
                                marginBottom: 16,
                            }}
                        >
                            <div>
                                <div style={{ fontSize: 18, fontWeight: 900, color: "#fbbf24", marginBottom: 4 }}>
                                    Tienes {submittedCount} recarga{submittedCount === 1 ? "" : "s"} nueva{submittedCount === 1 ? "" : "s"} por revisar
                                </div>
                                <div style={{ color: "var(--muted)" }}>
                                    Abre el comprobante y valida el soporte antes de aprobar la recarga.
                                </div>
                            </div>
                            <button className="btn" style={{ width: "auto" }} onClick={() => setStatus("submitted")}>
                                Ver pendientes
                            </button>
                        </section>
                    ) : null}

                    <section
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                            gap: 12,
                            marginBottom: 18,
                        }}
                    >
                        {[
                            { label: "Nuevas", value: submittedCount, color: "#f59e0b" },
                            { label: "Revisando", value: reviewingCount, color: "#0ea5e9" },
                            { label: "Aprobadas", value: approvedCount, color: "#10b981" },
                            { label: "Rechazadas", value: rejectedCount, color: "#ef4444" },
                        ].map((card) => (
                            <div
                                key={card.label}
                                style={{
                                    border: `1px solid ${card.color}33`,
                                    borderRadius: 18,
                                    background: "linear-gradient(180deg, var(--card), var(--card2))",
                                    boxShadow: "var(--shadow)",
                                    padding: 16,
                                }}
                            >
                                <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8 }}>{card.label}</div>
                                <div style={{ fontSize: 28, fontWeight: 900, color: card.color }}>{card.value}</div>
                            </div>
                        ))}
                    </section>

                    <section style={{ border: "1px solid var(--stroke)", borderRadius: 18, background: "linear-gradient(180deg, var(--card), var(--card2))", boxShadow: "var(--shadow)", padding: 16, display: "grid", gap: 14, marginBottom: 18 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                            <div>
                                <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>Configuracion de medios</div>
                                <div style={{ color: "var(--muted)", fontSize: 13 }}>
                                    Para COP solo se permite Bre-B. Otras monedas pueden seguir usando sus medios configurados.
                                </div>
                            </div>
                            <button className="btn-ghost" style={{ width: "auto" }} onClick={addMethod}>Agregar metodo</button>
                        </div>

                        {configLoading ? (
                            <div style={{ color: "var(--muted)" }}>Cargando configuracion...</div>
                        ) : (
                            <>
                                <div style={{ display: "grid", gap: 12 }}>
                                    {methods.map((method, index) => (
                                        <div
                                            key={method._rowId || `method-${index}`}
                                            style={{
                                                border: "1px solid var(--stroke)",
                                                borderRadius: 18,
                                                padding: 16,
                                                display: "grid",
                                                gap: 14,
                                                background: "rgba(255,255,255,.02)",
                                            }}
                                        >
                                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                                                <div>
                                                    <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 4 }}>
                                                        {method.label || `Medio ${index + 1}`}
                                                    </div>
                                                    <div style={{ color: "var(--muted)", fontSize: 13 }}>
                                                        Configura los datos que verá el usuario al momento de recargar.
                                                    </div>
                                                </div>
                                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                                    <span
                                                        style={{
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            borderRadius: 999,
                                                            padding: "6px 10px",
                                                            border: "1px solid rgba(59,130,246,.28)",
                                                            background: "rgba(37,99,235,.10)",
                                                            color: "#7dd3fc",
                                                            fontWeight: 800,
                                                            fontSize: 12,
                                                        }}
                                                    >
                                                        {method.currency}
                                                    </span>
                                                    <button className="btn-ghost" style={{ width: "auto", color: "#ef4444", borderColor: "rgba(239,68,68,.35)" }} onClick={() => removeMethod(index)}>
                                                        Quitar
                                                    </button>
                                                </div>
                                            </div>

                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
                                                <label style={ADMIN_LABEL_STYLE}>
                                                    <span>Clave interna</span>
                                                    <input
                                                        style={ADMIN_FIELD_STYLE}
                                                        value={method.key}
                                                        onChange={(event) => updateMethod(index, "key", event.target.value.toLowerCase())}
                                                    />
                                                </label>
                                                <label style={ADMIN_LABEL_STYLE}>
                                                    <span>Nombre</span>
                                                    <input
                                                        style={ADMIN_FIELD_STYLE}
                                                        value={method.label}
                                                        onChange={(event) => updateMethod(index, "label", event.target.value)}
                                                    />
                                                </label>
                                                <label style={ADMIN_LABEL_STYLE}>
                                                    <span>Moneda</span>
                                                    <select style={ADMIN_FIELD_STYLE} value={method.currency} onChange={(event) => updateMethod(index, "currency", event.target.value)}>
                                                        {CURRENCY_OPTIONS.map((currency) => (
                                                            <option key={currency} value={currency}>{currency}</option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label style={ADMIN_LABEL_STYLE}>
                                                    <span>Monto minimo</span>
                                                    <input
                                                        style={ADMIN_FIELD_STYLE}
                                                        inputMode="numeric"
                                                        value={method.minAmount}
                                                        onChange={(event) => updateMethod(index, "minAmount", event.target.value)}
                                                    />
                                                </label>
                                            </div>

                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
                                                <label style={ADMIN_LABEL_STYLE}>
                                                    <span>Titular</span>
                                                    <input
                                                        style={ADMIN_FIELD_STYLE}
                                                        value={method.holderName}
                                                        onChange={(event) => updateMethod(index, "holderName", event.target.value)}
                                                    />
                                                </label>
                                                <label style={ADMIN_LABEL_STYLE}>
                                                    <span>Etiqueta cuenta</span>
                                                    <input
                                                        style={ADMIN_FIELD_STYLE}
                                                        value={method.accountLabel}
                                                        onChange={(event) => updateMethod(index, "accountLabel", event.target.value)}
                                                    />
                                                </label>
                                                <label style={ADMIN_LABEL_STYLE}>
                                                    <span>Dato cuenta</span>
                                                    <input
                                                        style={ADMIN_FIELD_STYLE}
                                                        value={method.accountValue}
                                                        onChange={(event) => updateMethod(index, "accountValue", event.target.value)}
                                                    />
                                                </label>
                                                <label style={ADMIN_LABEL_STYLE}>
                                                    <span>Tipo</span>
                                                    <input
                                                        style={ADMIN_FIELD_STYLE}
                                                        value={method.accountType}
                                                        onChange={(event) => updateMethod(index, "accountType", event.target.value)}
                                                    />
                                                </label>
                                            </div>

                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                                                <label style={ADMIN_LABEL_STYLE}>
                                                    <span>Alias</span>
                                                    <input
                                                        style={ADMIN_FIELD_STYLE}
                                                        value={method.accountAlias}
                                                        onChange={(event) => updateMethod(index, "accountAlias", event.target.value)}
                                                    />
                                                </label>
                                                <label style={ADMIN_LABEL_STYLE}>
                                                    <span>Instrucciones para el usuario</span>
                                                    <textarea
                                                        style={{ ...ADMIN_FIELD_STYLE, minHeight: 96, resize: "vertical" }}
                                                        value={method.instructions}
                                                        onChange={(event) => updateMethod(index, "instructions", event.target.value)}
                                                    />
                                                </label>
                                            </div>

                                            <div style={{ display: "grid", gridTemplateColumns: method.qrImageUrl ? "1.3fr .7fr" : "1fr", gap: 14, alignItems: "start" }}>
                                                <label style={ADMIN_LABEL_STYLE}>
                                                    <span>URL QR</span>
                                                    <input
                                                        style={ADMIN_FIELD_STYLE}
                                                        value={method.qrImageUrl || ""}
                                                        onChange={(event) => updateMethod(index, "qrImageUrl", event.target.value)}
                                                        placeholder="https://... o /images/payments/breb-qr.png"
                                                    />
                                                </label>
                                                {method.qrImageUrl ? (
                                                    <div style={{ display: "grid", gap: 8 }}>
                                                        <span style={{ ...ADMIN_LABEL_STYLE, gap: 0 }}>Vista previa QR</span>
                                                        <div
                                                            style={{
                                                                border: "1px solid var(--stroke)",
                                                                borderRadius: 16,
                                                                background: "#fff",
                                                                padding: 12,
                                                                minHeight: 120,
                                                                display: "grid",
                                                                placeItems: "center",
                                                            }}
                                                        >
                                                            <img
                                                                src={resolveQrImageUrl(method.qrImageUrl)}
                                                                alt={`QR ${method.label || index + 1}`}
                                                                style={{ maxWidth: "100%", maxHeight: 180, objectFit: "contain", display: "block" }}
                                                            />
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                    <button className="btn" style={{ width: "auto" }} onClick={saveConfig} disabled={configSaving}>
                                        {configSaving ? "Guardando..." : "Guardar metodos"}
                                    </button>
                                    {configMessage ? <span style={{ color: "#10b981", fontWeight: 700 }}>{configMessage}</span> : null}
                                    {configError ? <span style={{ color: "#ef4444", fontWeight: 700 }}>{configError}</span> : null}
                                </div>
                            </>
                        )}
                    </section>

                    <section style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>Solicitudes de recarga</div>
                        <div style={{ color: "var(--muted)", fontSize: 13 }}>
                            Filtra, revisa soportes y aprueba o rechaza las recargas pendientes.
                        </div>
                    </section>

                    <section style={{ display: "grid", gridTemplateColumns: "220px 1fr auto", gap: 12, alignItems: "end", marginBottom: 16 }}>
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
                            <input className="wallet-input" placeholder="Codigo, nombre, correo o metodo" value={query} onChange={(event) => setQuery(event.target.value)} />
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
                                const isSubmitted = String(item.status || "").toLowerCase() === "submitted";
                                return (
                                    <section
                                        key={item.id}
                                        style={{
                                            border: isSubmitted ? "1px solid rgba(245,158,11,.45)" : "1px solid var(--stroke)",
                                            borderRadius: 18,
                                            background: isSubmitted
                                                ? "linear-gradient(180deg, rgba(245,158,11,.08), var(--card2))"
                                                : "linear-gradient(180deg, var(--card), var(--card2))",
                                            boxShadow: isSubmitted ? "0 0 22px rgba(245,158,11,.08)" : "var(--shadow)",
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
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                                {isSubmitted ? (
                                                    <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "6px 12px", border: "1px solid rgba(245,158,11,.35)", background: "rgba(245,158,11,.12)", color: "#fbbf24", fontWeight: 900, fontSize: 12 }}>
                                                        Nueva
                                                    </span>
                                                ) : null}
                                                <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "6px 12px", border: `1px solid ${meta.color}55`, background: `${meta.color}18`, color: meta.color, fontWeight: 800, fontSize: 12 }}>
                                                    {meta.label}
                                                </span>
                                            </div>
                                        </div>

                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, alignItems: "end" }}>
                                                <div>
                                                    <div style={{ fontSize: 12, color: "var(--muted)" }}>Monto</div>
                                                    <div style={{ fontWeight: 800 }}>{Number(item.amount || 0).toLocaleString("es-CO")} {item.currency || "COP"}</div>
                                                </div>
                                                <div>
                                                <div style={{ fontSize: 12, color: "var(--muted)" }}>Metodo</div>
                                                <div style={{ fontWeight: 800 }}>{item.methodLabel || "-"}</div>
                                            </div>
                                                <div>
                                                    <div style={{ fontSize: 12, color: "var(--muted)" }}>Creada</div>
                                                    <div style={{ fontWeight: 700 }}>{new Date(item.createdAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Soporte</div>
                                                    {item.proofFileUrl ? (
                                                        <button className="btn" style={{ width: "auto" }} onClick={() => setPreviewItem(item)}>
                                                            Ver comprobante
                                                        </button>
                                                    ) : (
                                                        <span style={{ color: "var(--muted)", fontSize: 13 }}>Correo Bre-B</span>
                                                    )}
                                                </div>
                                            </div>

                                        {(item.payerName || item.autoValidationNote || item.matchedSenderName || item.matchedEmailReceivedAt) ? (
                                            <div
                                                style={{
                                                    borderRadius: 14,
                                                    border: "1px solid rgba(59,130,246,.18)",
                                                    background: "rgba(255,255,255,.02)",
                                                    padding: 12,
                                                    display: "grid",
                                                    gap: 6,
                                                    fontSize: 13,
                                                }}
                                            >
                                                {item.payerName ? <div><span style={{ color: "var(--muted)" }}>Girador declarado:</span> {item.payerName}</div> : null}
                                                {item.declaredPaidAt ? <div><span style={{ color: "var(--muted)" }}>Hora declarada:</span> {new Date(item.declaredPaidAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</div> : null}
                                                {item.matchedSenderName ? <div><span style={{ color: "var(--muted)" }}>Correo Bre-B:</span> {item.matchedSenderName}</div> : null}
                                                {item.matchedEmailAmount != null ? <div><span style={{ color: "var(--muted)" }}>Monto correo:</span> {Number(item.matchedEmailAmount).toLocaleString("es-CO")} {item.currency || "COP"}</div> : null}
                                                {item.matchedEmailReceivedAt ? <div><span style={{ color: "var(--muted)" }}>Hora correo:</span> {new Date(item.matchedEmailReceivedAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</div> : null}
                                                {item.autoValidationNote ? <div><span style={{ color: "var(--muted)" }}>Validación:</span> {item.autoValidationNote}</div> : null}
                                            </div>
                                        ) : null}

                                        {item.balanceAfter != null ? (
                                            <div style={{ fontSize: 13, color: "var(--muted)" }}>
                                                Saldo: {Number(item.balanceBefore || 0).toLocaleString("es-CO")} → {Number(item.balanceAfter || 0).toLocaleString("es-CO")} {item.currency || "COP"}
                                            </div>
                                        ) : null}

                                        <label className="wallet-label">
                                            <span>Nota admin</span>
                                            <textarea
                                                value={adminNoteDrafts[item.id] ?? item.adminNote ?? ""}
                                                onChange={(event) => setAdminNoteDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))}
                                                style={{ minHeight: 92, resize: "vertical", padding: 12, borderRadius: 14, border: "1px solid var(--input-stroke)", background: "var(--input-bg)", color: "var(--text)" }}
                                            />
                                        </label>

                                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                            <button className="btn-ghost" disabled={closed || savingId === item.id} onClick={() => updateStatus(item, "reviewing")}>
                                                Marcar revisando
                                            </button>
                                            <button className="btn" disabled={closed || savingId === item.id} onClick={() => updateStatus(item, "approved")}>
                                                Aprobar y recargar
                                            </button>
                                            <button className="btn-ghost" style={{ borderColor: "rgba(239,68,68,.35)", color: "#ef4444" }} disabled={closed || savingId === item.id} onClick={() => updateStatus(item, "rejected")}>
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

            {previewItem ? (
                <div
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setPreviewItem(null)}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(2,6,23,.72)",
                        backdropFilter: "blur(6px)",
                        display: "grid",
                        placeItems: "center",
                        zIndex: 1200,
                        padding: 24,
                    }}
                >
                    <div
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            width: "min(1100px, 96vw)",
                            maxHeight: "90vh",
                            overflow: "auto",
                            borderRadius: 22,
                            border: "1px solid var(--stroke)",
                            background: "linear-gradient(180deg, var(--card), var(--card2))",
                            boxShadow: "0 24px 80px rgba(0,0,0,.45)",
                            padding: 18,
                            display: "grid",
                            gap: 16,
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                            <div>
                                <div style={{ fontSize: 20, fontWeight: 900 }}>Comprobante de {previewItem.requestCode}</div>
                                <div style={{ color: "var(--muted)", marginTop: 4 }}>
                                    {previewItem.userName || previewItem.userEmail} · {Number(previewItem.amount || 0).toLocaleString("es-CO")} {previewItem.currency || "COP"}
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <a className="btn-ghost" style={{ width: "auto" }} href={previewItem.proofFileUrl} target="_blank" rel="noreferrer">
                                    Abrir aparte
                                </a>
                                <button className="btn-ghost" style={{ width: "auto" }} onClick={() => setPreviewItem(null)}>
                                    Cerrar
                                </button>
                            </div>
                        </div>

                        <div
                            style={{
                                borderRadius: 18,
                                border: "1px solid var(--stroke)",
                                background: "rgba(15,23,42,.45)",
                                minHeight: "60vh",
                                overflow: "hidden",
                                display: "grid",
                                placeItems: "center",
                            }}
                        >
                            {proofIsPdf(previewItem.proofFileUrl) ? (
                                <iframe
                                    title={`Comprobante ${previewItem.requestCode}`}
                                    src={previewItem.proofFileUrl}
                                    style={{ width: "100%", height: "70vh", border: 0, background: "#fff" }}
                                />
                            ) : (
                                <img
                                    alt={`Comprobante ${previewItem.requestCode}`}
                                    src={previewItem.proofFileUrl}
                                    style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }}
                                />
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
