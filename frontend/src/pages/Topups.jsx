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
const HISTORY_PAGE_SIZE = 5;

function displayTopupCurrency(value) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "USD") return "USDT";
    return normalized || String(value || "").trim();
}

function resolveQrImageUrl(value) {
    const input = String(value || "").trim();
    if (!input) return "";

    try {
        if (input.startsWith("/")) {
            return `${window.location.origin}${input}`;
        }
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

export default function Topups() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const logout = useAppLogout();

    const [wallet, setWallet] = useState(null);
    const [topupConfig, setTopupConfig] = useState({ currency: "", methods: [] });
    const [selectedMethodKey, setSelectedMethodKey] = useState("");
    const [requests, setRequests] = useState([]);
    const [amount, setAmount] = useState("");
    const [payerName, setPayerName] = useState("");
    const [proofFile, setProofFile] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");
    const [formSuccess, setFormSuccess] = useState("");
    const [historyStatus, setHistoryStatus] = useState("all");
    const [historyQuery, setHistoryQuery] = useState("");
    const [historyPage, setHistoryPage] = useState(1);

    async function loadWallet() {
        const response = await apiGet("/wallet");
        if (response.ok) setWallet(response.data);
    }

    async function loadTopupConfig() {
        const response = await apiGet("/wallet/manual-topups/config");
        if (response.ok) {
            const config = response.data?.config || { currency: "", methods: [] };
            const methods = Array.isArray(config.methods) ? config.methods : [];
            setTopupConfig({ ...config, methods });
            const firstMethod = methods[0]?.key || "";
            setSelectedMethodKey((prev) => (methods.some((item) => item.key === prev) ? prev : firstMethod));
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
    const selectedQrUrl = selectedMethod?.qrImageUrl ? resolveQrImageUrl(selectedMethod.qrImageUrl) : "";
    const selectedQrSrc = selectedQrUrl
        ? `${selectedQrUrl}${selectedQrUrl.includes("?") ? "&" : "?"}preview=${encodeURIComponent(selectedMethod?.qrImageUrl || "")}`
        : "";
    const latestRequest = requests[0] || null;
    const currency = String(wallet?.currency || topupConfig.currency || "").toUpperCase();
    const displayCurrency = displayTopupCurrency(currency);
    const isBreb = selectedMethod?.key === "breb";
    const isBinance = selectedMethod?.key === "binance";

    const highlightedStatus = useMemo(() => {
        const key = String(latestRequest?.status || "").toLowerCase();
        return STATUS_META[key] || null;
    }, [latestRequest?.status]);
    const filteredRequests = useMemo(() => {
        const query = String(historyQuery || "").trim().toLowerCase();
        return requests.filter((item) => {
            const status = String(item?.status || "").toLowerCase();
            if (historyStatus !== "all" && status !== historyStatus) return false;
            if (!query) return true;

            const haystack = [
                item?.requestCode,
                item?.methodLabel,
                item?.payerName,
                item?.adminNote,
                item?.autoValidationNote,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return haystack.includes(query);
        });
    }, [requests, historyQuery, historyStatus]);
    const totalHistoryPages = Math.max(Math.ceil(filteredRequests.length / HISTORY_PAGE_SIZE), 1);
    const paginatedRequests = useMemo(() => {
        const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
        return filteredRequests.slice(start, start + HISTORY_PAGE_SIZE);
    }, [filteredRequests, historyPage]);
    const hasOpenRequests = requests.some((item) => {
        const status = String(item?.status || "").toLowerCase();
        return status === "submitted" || status === "reviewing";
    });

    useEffect(() => {
        if (!selectedMethod && availableMethods.length) {
            setSelectedMethodKey(availableMethods[0].key);
        }
    }, [selectedMethod, availableMethods]);

    useEffect(() => {
        setHistoryPage(1);
    }, [historyStatus, historyQuery]);

    useEffect(() => {
        if (historyPage > totalHistoryPages) {
            setHistoryPage(totalHistoryPages);
        }
    }, [historyPage, totalHistoryPages]);

    useEffect(() => {
        if (!hasOpenRequests) return undefined;

        const refresh = () => {
            void loadRequests();
            void loadWallet();
        };

        const intervalId = window.setInterval(() => {
            if (document.visibilityState === "visible") {
                refresh();
            }
        }, 8000);

        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                refresh();
            }
        };

        document.addEventListener("visibilitychange", handleVisibility);
        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [hasOpenRequests]);

    async function submitManualTopup() {
        setFormError("");
        setFormSuccess("");

        if (!selectedMethod?.key) {
            setFormError("Selecciona un medio de pago.");
            return;
        }

        const normalizedAmount = Number(String(amount || "").replace(/[^\d.]/g, ""));
        if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
            setFormError("Ingresa un monto válido.");
            return;
        }

        if (isBreb || isBinance) {
            if (!payerName.trim()) {
                setFormError(isBreb ? "Debes indicar el nombre de la persona que hizo el giro." : "Debes indicar el usuario o nombre del remitente.");
                return;
            }
        }

        if (!isBreb && !proofFile) {
            setFormError("Debes adjuntar el comprobante.");
            return;
        }

        const form = new FormData();
        form.append("amount", String(normalizedAmount));
        form.append("methodKey", selectedMethod.key);
        if (isBreb || isBinance) {
            form.append("payerName", payerName.trim());
        }
        if (proofFile) {
            form.append("proof", proofFile);
        }

        setSubmitting(true);
        try {
            const response = await fetch(buildApiUrl("/wallet/manual-topups"), {
                method: "POST",
                credentials: "include",
                body: form,
            });
            if (response.status === 413) {
                throw new Error("El comprobante supera el tamaño permitido. Usa un archivo de máximo 5MB.");
            }
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data?.message || "No se pudo enviar la solicitud.");

            setAmount("");
            setPayerName("");
            setProofFile(null);
            setFormSuccess(
                isBreb
                    ? "Solicitud Bre-B enviada. La recarga se validará según los datos del giro y el medio de pago usado."
                    : isBinance
                        ? "Solicitud Binance enviada. La recarga se validará según el monto, el remitente y el soporte cargado."
                    : "Comprobante cargado con éxito. Tu recarga quedó en revisión."
            );
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
                                {isBreb
                                    ? "Paga por Bre-B y registramos la recarga automáticamente."
                                    : isBinance
                                        ? "Paga por Binance y validamos la recarga automáticamente."
                                    : "Carga tu comprobante y nosotros validamos la recarga."}
                            </h2>
                            <p style={{ margin: 0, color: "var(--muted)", maxWidth: 620 }}>
                                {isBreb
                                    ? "Usa únicamente llaves Bre-B. Si el pago no se registra correctamente, la solicitud pasará a segunda validación."
                                    : isBinance
                                        ? "Registra el monto y el remitente tal como aparecen en Binance. Si no coincide, la solicitud pasará a revisión manual."
                                    : "Selecciona el medio disponible para tu moneda, realiza la transferencia y sube el soporte."}
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
                                <span style={{ fontSize: 14, marginLeft: 8, color: "var(--muted)" }}>{displayTopupCurrency(wallet?.currency) || "-"}</span>
                            </div>
                            {latestRequest ? (
                                <div style={{ marginTop: 8, padding: 12, borderRadius: 14, background: "rgba(15,23,42,.28)", border: "1px solid rgba(148,163,184,.18)" }}>
                                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Última solicitud</div>
                                    <div style={{ fontWeight: 800 }}>{latestRequest.requestCode}</div>
                                    <div style={{ margin: "6px 0 10px" }}>
                                        {Number(latestRequest.amount || 0).toLocaleString("es-CO")} {displayTopupCurrency(latestRequest.currency || currency)}
                                    </div>
                                    {highlightedStatus ? (
                                        <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "6px 10px", border: `1px solid ${highlightedStatus.color}55`, background: `${highlightedStatus.color}18`, color: highlightedStatus.color, fontWeight: 800, fontSize: 12 }}>
                                            {highlightedStatus.label}
                                        </span>
                                    ) : null}
                                </div>
                            ) : (
                                <div style={{ color: "var(--muted)", fontSize: 13 }}>Aún no tienes solicitudes de recarga.</div>
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
                                                    Mínimo: {Number(method.minAmount || 0).toLocaleString("es-CO")} {displayTopupCurrency(method.currency)}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {selectedMethod ? (
                                    <div className="topups-form-grid">
                                        <div style={{ display: "grid", gap: 12 }}>
                                            <label className="wallet-label">
                                                <span>Monto a recargar ({displayTopupCurrency(currency || selectedMethod.currency)})</span>
                                                <input
                                                    className="wallet-input"
                                                    inputMode="numeric"
                                                    placeholder={`Ej: ${selectedMethod.minAmount || 0}`}
                                                    value={amount}
                                                    onChange={(event) => setAmount(event.target.value)}
                                                />
                                            </label>

                                            {isBreb ? (
                                                <>
                                                    <label className="wallet-label">
                                                        <span>Nombre de la persona que giró</span>
                                                        <input
                                                            className="wallet-input"
                                                            placeholder="Ej: Natalia Ortiz"
                                                            value={payerName}
                                                            onChange={(event) => setPayerName(event.target.value)}
                                                        />
                                                    </label>

                                                    <label
                                                        style={{
                                                            border: "1px dashed rgba(148,163,184,.45)",
                                                            borderRadius: 18,
                                                            padding: 22,
                                                            background: "rgba(255,255,255,.02)",
                                                            cursor: "pointer",
                                                            minHeight: 160,
                                                            display: "grid",
                                                            placeItems: "center",
                                                            textAlign: "center",
                                                        }}
                                                    >
                                                        <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" style={{ display: "none" }} onChange={(event) => setProofFile(event.target.files?.[0] || null)} />
                                                        <div>
                                                            <div style={{ fontSize: 30, marginBottom: 10 }}>↑</div>
                                                            <div style={{ fontWeight: 900, marginBottom: 6 }}>{proofFile ? proofFile.name : "Adjunta tu soporte si lo tienes"}</div>
                                                            <div className="wallet-small">Opcional. JPG, PNG, WEBP o PDF. Máximo 5MB.</div>
                                                        </div>
                                                    </label>

                                                    <div
                                                        style={{
                                                            borderRadius: 16,
                                                            border: "1px solid rgba(245,158,11,.32)",
                                                            background: "rgba(245,158,11,.08)",
                                                            color: "#fcd34d",
                                                            padding: 14,
                                                            fontSize: 13,
                                                            lineHeight: 1.5,
                                                        }}
                                                    >
                                                        El registro inmediato solo aplica para pagos enviados por <b>llaves Bre-B</b>. Asegúrate de registrar correctamente el monto y el nombre del girador.
                                                    </div>
                                                </>
                                            ) : isBinance ? (
                                                <>
                                                    <label className="wallet-label">
                                                        <span>Usuario o nombre del remitente</span>
                                                        <input
                                                            className="wallet-input"
                                                            placeholder="Ej: Elysiu26"
                                                            value={payerName}
                                                            onChange={(event) => setPayerName(event.target.value)}
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
                                                            <div style={{ fontWeight: 900, marginBottom: 6 }}>{proofFile ? proofFile.name : "Sube tu comprobante de Binance"}</div>
                                                            <div className="wallet-small">JPG, PNG, WEBP o PDF. Máximo 5MB.</div>
                                                        </div>
                                                    </label>

                                                    <div
                                                        style={{
                                                            borderRadius: 16,
                                                            border: "1px solid rgba(245,158,11,.32)",
                                                            background: "rgba(245,158,11,.08)",
                                                            color: "#fcd34d",
                                                            padding: 14,
                                                            fontSize: 13,
                                                            lineHeight: 1.5,
                                                        }}
                                                    >
                                                        El registro inmediato aplica cuando el correo de <b>Binance</b> coincide con el monto y el remitente que registraste. Si no coincide, la recarga pasará a revisión manual.
                                                    </div>
                                                </>
                                            ) : (
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
                                                        <div className="wallet-small">JPG, PNG, WEBP o PDF. Máximo 5MB.</div>
                                                    </div>
                                                </label>
                                            )}

                                            <button className="btn" onClick={submitManualTopup} disabled={submitting}>
                                                {submitting ? "Enviando..." : (isBreb || isBinance) ? "Validar pago" : "Enviar recarga"}
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
                                            {selectedMethod.qrImageUrl ? (
                                                <div
                                                    style={{
                                                        borderRadius: 18,
                                                        padding: 12,
                                                        background: "#fff",
                                                        justifySelf: "center",
                                                        width: "min(100%, 320px)",
                                                    }}
                                                >
                                                    <img
                                                        key={selectedQrSrc}
                                                        src={selectedQrSrc}
                                                        alt={`QR ${selectedMethod.label}`}
                                                        style={{ width: "100%", height: "auto", display: "block", borderRadius: 12 }}
                                                    />
                                                </div>
                                            ) : null}
                                            <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                                    <span style={{ color: "var(--muted)" }}>Método</span>
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
                                No hay medios de pago configurados para <b>{displayTopupCurrency(currency) || "tu moneda"}</b>.
                            </div>
                        )}
                    </section>

                    <section className="wallet-card">
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
                            <div>
                                <div className="wallet-card__title">Historial de recargas</div>
                                <div className="wallet-small" style={{ marginTop: 6 }}>
                                    Mostrando 5 por página para que no se vuelva eterno.
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                                <label className="wallet-label" style={{ minWidth: 160 }}>
                                    <span>Estado</span>
                                    <select className="wallet-input" value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)}>
                                        <option value="all">Todas</option>
                                        <option value="submitted">Enviadas</option>
                                        <option value="reviewing">Revisando</option>
                                        <option value="approved">Aprobadas</option>
                                        <option value="rejected">Rechazadas</option>
                                    </select>
                                </label>
                                <label className="wallet-label" style={{ minWidth: 220 }}>
                                    <span>Buscar</span>
                                    <input
                                        className="wallet-input"
                                        placeholder="Código, método o girador"
                                        value={historyQuery}
                                        onChange={(event) => setHistoryQuery(event.target.value)}
                                    />
                                </label>
                            </div>
                        </div>
                        {filteredRequests.length ? (
                            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                                {paginatedRequests.map((item) => {
                                    const meta = STATUS_META[String(item.status || "").toLowerCase()] || { label: item.status, color: "#94a3b8" };
                                    return (
                                        <div key={item.id} style={{ border: "1px solid var(--stroke)", borderRadius: 16, padding: 14, background: "rgba(255,255,255,.02)", display: "grid", gap: 8 }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                                                <div>
                                                    <div style={{ fontWeight: 900 }}>{item.requestCode}</div>
                                                    <div className="wallet-small" style={{ marginTop: 2 }}>
                                                        {item.methodLabel} · {Number(item.amount || 0).toLocaleString("es-CO")} {displayTopupCurrency(item.currency || currency)}
                                                    </div>
                                                </div>
                                                <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "6px 10px", border: `1px solid ${meta.color}55`, background: `${meta.color}18`, color: meta.color, fontWeight: 800, fontSize: 12 }}>
                                                    {meta.label}
                                                </span>
                                            </div>

                                            <div className="wallet-small" style={{ marginTop: 0 }}>
                                                Creada: {new Date(item.createdAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}
                                            </div>
                                            {item.payerName ? (
                                                <div className="wallet-small" style={{ marginTop: 0 }}>Girador: {item.payerName}</div>
                                            ) : null}
                                            {item.autoValidationNote ? (
                                                <div className="wallet-small" style={{ marginTop: 0 }}>Validación: {item.autoValidationNote}</div>
                                            ) : null}
                                            {item.adminNote ? (
                                                <div className="wallet-small" style={{ marginTop: 0 }}>Nota admin: {item.adminNote}</div>
                                            ) : null}
                                            {item.proofFileUrl ? (
                                                <a className="wallet-link" href={item.proofFileUrl} target="_blank" rel="noreferrer">Ver comprobante</a>
                                            ) : null}
                                        </div>
                                    );
                                })}
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
                                    <div className="wallet-small" style={{ marginTop: 0 }}>
                                        Página {historyPage} de {totalHistoryPages} · {filteredRequests.length} resultado{filteredRequests.length === 1 ? "" : "s"}
                                    </div>
                                    <div style={{ display: "flex", gap: 10 }}>
                                        <button className="btn-ghost" disabled={historyPage <= 1} onClick={() => setHistoryPage((prev) => Math.max(prev - 1, 1))}>
                                            Anterior
                                        </button>
                                        <button className="btn-ghost" disabled={historyPage >= totalHistoryPages} onClick={() => setHistoryPage((prev) => Math.min(prev + 1, totalHistoryPages))}>
                                            Siguiente
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="wallet-small" style={{ marginTop: 12 }}>
                                No hay recargas para los filtros aplicados.
                            </div>
                        )}
                    </section>
                </main>
            </div>
        </div>
    );
}
