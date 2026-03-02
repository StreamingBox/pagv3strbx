import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ThemeToggle from "../ThemeToggle.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
const LOGO_URL = "/logo.png";
const isMobile = () => typeof window !== "undefined" && window.innerWidth <= 900;

// Obtiene las iniciales del nombre/email del usuario
function getAvatarInitials(user) {
    const name = user?.name || user?.email || "U";
    return name.slice(0, 2).toUpperCase();
}

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
    onOpenCart, onGoOrders, onGoWallet, onGoAnalytics, onGoAdmin,
    onGoCodes, onGoCodeLogs, onGoExpirations, onGoHome, onLogout,
}) {
    const [logoOk, setLogoOk] = useState(true);
    const [collapsed, setCollapsed] = useState(isMobile());
    const isAdmin = String(user?.role || "").toLowerCase() === "admin";
    const activePath = window.location.pathname;

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
                {/* Header: Avatar + Info */}
                <div className="sb-header">
                    {/* Avatar circular */}
                    <div className="sb-avatar">
                        {logoOk ? (
                            <img
                                src={LOGO_URL}
                                alt="Logo"
                                className="sb-avatar__img"
                                onError={() => setLogoOk(false)}
                            />
                        ) : (
                            <span className="sb-avatar__initials">{getAvatarInitials(user)}</span>
                        )}
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
                        <div style={{ marginLeft: "auto", flexShrink: 0 }}>
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
                                <div className="sb-profit-row">
                                    <span className="sb-profit-label">Ganancias totales</span>
                                    <span className="sb-profit-value">
                                        +{Number(wallet?.profit_total || 0).toLocaleString("es-CO")}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Botón Carrito — prominente */}
                        <motion.button
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
                                    <motion.span
                                        className="sb-cart-badge"
                                        key="badge"
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        exit={{ scale: 0 }}
                                        transition={{ type: "spring", stiffness: 500, damping: 20 }}
                                    >
                                        {cartCount}
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </motion.button>

                        {/* Divisor */}
                        <div className="sb-divider" />

                        {/* Nav Items */}
                        <nav className="sb-nav">
                            {NAV_ITEMS.map((item) => {
                                const isActive = activePath === item.path;
                                const handler = actionMap[item.key];
                                return (
                                    <motion.button
                                        key={item.key}
                                        className={`sb-nav-item${isActive ? " sb-nav-item--active" : ""}`}
                                        onClick={() => handler && nav(handler)}
                                        whileHover={{ x: 4 }}
                                        whileTap={{ scale: 0.97 }}
                                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                    >
                                        <span className="sb-nav-icon">{item.icon}</span>
                                        <span className="sb-nav-label">{item.label}</span>
                                        {isActive && (
                                            <motion.span
                                                className="sb-nav-active-dot"
                                                layoutId="activeNavDot"
                                            />
                                        )}
                                    </motion.button>
                                );
                            })}

                            {activePath !== "/dashboard" && (
                                <motion.button
                                    className="sb-nav-item"
                                    onClick={() => nav(onGoHome)}
                                    whileHover={{ x: 4 }}
                                    whileTap={{ scale: 0.97 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                >
                                    <span className="sb-nav-icon">🎯</span>
                                    <span className="sb-nav-label">Plataformas</span>
                                </motion.button>
                            )}

                            {isAdmin && (
                                <>
                                    <div className="sb-divider" style={{ margin: "8px 0" }} />
                                    <motion.button
                                        className="sb-nav-item"
                                        onClick={() => nav(onGoAdmin)}
                                        whileHover={{ x: 4 }}
                                        whileTap={{ scale: 0.97 }}
                                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                    >
                                        <span className="sb-nav-icon">⚙️</span>
                                        <span className="sb-nav-label">Panel Admin</span>
                                    </motion.button>
                                </>
                            )}
                        </nav>

                        {/* Divisor + Cerrar sesión al fondo */}
                        <div className="sb-divider" />
                        <motion.button
                            className="sb-logout-btn"
                            onClick={onLogout}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.97 }}
                        >
                            <span>↩</span> Cerrar sesión
                        </motion.button>

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
