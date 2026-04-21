import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import "../styles/dashboard.css";
import "../styles/wallet.css";

import Sidebar from "../components/dashboard/Sidebar.jsx";
import { apiGet, apiGetTransactions, apiPost } from "../api/api";
import { useAuth } from "../context/AuthContext.jsx";
import TransactionsList from "../components/wallet/TransactionsList.jsx";
import useAppLogout from "../hooks/useAppLogout.js";

export default function Wallet() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const logout = useAppLogout();

    const [wallet, setWallet] = useState(null);
    const [cryptoAmount, setCryptoAmount] = useState("");
    const [cryptoLoading, setCryptoLoading] = useState(false);
    const [cryptoError, setCryptoError] = useState("");
    const [cryptoDeposit, setCryptoDeposit] = useState(null);
    const [cryptoSuccess, setCryptoSuccess] = useState("");

    async function loadWallet() {
        const response = await apiGet("/wallet");
        if (response.ok) setWallet(response.data);
    }

    async function loadLatestDeposit() {
        const response = await apiGet("/payments/nowpayments/latest");
        if (response.ok) setCryptoDeposit(response.data?.deposit || null);
    }

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void loadWallet();
            void loadLatestDeposit();
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!cryptoDeposit?.id) return undefined;
        if (String(cryptoDeposit.paymentStatus || "").toLowerCase() === "finished" && cryptoDeposit.creditedAt) {
            return undefined;
        }

        const timer = window.setInterval(async () => {
            const response = await apiGet(`/payments/nowpayments/${cryptoDeposit.id}`);
            if (!response.ok) return;
            const nextDeposit = response.data?.deposit || null;
            setCryptoDeposit(nextDeposit);
            if (nextDeposit?.creditedAt) {
                setCryptoSuccess("Pago confirmado. El saldo ya fue acreditado en tu wallet.");
                void loadWallet();
            }
        }, 15000);

        return () => window.clearInterval(timer);
    }, [cryptoDeposit?.creditedAt, cryptoDeposit?.id, cryptoDeposit?.paymentStatus]);

    async function createCryptoDeposit() {
        setCryptoError("");
        setCryptoSuccess("");
        setCryptoDeposit(null);
        setCryptoLoading(true);

        try {
            const amount = Number(String(cryptoAmount || "").replace(/[^\d.]/g, ""));
            const response = await apiPost("/payments/nowpayments/create", { amount });
            if (!response.ok) throw new Error(response.data?.message || "No se pudo crear la recarga.");
            setCryptoDeposit(response.data?.deposit || null);
        } catch (error) {
            setCryptoError(error?.message || "No se pudo crear la recarga.");
        } finally {
            setCryptoLoading(false);
        }
    }

    async function refreshDepositStatus() {
        if (!cryptoDeposit?.id) return;
        const response = await apiGet(`/payments/nowpayments/${cryptoDeposit.id}`);
        if (!response.ok) return;

        const nextDeposit = response.data?.deposit || null;
        setCryptoDeposit(nextDeposit);
        if (nextDeposit?.creditedAt) {
            setCryptoSuccess("Pago confirmado. El saldo ya fue acreditado en tu wallet.");
            void loadWallet();
        }
    }

    const currency = String(wallet?.currency || "").toUpperCase();
    const canUseCryptoTopup = currency === "USD";
    const qrValue = cryptoDeposit?.payAddress
        ? [
              "USDT BSC",
              `Address: ${cryptoDeposit.payAddress}`,
              cryptoDeposit.payAmount != null ? `Amount: ${cryptoDeposit.payAmount}` : null,
          ]
              .filter(Boolean)
              .join("\n")
        : "";
    const qrSrc = qrValue
        ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrValue)}`
        : "";

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
                                <span
                                    style={{
                                        fontSize: 11,
                                        color: "var(--muted)",
                                        marginLeft: 6,
                                        fontWeight: 700,
                                        background: "rgba(13,166,242,0.12)",
                                        border: "1px solid rgba(13,166,242,0.25)",
                                        borderRadius: 6,
                                        padding: "1px 6px",
                                    }}
                                >
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
                                <span
                                    style={{
                                        width: 20,
                                        height: 20,
                                        borderRadius: "50%",
                                        background: "rgba(16,185,129,0.18)",
                                        border: "1px solid rgba(16,185,129,0.35)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 10,
                                    }}
                                >
                                    +
                                </span>
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

                    <section
                        style={{
                            borderRadius: "var(--radius2)",
                            border: "1px solid rgba(19,200,236,0.3)",
                            background: "linear-gradient(135deg, rgba(19,200,236,0.07) 0%, rgba(13,166,242,0.04) 100%)",
                            backdropFilter: "blur(14px)",
                            boxShadow: "0 0 20px rgba(19,200,236,0.08), var(--shadow)",
                            padding: "14px 16px",
                            display: "flex",
                            alignItems: "center",
                            gap: 14,
                            marginBottom: 14,
                            borderLeft: "3px solid #13c8ec",
                        }}
                    >
                        <span
                            style={{
                                width: 38,
                                height: 38,
                                borderRadius: "50%",
                                background: "rgba(19,200,236,0.15)",
                                border: "1px solid rgba(19,200,236,0.4)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 16,
                                fontWeight: 900,
                                color: "#13c8ec",
                                flexShrink: 0,
                            }}
                        >
                            $
                        </span>

                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#13c8ec", marginBottom: 2 }}>
                                Inversion total
                            </div>
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

                        {canUseCryptoTopup ? (
                            <>
                                <div className="wallet-row" style={{ marginTop: 14 }}>
                                    <label className="wallet-label">
                                        <span>Monto ({wallet?.currency || "USD"})</span>
                                        <input
                                            className="wallet-input"
                                            inputMode="numeric"
                                            placeholder="Ej: 10"
                                            value={cryptoAmount}
                                            onChange={(event) => setCryptoAmount(event.target.value)}
                                        />
                                    </label>

                                    <button className="btn" style={{ width: "auto", padding: "10px 18px" }} onClick={createCryptoDeposit} disabled={cryptoLoading}>
                                        {cryptoLoading ? "Creando..." : "Generar pago"}
                                    </button>
                                </div>

                                {cryptoError ? <div className="error" style={{ marginTop: 12 }}>{cryptoError}</div> : null}
                                {cryptoSuccess ? <div className="wallet-success">{cryptoSuccess}</div> : null}

                                {cryptoDeposit ? (
                                    <div className="wallet-paybox">
                                        <div className="wallet-qr">
                                            <div className="wallet-qr__title">Escanea y paga</div>
                                            {qrSrc ? (
                                                <img className="wallet-qr__img" src={qrSrc} alt="QR del pago" />
                                            ) : (
                                                <div
                                                    className="wallet-qr__img"
                                                    style={{
                                                        minHeight: 260,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        color: "var(--muted)",
                                                        fontSize: 13,
                                                        padding: 12,
                                                        textAlign: "center",
                                                    }}
                                                >
                                                    Esperando direccion de deposito...
                                                </div>
                                            )}

                                            <div style={{ display: "grid", gap: 8, fontSize: 13, marginTop: 12 }}>
                                                <div><b>Estado:</b> {cryptoDeposit.paymentStatus}</div>
                                                <div><b>Monto en wallet:</b> {Number(cryptoDeposit.amount || 0).toLocaleString("es-CO")} {cryptoDeposit.currency || "USD"}</div>
                                                <div><b>Debes enviar:</b> {cryptoDeposit.payAmount != null ? Number(cryptoDeposit.payAmount).toFixed(6) : "-"} {String(cryptoDeposit.payCurrency || "").toUpperCase()}</div>
                                                <div><b>Red:</b> BNB Smart Chain (BEP20)</div>
                                                {cryptoDeposit.payinExtraId ? <div><b>Memo / extra:</b> {cryptoDeposit.payinExtraId}</div> : null}
                                            </div>
                                        </div>

                                        <div className="wallet-links">
                                            <div className="wallet-links__title">Direccion de deposito</div>
                                            <div
                                                style={{
                                                    padding: 12,
                                                    borderRadius: 12,
                                                    background: "var(--input-bg)",
                                                    border: "1px solid var(--stroke)",
                                                    wordBreak: "break-all",
                                                    fontSize: 13,
                                                    marginBottom: 10,
                                                }}
                                            >
                                                {cryptoDeposit.payAddress || "Esperando direccion..."}
                                            </div>

                                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                                <button
                                                    className="btn-ghost"
                                                    style={{ width: "auto", padding: "8px 14px" }}
                                                    onClick={() => navigator.clipboard.writeText(String(cryptoDeposit.payAddress || ""))}
                                                    disabled={!cryptoDeposit.payAddress}
                                                >
                                                    Copiar direccion
                                                </button>
                                                <button
                                                    className="btn-ghost"
                                                    style={{ width: "auto", padding: "8px 14px" }}
                                                    onClick={() => navigator.clipboard.writeText(String(cryptoDeposit.payAmount != null ? cryptoDeposit.payAmount : ""))}
                                                    disabled={cryptoDeposit.payAmount == null}
                                                >
                                                    Copiar monto
                                                </button>
                                                <button
                                                    className="btn-ghost"
                                                    style={{ width: "auto", padding: "8px 14px" }}
                                                    onClick={refreshDepositStatus}
                                                >
                                                    Actualizar estado
                                                </button>
                                            </div>

                                            <div className="wallet-small">
                                                Envia solo USDT por BNB Smart Chain (BEP20).
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </>
                        ) : (
                            <div className="wallet-small" style={{ marginTop: 10 }}>
                                Disponible solo para cuentas en USD.
                            </div>
                        )}
                    </section>

                    <TransactionsList fetchFn={(query) => apiGetTransactions(query)} />
                </main>
            </div>
        </div>
    );
}
