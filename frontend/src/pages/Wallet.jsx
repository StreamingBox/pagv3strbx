import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import "../styles/dashboard.css";
import "../styles/wallet.css";

import Sidebar from "../components/dashboard/Sidebar.jsx";
import { apiGet, apiGetTransactions } from "../api/api";
import { buildApiUrl } from "../api/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import TransactionsList from "../components/wallet/TransactionsList.jsx";
import useAppLogout from "../hooks/useAppLogout.js";

const STATUS_META = {
    submitted: { label: "Enviada", color: "#f59e0b" },
    reviewing: { label: "Revisando", color: "#0ea5e9" },
    approved: { label: "Aprobada", color: "#10b981" },
    rejected: { label: "Rechazada", color: "#ef4444" },
};

export default function Wallet() {
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
            setSelectedMethodKey((prev) => prev || firstMethod);
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
            setFormSuccess("Comprobante cargado con exito. La recarga ya quedo en revision.");
            void loadRequests();
        } catch (error) {
            setFormError(error?.message || "No se pudo enviar la solicitud.");
        } finally {
            setSubmitting(false);
        }
    }

    const currency = String(wallet?.currency || "").toUpperCase();
    const highlightedStatus = useMemo(() => {
        const key = String(latestRequest?.status || "").toLowerCase();
        return STATUS_META[key] || null;
    }, [latestRequest?.status]);

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
                    onGoWallet={() => navigate("/wallet")}
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
                        <h1 className="wallet-title">Transacciones y Saldo</h1>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                        <section className="wallet-card" style={{ position: "relative", overflow: "hidden" }}>
                            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,rgba(13,166,242,0.06),transparent)", pointerEvents: "none" }} />
                            <div className="wallet-card__title" style={{ fontSize: 10, letterSpacing: "0.8px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
                                Saldo disponible
                            </div>
                            <div className="wallet-balance" style={{ fontSize: 24 }}>
                                {Number(wallet?.balance || 0).toLocaleString("es-CO")}
                                <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 6, fontWeight: 700, background: "rgba(13,166,242,0.12)", border: "1px solid rgba(13,166,242,0.25)", borderRadius: 6, padding: "1px 6px" }}>
                                    {wallet?.currency || "COP"}
                                </span>
                            </div>
                            <div className="wallet-meta" style={{ marginTop: 6 }}>
                                <span className="wallet-meta__label">Moneda: </span>
                                <b>{currency || "-"}</b>
                            </div>
                        </section>

                        <section className="wallet-card" style={{ position: "relative", overflow: "hidden" }}>
                            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,rgba(16,185,129,0.06),transparent)", pointerEvents: "none" }} />
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                <span style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(16,185,129,0.18)", border: "1px solid rgba(16,185,129,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>+</span>
                                <div className="wallet-card__title" style={{ fontSize: 10, letterSpacing: "0.8px", textTransform: "uppercase", color: "var(--muted)", margin: 0 }}>
                                    Ganancia obtenida
                                </div>
                            </div>
                            <div className="wallet-balance" style={{ color: "#10b981", fontSize: 24 }}>
                                {Number(wallet?.profit_total || 0).toLocaleString("es-CO")}
                                <span className="wallet-balance__cur" style={{ color: "rgba(16,185,129,0.6)" }}>
                                    {wallet?.currency || "COP"}
                                </span>
                            </div>
                            <div className="wallet-meta" style={{ marginTop: 6 }}>
                                <span className="wallet-meta__label">Acumulada por ventas</span>
                            </div>
                        </section>
                    </div>

                    <section style={{ borderRadius: "var(--radius2)", border: "1px solid rgba(19,200,236,0.3)", background: "linear-gradient(135deg, rgba(19,200,236,0.07) 0%, rgba(13,166,242,0.04) 100%)", backdropFilter: "blur(14px)", boxShadow: "0 0 20px rgba(19,200,236,0.08), var(--shadow)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, marginBottom: 14, borderLeft: "3px solid #13c8ec" }}>
                        <span style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(19,200,236,0.15)", border: "1px solid rgba(19,200,236,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: "#13c8ec", flexShrink: 0 }}>$</span>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#13c8ec", marginBottom: 2 }}>Inversion total</div>
                            <div style={{ fontSize: 12, color: "var(--muted)" }}>Total gastado en compras</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 26, fontWeight: 900, color: "#13c8ec", letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums" }}>
                                {Number(wallet?.total_invested || 0).toLocaleString("es-CO")}
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(19,200,236,0.6)", fontWeight: 700 }}>
                                {wallet?.currency || "COP"}
                            </div>
                        </div>
                    </section>

                    <section className="wallet-card" style={{ marginBottom: 14 }}>
                        <div className="wallet-card__title">Recargar saldo</div>

                        {availableMethods.length ? (
                            <>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 14, marginBottom: 14 }}>
                                    {availableMethods.map((method) => {
                                        const active = method.key === selectedMethod?.key;
                                        return (
                                            <button
                                                key={method.key}
                                                type="button"
                                                onClick={() => setSelectedMethodKey(method.key)}
                                                style={{
                                                    borderRadius: 16,
                                                    border: active ? "1px solid rgba(59,130,246,.7)" : "1px solid var(--stroke)",
                                                    background: active ? "rgba(37,99,235,0.12)" : "rgba(255,255,255,0.02)",
                                                    color: "var(--text)",
                                                    padding: 14,
                                                    textAlign: "left",
                                                    cursor: "pointer",
                                                }}
                                            >
                                                <div style={{ fontWeight: 800, marginBottom: 6 }}>{method.label}</div>
                                                <div className="wallet-small" style={{ marginTop: 0 }}>
                                                    Minimo: {Number(method.minAmount || 0).toLocaleString("es-CO")} {method.currency}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {selectedMethod ? (
                                    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14, marginTop: 4 }}>
                                        <div style={{ display: "grid", gap: 12 }}>
                                            <label className="wallet-label">
                                                <span>Monto a recargar ({currency || selectedMethod.currency})</span>
                                                <input className="wallet-input" inputMode="numeric" placeholder={`Ej: ${selectedMethod.minAmount || 0}`} value={amount} onChange={(event) => setAmount(event.target.value)} />
                                            </label>

                                            <label style={{ border: "1px dashed rgba(148,163,184,0.45)", borderRadius: 16, padding: 18, background: "rgba(255,255,255,0.02)", cursor: "pointer", minHeight: 150, display: "grid", placeItems: "center", textAlign: "center" }}>
                                                <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" style={{ display: "none" }} onChange={(event) => setProofFile(event.target.files?.[0] || null)} />
                                                <div>
                                                    <div style={{ fontSize: 28, marginBottom: 8 }}>↑</div>
                                                    <div style={{ fontWeight: 800, marginBottom: 6 }}>{proofFile ? proofFile.name : "Sube tu comprobante"}</div>
                                                    <div className="wallet-small">JPG, PNG, WEBP o PDF. Maximo 5MB.</div>
                                                </div>
                                            </label>

                                            <button className="btn" onClick={submitManualTopup} disabled={submitting}>
                                                {submitting ? "Enviando..." : "Enviar solicitud"}
                                            </button>

                                            <div className="wallet-small" style={{ marginTop: 0 }}>
                                                Carga el reporte de recarga aqui. El administrador lo revisa y luego te acredita el saldo.
                                            </div>
                                        </div>

                                        <div style={{ borderRadius: 18, border: "1px solid rgba(59,130,246,0.55)", background: "rgba(37,99,235,0.08)", padding: 16, display: "grid", gap: 12, alignContent: "start" }}>
                                            <div style={{ fontSize: 18, fontWeight: 800 }}>Datos para transferir</div>
                                            <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                                    <span style={{ color: "var(--muted)" }}>Metodo:</span>
                                                    <strong>{selectedMethod.label}</strong>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                                    <span style={{ color: "var(--muted)" }}>Titular:</span>
                                                    <strong>{selectedMethod.holderName || "-"}</strong>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                                    <span style={{ color: "var(--muted)" }}>{selectedMethod.accountLabel || "Cuenta"}:</span>
                                                    <strong>{selectedMethod.accountValue || "-"}</strong>
                                                </div>
                                                {selectedMethod.accountAlias ? (
                                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                                        <span style={{ color: "var(--muted)" }}>Alias:</span>
                                                        <strong>{selectedMethod.accountAlias}</strong>
                                                    </div>
                                                ) : null}
                                                {selectedMethod.accountType ? (
                                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                                        <span style={{ color: "var(--muted)" }}>Tipo:</span>
                                                        <strong>{selectedMethod.accountType}</strong>
                                                    </div>
                                                ) : null}
                                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                                    <span style={{ color: "var(--muted)" }}>Monto minimo:</span>
                                                    <strong>{Number(selectedMethod.minAmount || 0).toLocaleString("es-CO")} {selectedMethod.currency}</strong>
                                                </div>
                                            </div>

                                            <button
                                                className="btn-ghost"
                                                style={{ marginTop: 4 }}
                                                onClick={async () => {
                                                    const lines = [
                                                        `${selectedMethod.label}`,
                                                        `${selectedMethod.accountLabel || "Cuenta"}: ${selectedMethod.accountValue || ""}`,
                                                        selectedMethod.accountAlias ? `Alias: ${selectedMethod.accountAlias}` : "",
                                                        selectedMethod.holderName ? `Titular: ${selectedMethod.holderName}` : "",
                                                    ].filter(Boolean).join("\n");
                                                    await navigator.clipboard.writeText(lines);
                                                }}
                                            >
                                                Copiar datos
                                            </button>

                                            {selectedMethod.instructions ? (
                                                <div className="wallet-small" style={{ marginTop: 0 }}>
                                                    {selectedMethod.instructions}
                                                </div>
                                            ) : null}

                                            {latestRequest ? (
                                                <div style={{ marginTop: 8, padding: 12, borderRadius: 14, background: "rgba(15,23,42,0.28)", border: "1px solid rgba(148,163,184,0.2)" }}>
                                                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Ultima solicitud</div>
                                                    <div style={{ fontWeight: 800, marginBottom: 4 }}>{latestRequest.requestCode}</div>
                                                    <div style={{ fontSize: 14, marginBottom: 8 }}>
                                                        {Number(latestRequest.amount || 0).toLocaleString("es-CO")} {latestRequest.currency || currency}
                                                    </div>
                                                    {highlightedStatus ? (
                                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "6px 10px", border: `1px solid ${highlightedStatus.color}55`, background: `${highlightedStatus.color}18`, color: highlightedStatus.color, fontWeight: 700, fontSize: 12 }}>
                                                            {highlightedStatus.label}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                ) : null}

                                {formError ? <div className="error" style={{ marginTop: 12 }}>{formError}</div> : null}
                                {formSuccess ? <div className="wallet-success">{formSuccess}</div> : null}

                                {requests.length ? (
                                    <div style={{ marginTop: 18 }}>
                                        <div className="wallet-card__title" style={{ marginBottom: 10 }}>Tus solicitudes</div>
                                        <div style={{ display: "grid", gap: 10 }}>
                                            {requests.map((item) => {
                                                const meta = STATUS_META[String(item.status || "").toLowerCase()] || { label: item.status, color: "#94a3b8" };
                                                return (
                                                    <div key={item.id} style={{ border: "1px solid var(--stroke)", borderRadius: 14, padding: 14, background: "rgba(255,255,255,0.02)", display: "grid", gap: 8 }}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                                                            <div>
                                                                <div style={{ fontWeight: 800 }}>{item.requestCode}</div>
                                                                <div className="wallet-small" style={{ marginTop: 2 }}>
                                                                    {item.methodLabel} · {Number(item.amount || 0).toLocaleString("es-CO")} {item.currency || currency}
                                                                </div>
                                                            </div>
                                                            <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "6px 10px", border: `1px solid ${meta.color}55`, background: `${meta.color}18`, color: meta.color, fontWeight: 700, fontSize: 12 }}>
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
                                    </div>
                                ) : null}
                            </>
                        ) : (
                            <div className="wallet-small" style={{ marginTop: 10 }}>
                                No hay medios de pago configurados para tu moneda.
                            </div>
                        )}
                    </section>

                    <TransactionsList fetchFn={(query) => apiGetTransactions(query)} />
                </main>
            </div>
        </div>
    );
}
