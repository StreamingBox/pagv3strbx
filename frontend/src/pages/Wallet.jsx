import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import "../styles/dashboard.css";
import "../styles/wallet.css";

import Sidebar from "../components/dashboard/Sidebar.jsx";
import { apiGet, apiPost, apiLogout } from "../api/api";
import { useAuth } from "../context/AuthContext.jsx";

export default function Wallet() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();

    const [wallet, setWallet] = useState(null);
    const [amount, setAmount] = useState("10");
    const [loading, setLoading] = useState(false);

    const [pay, setPay] = useState(null);
    const [status, setStatus] = useState(null);
    const timerRef = useRef(null);

    async function loadWallet() {
        const r = await apiGet("/wallet");
        if (r.ok) setWallet(r.data);
    }

    useEffect(() => {
        loadWallet();
        return () => timerRef.current && clearInterval(timerRef.current);
    }, []);

    const currency = useMemo(
        () => String(wallet?.currency || "").toUpperCase(),
        [wallet]
    );

    async function logout() {
        try {
            await apiLogout();
        } finally {
            setUser(null);
            navigate("/", { replace: true });
        }
    }

    async function startTopup() {
        setPay(null);
        setStatus(null);

        const n = Number(amount);
        if (!Number.isFinite(n) || n <= 0) {
            alert("Monto inválido");
            return;
        }

        setLoading(true);
        try {
            const r = await apiPost("/payments/binance/topup", { amount: n });
            if (!r.ok) {
                alert(r.data?.message || "No se pudo iniciar el pago");
                return;
            }

            setPay(r.data);

            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = setInterval(async () => {
                const s = await apiGet(`/payments/binance/${r.data.intentId}`);
                if (s.ok) {
                    const p = s.data?.payment;
                    setStatus(p);

                    if (p?.status === "paid" || p?.credited === 1) {
                        clearInterval(timerRef.current);
                        timerRef.current = null;
                        await loadWallet();
                    }
                }
            }, 3500);
        } finally {
            setLoading(false);
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
                    onOpenCart={() => {}}
                    onGoOrders={() => navigate("/orders")}
                    onGoWallet={() => navigate("/wallet")}
                    onGoCodes={() => navigate("/codes")}
                    onGoCodeLogs={() => navigate("/admin/code-logs")}
                    onGoAdmin={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main">
                    <div className="wallet-topbar">
                        <button className="btn-ghost" onClick={() => navigate("/dashboard")}>
                            ← Volver
                        </button>

                        <h1 className="wallet-title">Billetera</h1>
                    </div>

                    <div className="wallet-grid">
                        <section className="wallet-card">
                            <div className="wallet-card__title">Saldo</div>
                            <div className="wallet-balance">
                                {Number(wallet?.balance || 0).toLocaleString()}{" "}
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
                            <div className="wallet-card__title">Recargar con Binance Pay</div>

                            {currency !== "USD" ? (
                                <div className="wallet-alert">
                                    Binance Pay solo está habilitado para usuarios con moneda{" "}
                                    <b>USD</b>.
                                </div>
                            ) : (
                                <>
                                    <div className="wallet-row">
                                        <label className="wallet-label">
                                            Monto (USD)
                                            <input
                                                className="wallet-input"
                                                value={amount}
                                                onChange={(e) => setAmount(e.target.value)}
                                                type="number"
                                                min="1"
                                                step="1"
                                            />
                                        </label>

                                        <button className="btn" onClick={startTopup} disabled={loading}>
                                            {loading ? "Creando orden..." : "Pagar con Binance"}
                                        </button>
                                    </div>

                                    {pay ? (
                                        <div className="wallet-paybox">
                                            <div className="wallet-qr">
                                                <div className="wallet-qr__title">Escanea el QR</div>
                                                {pay.qrcodeLink ? (
                                                    <img
                                                        src={pay.qrcodeLink}
                                                        alt="Binance Pay QR"
                                                        className="wallet-qr__img"
                                                    />
                                                ) : (
                                                    <div className="wallet-muted">QR no disponible</div>
                                                )}
                                            </div>

                                            <div className="wallet-links">
                                                <div className="wallet-links__title">Links</div>

                                                {pay.checkoutUrl ? (
                                                    <a className="wallet-link" href={pay.checkoutUrl} target="_blank" rel="noreferrer">
                                                        Abrir checkout (web)
                                                    </a>
                                                ) : null}

                                                {pay.universalUrl ? (
                                                    <a className="wallet-link" href={pay.universalUrl} target="_blank" rel="noreferrer">
                                                        Abrir en Binance (universal)
                                                    </a>
                                                ) : null}

                                                <div className="wallet-small">
                                                    Intent: <b>#{pay.intentId}</b> — Estado:{" "}
                                                    <b>{status?.status || "pending"}</b>
                                                </div>

                                                {status?.status === "paid" || status?.credited === 1 ? (
                                                    <div className="wallet-success">
                                                        ✅ Pago confirmado. Saldo acreditado.
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    ) : null}
                                </>
                            )}
                        </section>
                    </div>
                </main>
            </div>
        </div>
    );
}
