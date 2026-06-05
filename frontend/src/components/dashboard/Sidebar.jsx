/* global __APK_RELEASE_ID__ */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ThemeToggle from "../ThemeToggle.jsx";
import UserNotifications from "./UserNotifications.jsx";
import StreamingBoxLogo from "../StreamingBoxLogo.jsx";
import BalancedText from "../text/BalancedText.jsx";
import { displayCurrency } from "../../utils/currency.js";
import { isSidebarMobile, useResponsiveSidebar } from "../sidebar/AppSidebar.jsx";

import { getApiBase } from "../../config/apiBase.js";
import { isNativeAndroidApp } from "../../native/biometricAuth.js";

const API_BASE = getApiBase();
const MotionButton = motion.button;
const MotionSpan = motion.span;
const APK_RELEASE_ID = typeof __APK_RELEASE_ID__ !== "undefined" ? __APK_RELEASE_ID__ : "dev";
const APK_ACK_STORAGE_KEY = "sb-apk-release-downloaded";

const NAV_ITEMS = [
    { key: "home", label: "Inicio", icon: "🏠", path: "/dashboard" },
    { key: "wallet", label: "Recargas", icon: "💳", path: "/topups" },
    { key: "orders", label: "Historial de Compras", icon: "🧾", path: "/orders" },
    { key: "renewals", label: "Renovaciones", icon: "🔄", path: "/renewals" },
    { key: "analytics", label: "Mis Estadísticas", icon: "📊", path: "/analytics" },
    { key: "expirations", label: "Vencimientos", icon: "⏳", path: "/expirations" },
    { key: "codes", label: "Códigos", icon: "🔐", path: "/codes" },
    { key: "advertising", label: "Publicidad", icon: "📢", path: "/advertising" },
    { key: "support", label: "Soporte", icon: "🛠️", path: null },
];

export default function Sidebar({
    user,
    wallet,
    cartCount,
    onOpenCart,
    onGoWallet,
    onGoOrders,
    onGoRenewals,
    onGoAnalytics,
    onGoAdmin,
    onGoCodes,
    onGoExpirations,
    onGoAdvertising,
    onGoHome,
    onLogout,
}) {
    const { collapsed, setCollapsed } = useResponsiveSidebar({ collapseOnMobile: true });
    const [expirationsCount, setExpirationsCount] = useState(0);
    const [apkDownloadedRelease, setApkDownloadedRelease] = useState(() => {
        if (typeof window === "undefined") return "";
        try {
            return window.localStorage.getItem(APK_ACK_STORAGE_KEY) || "";
        } catch {
            return "";
        }
    });
    const isAdmin = String(user?.role || "").toLowerCase() === "admin";
    const activePath = window.location.pathname;

    const APK_URL = `/downloads/streaming-box-android.apk?v=${encodeURIComponent(APK_RELEASE_ID)}`;
    const showApkButton = !isNativeAndroidApp();
    const hasNewApkRelease = showApkButton && apkDownloadedRelease !== APK_RELEASE_ID;

    function downloadApk() {
        try {
            window.localStorage.setItem(APK_ACK_STORAGE_KEY, APK_RELEASE_ID);
            setApkDownloadedRelease(APK_RELEASE_ID);
        } catch {
            // ignore storage failures
        }

        try {
            const a = document.createElement("a");
            a.href = APK_URL;
            a.download = "streaming-box-android.apk";
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch {
            window.location.href = APK_URL;
        }
    }

    useEffect(() => {
        async function fetchExpirations() {
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
            } catch {
                // Ignore badge fetch failures.
            }
        }

        void fetchExpirations();
        const timer = setInterval(fetchExpirations, 180000);
        return () => clearInterval(timer);
    }, [activePath]);

    function nav(fn) {
        if (isSidebarMobile()) setCollapsed(true);
        if (typeof fn === "function") fn();
    }

    const actionMap = {
        home: onGoHome,
        wallet: onGoWallet,
        orders: onGoOrders,
        renewals: onGoRenewals,
        analytics: onGoAnalytics,
        advertising: onGoAdvertising,
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
                onClick={() => setCollapsed((v) => !v)}
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
                    <span
                        style={{
                            fontSize: 10,
                            position: "absolute",
                            top: 4,
                            right: 4,
                            background: "#EF4444",
                            borderRadius: "50%",
                            width: 16,
                            height: 16,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            fontWeight: 900,
                        }}
                    >
                        {cartCount}
                    </span>
                </button>
            )}

            <aside className={`sidebar sb-new${collapsed ? " sidebar--collapsed" : ""}`}>
                <div className="sb-header">
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
                        {wallet && (
                            <div className="sb-balance-card">
                                <div className="sb-balance-label">SALDO DISPONIBLE</div>
                                <div className="sb-balance-amount">
                                    {Number(wallet?.balance || 0).toLocaleString("es-CO")}
                                    <span className="sb-balance-currency">
                                        {displayCurrency(wallet?.currency, "COP")}
                                    </span>
                                </div>

                                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "10px 0 8px" }} />

                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                    <span
                                        style={{
                                            width: 22,
                                            height: 22,
                                            borderRadius: "50%",
                                            background: "rgba(16,185,129,0.18)",
                                            border: "1px solid rgba(16,185,129,0.35)",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 11,
                                            flexShrink: 0,
                                        }}
                                    >
                                        📈
                                    </span>
                                    <span className="sb-profit-label" style={{ flex: 1, fontSize: 12 }}>Ganancias totales</span>
                                    <span className="sb-profit-value" style={{ fontSize: 13, fontWeight: 800, color: "#10b981" }}>
                                        +{Number(wallet?.profit_total || 0).toLocaleString("es-CO")}
                                    </span>
                                </div>

                                <div style={{ height: 1, background: "rgba(255,255,255,0.04)", margin: "4px 0" }} />

                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        borderLeft: "2.5px solid #13c8ec",
                                        paddingLeft: 8,
                                        marginTop: 4,
                                    }}
                                >
                                    <span
                                        style={{
                                            width: 22,
                                            height: 22,
                                            borderRadius: "50%",
                                            background: "rgba(19,200,236,0.15)",
                                            border: "1px solid rgba(19,200,236,0.4)",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 11,
                                            fontWeight: 900,
                                            color: "#13c8ec",
                                            flexShrink: 0,
                                        }}
                                    >
                                        $
                                    </span>
                                    <span style={{ flex: 1, fontSize: 12, color: "var(--muted)" }}>Inversión total</span>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: "#13c8ec" }}>
                                        {Number(wallet?.total_invested || 0).toLocaleString("es-CO")}
                                    </span>
                                </div>
                            </div>
                        )}

                        <MotionButton
                            className="sb-cart-btn"
                            onClick={() => nav(onOpenCart)}
                            whileHover={{ scale: 1.03, y: -1 }}
                            whileTap={{ scale: 0.97 }}
                            transition={{ type: "spring", stiffness: 380, damping: 22 }}
                        >
                            <span className="sb-cart-content">
                                <span className="sb-cart-icon">🛒</span>
                                <span>Carrito</span>
                            </span>
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

                        <div className="sb-divider" />

                        <nav className="sb-nav">
                            {NAV_ITEMS
                                .filter((item, index, arr) => arr.findIndex((x) => x.key === item.key) === index)
                                .map((item) => {
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
                                        <BalancedText
                                            as="span"
                                            className="sb-nav-label sb-nav-label--balanced"
                                            text={item.label}
                                            maxLines={2}
                                            minWidthRatio={0.74}
                                        />

                                        {item.key === "expirations" && expirationsCount > 0 && !collapsed && (
                                            <span
                                                style={{
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
                                                    animation: "pulse 1.8s infinite",
                                                }}
                                            >
                                                {expirationsCount}
                                            </span>
                                        )}

                                        {isActive && (
                                            <MotionSpan className="sb-nav-active-dot" layoutId="activeNavDot" />
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
                                    <BalancedText
                                        as="span"
                                        className="sb-nav-label sb-nav-label--balanced"
                                        text="Plataformas"
                                        maxLines={2}
                                        minWidthRatio={0.74}
                                    />
                                </MotionButton>
                            )}

                            {showApkButton && (
                                <MotionButton
                                    className="sb-nav-item"
                                    onClick={downloadApk}
                                    whileHover={{ x: 4 }}
                                    whileTap={{ scale: 0.97 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                >
                                    <span className="sb-nav-icon">📱</span>
                                    <BalancedText
                                        as="span"
                                        className="sb-nav-label sb-nav-label--balanced"
                                        text={hasNewApkRelease ? "Descargar app (APK) - Nueva actualización" : "Descargar app (APK)"}
                                        maxLines={2}
                                        minWidthRatio={0.74}
                                    />
                                    {hasNewApkRelease && (
                                        <span
                                            style={{
                                                marginLeft: "auto",
                                                fontSize: 10,
                                                fontWeight: 800,
                                                color: "#fff",
                                                background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                                                borderRadius: 999,
                                                padding: "3px 8px",
                                                boxShadow: "0 0 12px rgba(34,197,94,0.28)",
                                            }}
                                        >
                                            Nueva
                                        </span>
                                    )}
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
                                        <BalancedText
                                            as="span"
                                            className="sb-nav-label sb-nav-label--balanced"
                                            text="Panel Admin"
                                            maxLines={2}
                                            minWidthRatio={0.74}
                                        />
                                    </MotionButton>
                                </>
                            )}
                        </nav>

                        <div className="sb-divider" />

                        <MotionButton
                            className="sb-logout-btn"
                            onClick={onLogout}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.97 }}
                        >
                            <span>↩</span> Cerrar sesión
                        </MotionButton>

                    </>
                )}
            </aside>
        </>
    );
}
