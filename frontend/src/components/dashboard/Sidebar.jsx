import { useState } from "react";
import ThemeToggle from "../ThemeToggle.jsx";

// ✅ Usamos el mismo base del proyecto
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
const LOGO_URL = `${API_BASE}/branding/logo`;

export default function Sidebar({
    user,
    wallet,
    cartCount,
    onOpenCart,
    onGoOrders,
    onGoWallet,     // ✅ NUEVO
    onGoAdmin,
    onGoCodes,
    onGoCodeLogs,
    onLogout,
}) {
    const [logoOk, setLogoOk] = useState(true);
    const isAdmin = String(user?.role || "").toLowerCase() === "admin";

    return (
        <aside className="sidebar">
            <div className="sidebar-top">
                <div className="brand-row">
                    {logoOk ? (
                        <img
                            className="brand-logo-img"
                            src={LOGO_URL}
                            alt="Logo"
                            onError={() => setLogoOk(false)}
                        />
                    ) : null}

                    <div style={{ minWidth: 0 }}>
                        <div className="nav-title" style={{ margin: 0 }}>
                            Dashboard
                        </div>

                        <p
                            className="nav-sub"
                            style={{
                                margin: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                            title={user?.email || ""}
                        >
                            {user?.email}
                        </p>
                    </div>
                </div>

                <ThemeToggle />
            </div>

            {/* KPI: Saldo */}
            <div className="kpi" style={{ marginTop: 14 }}>
                <div className="label">Saldo disponible</div>

                <div className="value" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                    <span>
                        {Number(wallet?.balance || 0).toLocaleString()} {wallet?.currency || "COP"}
                    </span>
                </div>
            </div>

            {/* KPI: Ganancia */}
            <div className="kpi" style={{ marginTop: 12 }}>
                <div className="label">Ganancia obtenida</div>
                <div className="value">
                    {Number(wallet?.profit_total || 0).toLocaleString()} {wallet?.currency || "COP"}
                </div>
            </div>

            <button
                className="btn"
                style={{ marginTop: 12, width: "100%" }}
                onClick={onOpenCart}
                disabled={!cartCount}
            >
                🛒 Carrito {cartCount ? `(${cartCount})` : ""}
            </button>

            <button
                className="btn-ghost"
                style={{ marginTop: 10, width: "100%" }}
                onClick={onGoOrders}
            >
                🧾 Historial
            </button>



            {/* Separador */}
            <div
                style={{
                    height: 1,
                    background: "rgba(255,255,255,.08)",
                    margin: "12px 0 6px",
                }}
            />

            <button
                className="btn-ghost"
                style={{ marginTop: 10, width: "100%" }}
                onClick={() => (typeof onGoCodes === "function" ? onGoCodes() : null)}
            >
                🔐 Códigos
            </button>

            {isAdmin ? (
                <button
                    className="btn-ghost"
                    style={{ marginTop: 10, width: "100%" }}
                    onClick={() => (typeof onGoCodeLogs === "function" ? onGoCodeLogs() : null)}
                >
                    📜 Logs de Códigos
                </button>
            ) : null}

            {isAdmin ? (
                <button
                    className="btn-ghost"
                    style={{ marginTop: 10, width: "100%" }}
                    onClick={onGoAdmin}
                >
                    🛠️ Volver al Admin
                </button>
            ) : null}

            <button
                className="btn-ghost"
                onClick={onLogout}
                style={{ marginTop: 12, width: "100%" }}
            >
                Cerrar sesión
            </button>
        </aside>
    );
}
