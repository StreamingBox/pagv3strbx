import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ThemeToggle from "../ThemeToggle.jsx";
import UserNotifications from "./UserNotifications.jsx";
import StreamingBoxLogo from "../StreamingBoxLogo.jsx";

import { getApiBase } from "../../config/apiBase.js";

const API_BASE = getApiBase();
const isMobile = () => typeof window !== "undefined" && window.innerWidth <= 900;
const MotionButton = motion.button;
const MotionSpan = motion.span;

// Nav items del sidebar
const NAV_ITEMS = [
    { key: "home", label: "Inicio", icon: "🏠", path: "/dashboard" },
    { key: "orders", label: "Historial de Compras", icon: "🧾", path: "/orders" },
    { key: "analytics", label: "Mis Estadísticas", icon: "📊", path: "/analytics" },
    { key: "expirations", label: "Vencimientos", icon: "⏳", path: "/expirations" },
    { key: "codes", label: "Códigos", icon: "🔐", path: "/codes" },
    { key: "support", label: "Soporte", icon: "🛠️", path: null },
];

export default function Sidebar({
    user, wallet, cartCount,
    onOpenCart, onGoOrders, onGoAnalytics, onGoAdmin,
    onGoCodes, onGoExpirations, onGoHome, onLogout,
}) {
    const [collapsed, setCollapsed] = useState(isMobile());
    const [expirationsCount, setExpirationsCount] = useState(0);
    const isAdmin = String(user?.role || "").toLowerCase() === "admin";
    const activePath = window.location.pathname;

    // React automatically to window resizes (desktop <-> mobile switch)
    useEffect(() => {
        const handleResize = () => {
            setCollapsed(typeof window !== "undefined" && window.innerWidth <= 900);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // Poll expirations count every 3 minutes
    useEffect(() => {
        async function fetchExpirations() {
            // Hide badge while on the expirations page
            if (activePath === "/expirations") {
                setExpirationsCount(0);
                return;
            }
            try {
                const res = await fetch(`${API_BASE}/orders/expiring-count`, { credentials: "include" });
                if (res.ok) {
                    const data = await res.json();
                    setExpirationsCount(Number(data.count) || 0);
                }
            } catch { /* silently ignore */ }
        }
        fetchExpirations();
        const timer = setInterval(fetchExpirations, 180000);
        return () => clearInterval(timer);
    }, [activePath]);

    function nav(fn) {
        if (isMobile()) setCollapsed(true);
        if (typeof fn === "function") fn();
    }

    const actionMap = {
        home: onGoHome,
        orders: onGoOrders,
        analytics: onGoAnalytics,
        expirations: onGoExpirations,
        codes: onGoCodes,
        support: null,
    };

    return (
        <>
            {!collapsed && (
                <div className="sidebar-overlay" onClick={() => setCollapsed(true)} />
            )}

            <button
                className="sidebar-toggle-btn"
                onClick={() => setCollapsed(v => !v)}
                title={collapsed ? "Abrir menú" : "Cerrar menú"}
            >
                {collapsed ? "☰" : "✕"}
            </button>

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
                        background: "#EF4444", borderRadius: "50%",
                        width: 16, height: 16, display: "flex",
                        alignItems: "center", justifyContent: "center",
                        color: "#fff", fontWeight: 900
                    }}>{cartCount}</span>
                </button>
            )}

            <aside className={`sidebar sb-new${collapsed ? " sidebar--collapsed" : ""}`}>
                {/* Header: Logo + Info */}
                <div className="sb-header">
                    {/* Logo circular */}
                    <div className="sb-avatar">
                        <StreamingBoxLogo size={46} showText={false} onDark={true} />
                    </div>

                    {!collapsed && (
                        <div className="sb-user-info">
                            <div className="sb-user-name">
                                {user?.name || user?.email?.split("@")[0] || "Usuario"}
                            </div>
                            <div className="sb-user-email" title={user?.email}>
                                {user?.email}
                            </div>
                        </div>
                    )}

                    {!collapsed && (
                        <div style={{ marginLeft: "auto", flexShrink: 0, display: "flex", gap: "8px", alignItems: "center" }}>
                            <UserNotifications />
                            <ThemeToggle compact />
                        </div>
                    )}
                </div>

                {!collapsed && (
                    <>
                        {/* Saldo Disponible */}
                        {wallet && (
                            <div className="sb-balance-card">
                                <div className="sb-balance-label">SALDO DISPONIBLE</div>
                                <div className="sb-balance-amount">
                                    {Number(wallet?.balance || 0).toLocaleString("es-CO")}
                                    <span className="sb-balance-currency">
                                        {wallet?.currency || "COP"}
                                    </span>
                                </div>

                                {/* Divisor */}
                                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "10px 0 8px" }} />

                                {/* Ganancias totales */}
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                    <span style={{
                                        width: 22, height: 22, borderRadius: "50%",
                                        background: "rgba(16,185,129,0.18)",
                                        border: "1px solid rgba(16,185,129,0.35)",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        fontSize: 11, flexShrink: 0,
                                    }}>📈</span>
                                    <span className="sb-profit-label" style={{ flex: 1, fontSize: 12 }}>Ganancias totales</span>
                                    <span className="sb-profit-value" style={{ fontSize: 13, fontWeight: 800, color: "#10b981" }}>
                                        +{Number(wallet?.profit_total || 0).toLocaleString("es-CO")}
                                    </span>
                                </div>

                                {/* Divisor sutil */}
                                <div style={{ height: 1, background: "rgba(255,255,255,0.04)", margin: "4px 0" }} />

                                {/* Inversión total — estilo Stitch: borde teal izquierdo */}
                                <div style={{
                                    display: "flex", alignItems: "center", gap: 8,
                                    borderLeft: "2.5px solid #13c8ec",
                                    paddingLeft: 8, marginTop: 4,
                                }}>
                                    <span style={{
                                        width: 22, height: 22, borderRadius: "50%",
                                        background: "rgba(19,200,236,0.15)",
                                        border: "1px solid rgba(19,200,236,0.4)",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        fontSize: 11, fontWeight: 900, color: "#13c8ec", flexShrink: 0,
                                    }}>$</span>
                                    <span style={{ flex: 1, fontSize: 12, color: "var(--muted)" }}>Inversión total</span>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: "#13c8ec" }}>
                                        {Number(wallet?.total_invested || 0).toLocaleString("es-CO")}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Botón Carrito — prominente */}
                        <MotionButton
                            className="sb-cart-btn"
                            onClick={() => nav(onOpenCart)}
                            whileHover={{ scale: 1.03, y: -1 }}
                            whileTap={{ scale: 0.97 }}
                            transition={{ type: "spring", stiffness: 380, damping: 22 }}
                        >
                            <span className="sb-cart-icon">🛒</span>
                            <span>Carrito</span>
                            <AnimatePresence>
                                {cartCount > 0 && (
                                    <MotionSpan
                                        className="sb-cart-badge"
                                        key="badge"
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        exit={{ scale: 0 }}
                                        transition={{ type: "spring", stiffness: 500, damping: 20 }}
                                    >
                                        {cartCount}
                                    </MotionSpan>
                                )}
                            </AnimatePresence>
                        </MotionButton>

                        {/* Divisor */}
                        <div className="sb-divider" />

                        {/* Nav Items */}
                        <nav className="sb-nav">
                            {NAV_ITEMS.map((item) => {
                                const isActive = activePath === item.path;
                                const handler = actionMap[item.key];
                                return (
                                    <MotionButton
                                        key={item.key}
                                        className={`sb-nav-item${isActive ? " sb-nav-item--active" : ""}`}
                                        onClick={() => handler && nav(handler)}
                                        whileHover={{ x: 4 }}
                                        whileTap={{ scale: 0.97 }}
                                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                    >
                                        <span className="sb-nav-icon">{item.icon}</span>
                                        <span className="sb-nav-label">{item.label}</span>

                                        {/* Badge para vencimientos del usuario */}
                                        {item.key === "expirations" && expirationsCount > 0 && !collapsed && (
                                            <span style={{
                                                background: "linear-gradient(135deg, #ef4444 0%, #f97316 100%)",
                                                color: "#fff",
                                                borderRadius: 99,
                                                fontSize: 10,
                                                fontWeight: 800,
                                                padding: "2px 7px",
                                                marginLeft: "auto",
                                                minWidth: 20,
                                                textAlign: "center",
                                                lineHeight: "16px",
                                                boxShadow: "0 0 12px rgba(239,68,68,0.3)",
                                                animation: "pulse 1.8s infinite"
                                            }}>
                                                {expirationsCount}
                                            </span>
                                        )}

                                        {isActive && (
                                            <MotionSpan
                                                className="sb-nav-active-dot"
                                                layoutId="activeNavDot"
                                            />
                                        )}
                                    </MotionButton>
                                );
                            })}

                            {activePath !== "/dashboard" && (
                                <MotionButton
                                    className="sb-nav-item"
                                    onClick={() => nav(onGoHome)}
                                    whileHover={{ x: 4 }}
                                    whileTap={{ scale: 0.97 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                >
                                    <span className="sb-nav-icon">🎯</span>
                                    <span className="sb-nav-label">Plataformas</span>
                                </MotionButton>
                            )}

                            {isAdmin && (
                                <>
                                    <div className="sb-divider" style={{ margin: "8px 0" }} />
                                    <MotionButton
                                        className="sb-nav-item"
                                        onClick={() => nav(onGoAdmin)}
                                        whileHover={{ x: 4 }}
                                        whileTap={{ scale: 0.97 }}
                                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                    >
                                        <span className="sb-nav-icon">⚙️</span>
                                        <span className="sb-nav-label">Panel Admin</span>
                                    </MotionButton>
                                </>
                            )}
                        </nav>

                        {/* Divisor + Cerrar sesión al fondo */}
                        <div className="sb-divider" />
                        <MotionButton
                            className="sb-logout-btn"
                            onClick={onLogout}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.97 }}
                        >
                            <span>↩</span> Cerrar sesión
                        </MotionButton>

                        {/* Status online */}
                        <div className="sb-status">
                            <span className="sb-status-dot" />
                            <span>Server Status: Online</span>
                        </div>
                    </>
                )}
            </aside>
        </>
    );
}
