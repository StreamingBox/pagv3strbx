import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import "../styles/dashboard.css";
import "../styles/wallet.css";

import Sidebar from "../components/dashboard/Sidebar.jsx";
import { apiGet } from "../api/api";
import { buildApiUrl } from "../api/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import useAppLogout from "../hooks/useAppLogout.js";

const STATUS_META = {
    submitted: { label: "Enviada", color: "#f59e0b" },
    reviewing: { label: "Revisando", color: "#0ea5e9" },
    approved: { label: "Aprobada", color: "#10b981" },
    rejected: { label: "Rechazada", color: "#ef4444" },
};

export default function Topups() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const logout = useAppLogout();

    const [wallet, setWallet] = useState(null);
    const [topupConfig, setTopupConfig] = useState({ currency: "", methods: [] });
    const [selectedMethodKey, setSelectedMethodKey] = useState("");
    const [requests, setRequests] = useState([]);
    const [amount, setAmount] = useState("");
    const [proofFile, setProofFile] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");
    const [formSuccess, setFormSuccess] = useState("");

    async function loadWallet() {
        const response = await apiGet("/wallet");
        if (response.ok) setWallet(response.data);
    }

    async function loadTopupConfig() {
        const response = await apiGet("/wallet/manual-topups/config");
        if (response.ok) {
            const config = response.data?.config || { currency: "", methods: [] };
            setTopupConfig(config);
            const firstMethod = Array.isArray(config.methods) ? config.methods[0]?.key || "" : "";
            setSelectedMethodKey((prev) => (config.methods.some((item) => item.key === prev) ? prev : firstMethod));
        }
    }

    async function loadRequests() {
        const response = await apiGet("/wallet/manual-topups");
        if (response.ok) setRequests(Array.isArray(response.data?.items) ? response.data.items : []);
    }

    useEffect(() => {
        void loadWallet();
        void loadTopupConfig();
        void loadRequests();
    }, []);

    const availableMethods = Array.isArray(topupConfig.methods) ? topupConfig.methods : [];
    const selectedMethod = availableMethods.find((item) => item.key === selectedMethodKey) || availableMethods[0] || null;
    const latestRequest = requests[0] || null;
    const currency = String(wallet?.currency || topupConfig.currency || "").toUpperCase();

    const highlightedStatus = useMemo(() => {
        const key = String(latestRequest?.status || "").toLowerCase();
        return STATUS_META[key] || null;
    }, [latestRequest?.status]);

    useEffect(() => {
        if (!selectedMethod && availableMethods.length) {
            setSelectedMethodKey(availableMethods[0].key);
        }
    }, [selectedMethod, availableMethods]);

    async function submitManualTopup() {
        setFormError("");
        setFormSuccess("");

        if (!selectedMethod?.key) {
            setFormError("Selecciona un medio de pago.");
            return;
        }

        if (!proofFile) {
            setFormError("Debes adjuntar el comprobante.");
            return;
        }

        const normalizedAmount = Number(String(amount || "").replace(/[^\d.]/g, ""));
        if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
            setFormError("Ingresa un monto valido.");
            return;
        }

        const form = new FormData();
        form.append("amount", String(normalizedAmount));
        form.append("methodKey", selectedMethod.key);
        form.append("proof", proofFile);

        setSubmitting(true);
        try {
            const response = await fetch(buildApiUrl("/wallet/manual-topups"), {
                method: "POST",
                credentials: "include",
                body: form,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data?.message || "No se pudo enviar la solicitud.");

            setAmount("");
            setProofFile(null);
            setFormSuccess("Comprobante cargado con exito. Tu recarga quedo en revision.");
            await loadRequests();
        } catch (error) {
            setFormError(error?.message || "No se pudo enviar la solicitud.");
        } finally {
            setSubmitting(false);
        }
    }

    async function copyMethodData() {
        if (!selectedMethod) return;
        const lines = [
            `${selectedMethod.label}`,
            `${selectedMethod.accountLabel || "Cuenta"}: ${selectedMethod.accountValue || ""}`,
            selectedMethod.accountAlias ? `Alias: ${selectedMethod.accountAlias}` : "",
            selectedMethod.holderName ? `Titular: ${selectedMethod.holderName}` : "",
        ].filter(Boolean).join("\n");
        await navigator.clipboard.writeText(lines);
    }

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden>
                <div className="bg-orb orb-1" />
                <div className="bg-orb orb-2" />
                <div className="bg-grid" />
            </div>

            <div className="page-inner">
                <Sidebar
                    user={user}
                    wallet={wallet}
                    cartCount={0}
                    onOpenCart={() => {}}
                    onGoOrders={() => navigate("/orders")}
                    onGoRenewals={() => navigate("/renewals")}
                    onGoWallet={() => navigate("/topups")}
                    onGoAnalytics={() => navigate("/analytics")}
                    onGoCodes={() => navigate("/codes")}
                    onGoCodeLogs={() => navigate("/admin/code-logs")}
                    onGoAdmin={() => navigate("/admin")}
                    onGoExpirations={() => navigate("/expirations")}
                    onGoHome={() => navigate("/dashboard")}
                    onLogout={logout}
                />

                <main className="main">
                    <div className="wallet-topbar">
                        <button className="btn-ghost" onClick={() => navigate("/dashboard")}>
                            {"<-"} Volver
                        </button>
                        <h1 className="wallet-title">Recargas</h1>
                    </div>

                    <section className="wallet-card topups-hero-grid" style={{ marginBottom: 16 }}>
                        <div>
                            <div className="wallet-card__title" style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase" }}>
                                Recargar saldo
                            </div>
                            <h2 style={{ margin: "8px 0 6px", fontSize: 30, lineHeight: 1, fontWeight: 900 }}>
                                Carga tu comprobante y nosotros validamos la recarga.
                            </h2>
                            <p style={{ margin: 0, color: "var(--muted)", maxWidth: 620 }}>
                                Selecciona el medio disponible para tu moneda, realiza la transferencia y sube el soporte.
                            </p>
                        </div>

                        <div
                            style={{
                                borderRadius: 18,
                                border: "1px solid rgba(59,130,246,.28)",
                                background: "linear-gradient(135deg, rgba(37,99,235,.14), rgba(15,23,42,.32))",
                                padding: 18,
                                display: "grid",
                                gap: 10,
                                alignContent: "start",
                            }}
                        >
                            <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>
                                Tu saldo actual
                            </div>
                            <div style={{ fontSize: 34, fontWeight: 900 }}>
                                {Number(wallet?.balance || 0).toLocaleString("es-CO")}
                                <span style={{ fontSize: 14, marginLeft: 8, color: "var(--muted)" }}>{wallet?.currency || "-"}</span>
                            </div>
                            {latestRequest ? (
                                <div style={{ marginTop: 8, padding: 12, borderRadius: 14, background: "rgba(15,23,42,.28)", border: "1px solid rgba(148,163,184,.18)" }}>
                                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Ultima solicitud</div>
                                    <div style={{ fontWeight: 800 }}>{latestRequest.requestCode}</div>
                                    <div style={{ margin: "6px 0 10px" }}>
                                        {Number(latestRequest.amount || 0).toLocaleString("es-CO")} {latestRequest.currency || currency}
                                    </div>
                                    {highlightedStatus ? (
                                        <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "6px 10px", border: `1px solid ${highlightedStatus.color}55`, background: `${highlightedStatus.color}18`, color: highlightedStatus.color, fontWeight: 800, fontSize: 12 }}>
                                            {highlightedStatus.label}
                                        </span>
                                    ) : null}
                                </div>
                            ) : (
                                <div style={{ color: "var(--muted)", fontSize: 13 }}>Aun no tienes solicitudes de recarga.</div>
                            )}
                        </div>
                    </section>

                    <section className="wallet-card" style={{ marginBottom: 16 }}>
                        <div className="wallet-card__title">Medios disponibles</div>

                        {availableMethods.length ? (
                            <>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginTop: 14, marginBottom: 16 }}>
                                    {availableMethods.map((method) => {
                                        const active = method.key === selectedMethod?.key;
                                        return (
                                            <button
                                                key={method.key}
                                                type="button"
                                                onClick={() => setSelectedMethodKey(method.key)}
                                                style={{
                                                    borderRadius: 18,
                                                    border: active ? "1px solid rgba(59,130,246,.75)" : "1px solid var(--stroke)",
                                                    background: active ? "linear-gradient(135deg, rgba(37,99,235,.18), rgba(15,23,42,.36))" : "rgba(255,255,255,.02)",
                                                    color: "var(--text)",
                                                    padding: 16,
                                                    textAlign: "left",
                                                    cursor: "pointer",
                                                }}
                                            >
                                                <div style={{ fontWeight: 900, marginBottom: 6, fontSize: 17 }}>{method.label}</div>
                                                <div className="wallet-small" style={{ marginTop: 0 }}>
                                                    Minimo: {Number(method.minAmount || 0).toLocaleString("es-CO")} {method.currency}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {selectedMethod ? (
                                    <div className="topups-form-grid">
                                        <div style={{ display: "grid", gap: 12 }}>
                                            <label className="wallet-label">
                                                <span>Monto a recargar ({currency || selectedMethod.currency})</span>
                                                <input
                                                    className="wallet-input"
                                                    inputMode="numeric"
                                                    placeholder={`Ej: ${selectedMethod.minAmount || 0}`}
                                                    value={amount}
                                                    onChange={(event) => setAmount(event.target.value)}
                                                />
                                            </label>

                                            <label
                                                style={{
                                                    border: "1px dashed rgba(148,163,184,.45)",
                                                    borderRadius: 18,
                                                    padding: 22,
                                                    background: "rgba(255,255,255,.02)",
                                                    cursor: "pointer",
                                                    minHeight: 180,
                                                    display: "grid",
                                                    placeItems: "center",
                                                    textAlign: "center",
                                                }}
                                            >
                                                <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" style={{ display: "none" }} onChange={(event) => setProofFile(event.target.files?.[0] || null)} />
                                                <div>
                                                    <div style={{ fontSize: 30, marginBottom: 10 }}>↑</div>
                                                    <div style={{ fontWeight: 900, marginBottom: 6 }}>{proofFile ? proofFile.name : "Sube tu comprobante"}</div>
                                                    <div className="wallet-small">JPG, PNG, WEBP o PDF. Maximo 5MB.</div>
                                                </div>
                                            </label>

                                            <button className="btn" onClick={submitManualTopup} disabled={submitting}>
                                                {submitting ? "Enviando..." : "Enviar recarga"}
                                            </button>

                                            {formError ? <div className="error" style={{ marginTop: 0 }}>{formError}</div> : null}
                                            {formSuccess ? <div className="wallet-success">{formSuccess}</div> : null}
                                        </div>

                                        <div
                                            style={{
                                                borderRadius: 20,
                                                border: "1px solid rgba(59,130,246,.45)",
                                                background: "linear-gradient(135deg, rgba(37,99,235,.1), rgba(15,23,42,.26))",
                                                padding: 18,
                                                display: "grid",
                                                gap: 12,
                                                alignContent: "start",
                                            }}
                                        >
                                            <div style={{ fontSize: 19, fontWeight: 900 }}>Datos para transferir</div>
                                            <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                                    <span style={{ color: "var(--muted)" }}>Metodo</span>
                                                    <strong>{selectedMethod.label}</strong>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                                    <span style={{ color: "var(--muted)" }}>Titular</span>
                                                    <strong>{selectedMethod.holderName || "-"}</strong>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                                    <span style={{ color: "var(--muted)" }}>{selectedMethod.accountLabel || "Cuenta"}</span>
                                                    <strong>{selectedMethod.accountValue || "-"}</strong>
                                                </div>
                                                {selectedMethod.accountAlias ? (
                                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                                        <span style={{ color: "var(--muted)" }}>Alias</span>
                                                        <strong>{selectedMethod.accountAlias}</strong>
                                                    </div>
                                                ) : null}
                                                {selectedMethod.accountType ? (
                                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                                        <span style={{ color: "var(--muted)" }}>Tipo</span>
                                                        <strong>{selectedMethod.accountType}</strong>
                                                    </div>
                                                ) : null}
                                            </div>

                                            <button className="btn-ghost" style={{ marginTop: 6 }} onClick={copyMethodData}>
                                                Copiar datos
                                            </button>

                                            {selectedMethod.instructions ? (
                                                <div className="wallet-small" style={{ marginTop: 0 }}>
                                                    {selectedMethod.instructions}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                ) : null}
                            </>
                        ) : (
                            <div
                                style={{
                                    marginTop: 14,
                                    borderRadius: 16,
                                    border: "1px solid rgba(148,163,184,.18)",
                                    background: "rgba(255,255,255,.02)",
                                    padding: 18,
                                    color: "var(--muted)",
                                }}
                            >
                                No hay medios de pago configurados para <b>{currency || "tu moneda"}</b>.
                            </div>
                        )}
                    </section>

                    <section className="wallet-card">
                        <div className="wallet-card__title">Historial de recargas</div>
                        {requests.length ? (
                            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                                {requests.map((item) => {
                                    const meta = STATUS_META[String(item.status || "").toLowerCase()] || { label: item.status, color: "#94a3b8" };
                                    return (
                                        <div key={item.id} style={{ border: "1px solid var(--stroke)", borderRadius: 16, padding: 14, background: "rgba(255,255,255,.02)", display: "grid", gap: 8 }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                                                <div>
                                                    <div style={{ fontWeight: 900 }}>{item.requestCode}</div>
                                                    <div className="wallet-small" style={{ marginTop: 2 }}>
                                                        {item.methodLabel} · {Number(item.amount || 0).toLocaleString("es-CO")} {item.currency || currency}
                                                    </div>
                                                </div>
                                                <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "6px 10px", border: `1px solid ${meta.color}55`, background: `${meta.color}18`, color: meta.color, fontWeight: 800, fontSize: 12 }}>
                                                    {meta.label}
                                                </span>
                                            </div>

                                            <div className="wallet-small" style={{ marginTop: 0 }}>
                                                Creada: {new Date(item.createdAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}
                                            </div>
                                            {item.adminNote ? <div className="wallet-small" style={{ marginTop: 0 }}>Nota admin: {item.adminNote}</div> : null}
                                            <a className="wallet-link" href={item.proofFileUrl} target="_blank" rel="noreferrer">Ver comprobante</a>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="wallet-small" style={{ marginTop: 12 }}>
                                Aun no has enviado recargas.
                            </div>
                        )}
                    </section>
                </main>
            </div>
        </div>
    );
}
