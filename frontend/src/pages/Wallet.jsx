import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import "../styles/dashboard.css";
import "../styles/wallet.css";

import Sidebar from "../components/dashboard/Sidebar.jsx";
import { apiGet, apiLogout, apiGetTransactions } from "../api/api";
import { useAuth } from "../context/AuthContext.jsx";
import TransactionsList from "../components/wallet/TransactionsList.jsx";

export default function Wallet() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();

    const [wallet, setWallet] = useState(null);

    async function loadWallet() {
        const r = await apiGet("/wallet");
        if (r.ok) setWallet(r.data);
    }

    useEffect(() => {
        loadWallet();
    }, []);

    const currency = String(wallet?.currency || "").toUpperCase();

    async function logout() {
        try {
            await apiLogout();
        } finally {
            setUser(null);
            navigate("/", { replace: true });
        }
    }

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                <Sidebar
                    user={user}
                    wallet={wallet}
                    cartCount={0}
                    onOpenCart={() => { }}
                    onGoOrders={() => navigate("/orders")}
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
                            ← Volver
                        </button>

                        <h1 className="wallet-title">Transacciones y Saldo</h1>
                    </div>

                    <div className="wallet-grid">
                        <section className="wallet-card">
                            <div className="wallet-card__title">Saldo</div>
                            <div className="wallet-balance">
                                {Number(wallet?.balance || 0).toLocaleString("es-CO")}{" "}
                                <span className="wallet-balance__cur">
                                    {wallet?.currency || "COP"}
                                </span>
                            </div>

                            <div className="wallet-meta">
                                <span className="wallet-meta__label">Moneda:</span>{" "}
                                <b>{currency || "-"}</b>
                            </div>
                        </section>

                        <section className="wallet-card">
                            <div className="wallet-card__title">Ganancia obtenida</div>
                            <div className="wallet-balance" style={{ color: "#10b981" }}>
                                {Number(wallet?.profit_total || 0).toLocaleString("es-CO")}{" "}
                                <span className="wallet-balance__cur">
                                    {wallet?.currency || "COP"}
                                </span>
                            </div>

                            <div className="wallet-meta">
                                <span className="wallet-meta__label">Acumulada por ventas</span>
                            </div>
                        </section>
                    </div>

                    <TransactionsList fetchFn={(q) => apiGetTransactions(q)} />
                </main>
            </div>
        </div>
    );
}
