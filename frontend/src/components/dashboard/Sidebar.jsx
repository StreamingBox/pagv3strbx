import { useState } from "react";
import ThemeToggle from "../ThemeToggle.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
const LOGO_URL = `${API_BASE}/branding/logo`;

// Detecta si es móvil al montar el componente
const isMobile = () => typeof window !== "undefined" && window.innerWidth <= 900;

export default function Sidebar({
    user,
    wallet,
    cartCount,
    onOpenCart,
    onGoOrders,
    onGoWallet,
    onGoAnalytics,
    onGoAdmin,
    onGoCodes,
    onGoCodeLogs,
    onGoExpirations,
    onGoHome,     // ← ir al dashboard/plataformas
    onLogout,
}) {
    const [logoOk, setLogoOk] = useState(true);
    // En móvil empieza cerrado, en desktop abierto
    const [collapsed, setCollapsed] = useState(isMobile());
    const isAdmin = String(user?.role || "").toLowerCase() === "admin";
    const activePath = window.location.pathname;

    // Cierra el sidebar en móvil y ejecuta la acción de navegación
    function nav(fn) {
        if (isMobile()) setCollapsed(true);
        if (typeof fn === "function") fn();
    }

    return (
        <>
            {/* Overlay para cerrar al tocar fuera */}
            {!collapsed && (
                <div className="sidebar-overlay" onClick={() => setCollapsed(true)} />
            )}

            {/* Botón hamburger / cerrar */}
            <button
                className="sidebar-toggle-btn"
                onClick={() => setCollapsed((v) => !v)}
                title={collapsed ? "Abrir menú" : "Cerrar menú"}
            >
                {collapsed ? "☰" : "✕"}
            </button>

            {/* Carrito flotante (solo cuando el sidebar está cerrado en móvil) */}
            {collapsed && cartCount > 0 && (
                <button
                    className="sidebar-toggle-btn"
                    style={{ left: "auto", right: 14, top: 14, position: "fixed" }}
                    onClick={onOpenCart}
                    title={`Carrito (${cartCount})`}
                >
                    🛒
                    <span style={{
                        fontSize: 10, position: "absolute", top: 4, right: 4,
                        background: "var(--accent)", borderRadius: "50%",
                        width: 16, height: 16, display: "flex",
                        alignItems: "center", justifyContent: "center",
                        color: "#fff", fontWeight: 900
                    }}>{cartCount}</span>
                </button>
            )}

            <aside className={`sidebar${collapsed ? " sidebar--collapsed" : ""}`}>
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
                        {!collapsed && (
                            <div style={{ minWidth: 0 }}>
                                <div className="nav-title" style={{ margin: 0 }}>Dashboard</div>
                                <p className="nav-sub"
                                    style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis" }}
                                    title={user?.email || ""}
                                >
                                    {user?.email}
                                </p>
                            </div>
                        )}
                    </div>
                    {!collapsed && <ThemeToggle />}
                </div>

                {!collapsed && (
                    <>
                        {/* KPI Saldo */}
                        {wallet && (
                            <>
                                <div className="kpi" style={{ marginTop: 14 }}>
                                    <div className="label">Saldo disponible</div>
                                    <div className="value">
                                        {Number(wallet?.balance || 0).toLocaleString("es-CO")} {wallet?.currency || "COP"}
                                    </div>
                                </div>
                                <div className="kpi" style={{ marginTop: 12 }}>
                                    <div className="label">Ganancia obtenida</div>
                                    <div className="value">
                                        {Number(wallet?.profit_total || 0).toLocaleString("es-CO")} {wallet?.currency || "COP"}
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Carrito */}
                        <button
                            className="btn"
                            style={{ marginTop: 12, width: "100%" }}
                            onClick={() => nav(onOpenCart)}
                            disabled={!cartCount}
                        >
                            🛒 Carrito {cartCount ? `(${cartCount})` : ""}
                        </button>

                        {/* ← Volver a Plataformas */}
                        {activePath !== "/dashboard" && (
                            <button
                                className="btn-ghost"
                                style={{ marginTop: 10, width: "100%", borderColor: "rgba(124,92,255,.4)" }}
                                onClick={() => nav(onGoHome || (() => window.location.href = "/dashboard"))}
                            >
                                ← Plataformas
                            </button>
                        )}

                        {/* Separador */}
                        <div style={{ height: 1, background: "rgba(255,255,255,.08)", margin: "12px 0 6px" }} />

                        <button className="btn-ghost" style={{ marginTop: 10, width: "100%" }} onClick={() => nav(onGoOrders)}>
                            🧾 Historial de Compras
                        </button>
                        <button className="btn-ghost" style={{ marginTop: 10, width: "100%" }} onClick={() => nav(onGoWallet)}>
                            💲 Transacciones / Saldo
                        </button>
                        <button className="btn-ghost" style={{ marginTop: 10, width: "100%" }} onClick={() => nav(onGoAnalytics)}>
                            📊 Mis Estadísticas
                        </button>

                        <div style={{ height: 1, background: "rgba(255,255,255,.08)", margin: "12px 0 6px" }} />

                        <button
                            className={`btn-ghost ${activePath === "/expirations" ? "active" : ""}`}
                            style={{ marginTop: 10, width: "100%" }}
                            onClick={() => nav(onGoExpirations)}
                        >
                            ⏳ Vencimientos
                        </button>
                        <button className="btn-ghost" style={{ marginTop: 10, width: "100%" }} onClick={() => nav(onGoCodes)}>
                            🔐 Códigos
                        </button>

                        {isAdmin && (
                            <button className="btn-ghost" style={{ marginTop: 10, width: "100%" }} onClick={() => nav(onGoAdmin)}>
                                🛠️ Volver al Admin
                            </button>
                        )}

                        <button className="btn-ghost" onClick={onLogout} style={{ marginTop: 12, width: "100%" }}>
                            Cerrar sesión
                        </button>
                    </>
                )}
            </aside>
        </>
    );
}
