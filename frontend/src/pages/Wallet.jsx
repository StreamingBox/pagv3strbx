import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import "../styles/dashboard.css";
import "../styles/wallet.css";

import Sidebar from "../components/dashboard/Sidebar.jsx";
import { apiGet, apiGetTransactions } from "../api/api";
import { useAuth } from "../context/AuthContext.jsx";
import TransactionsList from "../components/wallet/TransactionsList.jsx";
import useAppLogout from "../hooks/useAppLogout.js";

export default function Wallet() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const logout = useAppLogout();
    const [wallet, setWallet] = useState(null);

    useEffect(() => {
        async function loadWallet() {
            const response = await apiGet("/wallet");
            if (response.ok) setWallet(response.data);
        }
        void loadWallet();
    }, []);

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
                        <h1 className="wallet-title">Saldo y movimientos</h1>
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
                                <b>{wallet?.currency || "-"}</b>
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

                    <TransactionsList fetchFn={(query) => apiGetTransactions(query)} />
                </main>
            </div>
        </div>
    );
}
