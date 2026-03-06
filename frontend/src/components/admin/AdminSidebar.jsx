import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import ThemeToggle from "../ThemeToggle.jsx";

const NAV_GROUPS = [
    {
        title: "Principal",
        links: [
            { path: "/admin", label: "Panel Principal", icon: "🏠" },
        ]
    },
    {
        title: "Ventas & Finanzas",
        links: [
            { path: "/admin/analytics", label: "Estadísticas", icon: "📊" },
            { path: "/admin/transactions", label: "Transacciones / Saldo", icon: "💲" },
            { path: "/admin/orders", label: "Historial de Compras", icon: "📜" },
            { path: "/admin/renewals", label: "Renovaciones", icon: "🔄" },
        ]
    },
    {
        title: "Cuentas & Inventario",
        links: [
            { path: "/admin/accounts", label: "Inventario de Cuentas", icon: "🔐" },
            { path: "/admin/inventory", label: "Inventario General", icon: "📦" },
            { path: "/admin/expirations", label: "Vencimientos", icon: "⏳" },
            { path: "/admin/code-logs", label: "Logs de Códigos", icon: "🎫" },
        ]
    },
    {
        title: "Catálogo & Oferta",
        links: [
            { path: "/admin/categories", label: "Categorías", icon: "📁" },
            { path: "/admin/platforms", label: "Plataformas", icon: "📺" },
            { path: "/admin/prices", label: "Planes y Precios", icon: "💳" },
            { path: "/admin/durations", label: "Duraciones", icon: "⏱️" },
        ]
    },
    {
        title: "Usuarios & Atención",
        links: [
            { path: "/admin/users", label: "Usuarios", icon: "👥" },
            { path: "/admin/support", label: "Soporte Técnico", icon: "🎧" },
        ]
    }
];

export default function AdminSidebar({
    user,
    logoSrc,
    logoOk,
    setLogoOk,
    uploadingLogo,
    onOpenLogoPicker,
    onLogout,
}) {
    const [collapsed, setCollapsed] = useState(false); // By default, sidebar is expanded/fixed
    const [isHovered, setIsHovered] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const handleResize = () => {
            if (typeof window !== "undefined") {
                const mobile = window.innerWidth <= 900;
                setIsMobile(mobile);
                // On resize, ensure mobile drawer is closed by default to prevent issues
                if (mobile && !isMobile) setCollapsed(true);
            }
        };
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [isMobile]);

    // effectiveCollapsed determines visual state. 
    // On mobile: it's strictly controlled by the hamburger menu (`collapsed` state).
    // On desktop: it's collapsed by default, but hovering expands it (`collapsed && !isHovered`).
    const effectiveCollapsed = isMobile ? collapsed : (collapsed && !isHovered);

    return (
        <>
            {/* Overlay oscuro para cerrar el sidebar en móvil */}
            {isMobile && !effectiveCollapsed && (
                <div
                    className="sidebar-overlay"
                    onClick={() => setCollapsed(true)}
                />
            )}

            {/* Botón hamburger (solo visible en móvil) */}
            <button
                className="sidebar-toggle-btn"
                onClick={() => setCollapsed((v) => !v)}
                title={effectiveCollapsed ? "Abrir menú" : "Cerrar menú"}
                style={{ zIndex: 1000 }}
            >
                {effectiveCollapsed ? "☰" : "✕"}
            </button>

            <aside
                className={`sidebar${effectiveCollapsed ? " sidebar--collapsed" : ""}`}
                style={{ 
                    padding: "0", 
                    display: "flex", 
                    flexDirection: "column", 
                    background: "var(--card)", 
                    borderRight: "1px solid var(--stroke)", 
                    overflowY: "auto", 
                    overflowX: "hidden", 
                    zIndex: 999
                }}
                onMouseEnter={() => !isMobile && setIsHovered(true)}
                onMouseLeave={() => !isMobile && setIsHovered(false)}
            >
                {/* Cabecera Sidebar */}
                <div style={{ padding: effectiveCollapsed ? "24px 8px" : "24px 20px", transition: "padding 0.2s" }}>
                    <div className="brand-row" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: effectiveCollapsed ? 0 : 12, cursor: "pointer", justifyContent: effectiveCollapsed ? "center" : "flex-start" }} onClick={() => navigate("/admin")}>
                        {logoOk ? (
                            <img
                                src={logoSrc}
                                alt="Logo"
                                onError={() => setLogoOk(false)}
                                style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", flexShrink: 0 }}
                            />
                        ) : (
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(13,166,242,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0da6f2", fontWeight: 800, flexShrink: 0 }}>SB</div>
                        )}

                        {!effectiveCollapsed && (
                            <div style={{ minWidth: 0, overflow: "hidden" }}>
                                <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text)", whiteSpace: "nowrap" }}>Streaming Box</div>
                                <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Admin Panel</div>
                            </div>
                        )}
                    </div>

                    {!effectiveCollapsed && (
                        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                            <button
                                className="btn-ghost"
                                onClick={onOpenLogoPicker}
                                disabled={uploadingLogo}
                                style={{ flex: 1, height: 32, fontSize: 11, padding: "0", borderRadius: 8, minHeight: 0 }}
                            >
                                {uploadingLogo ? "Subiendo..." : "Cambiar logo"}
                            </button>
                            <ThemeToggle />
                        </div>
                    )}
                </div>

                {/* Navegación por Grupos */}
                <div style={{ flex: 1, padding: effectiveCollapsed ? "10px 8px 24px" : "0 12px 24px", display: "flex", flexDirection: "column", gap: effectiveCollapsed ? 12 : 24, transition: "padding 0.2s" }}>
                    {NAV_GROUPS.map((group, idx) => (
                        <div key={idx}>
                            {!effectiveCollapsed && (
                                <div style={{ padding: "0 12px", fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8, whiteSpace: "nowrap" }}>
                                    {group.title}
                                </div>
                            )}
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {group.links.map(link => {
                                    const isActive = location.pathname === link.path;
                                    return (
                                        <div
                                            key={link.path}
                                            onClick={() => {
                                                navigate(link.path);
                                                if (isMobile) setCollapsed(true);
                                            }}
                                            title={effectiveCollapsed ? link.label : ""}
                                            style={{
                                                display: "flex", alignItems: "center", gap: 12,
                                                padding: effectiveCollapsed ? "12px" : "12px 14px",
                                                justifyContent: effectiveCollapsed ? "center" : "flex-start",
                                                borderRadius: 14, cursor: "pointer", transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                                                background: isActive ? "linear-gradient(135deg, rgba(13,166,242,0.15), rgba(99,51,255,0.08))" : "transparent",
                                                color: isActive ? "#0ca5e9" : "var(--muted)",
                                                border: isActive ? "1px solid rgba(13,166,242,0.25)" : "1px solid transparent",
                                                boxShadow: isActive ? "0 8px 16px rgba(0, 0, 0, 0.2)" : "none",
                                                position: "relative",
                                                overflow: "hidden"
                                            }}
                                            onMouseEnter={e => {
                                                if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                                            }}
                                            onMouseLeave={e => {
                                                if (!isActive) e.currentTarget.style.background = "transparent";
                                            }}
                                        >
                                            <span style={{ fontSize: 18, opacity: isActive ? 1 : 0.8, filter: isActive ? "drop-shadow(0 0 4px rgba(13,166,242,0.6))" : "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                {link.icon}
                                            </span>
                                            {!effectiveCollapsed && (
                                                <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    {link.label}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Perfil Usuario */}
                <div style={{ padding: effectiveCollapsed ? "16px 8px" : "16px 20px", borderTop: "1px solid var(--stroke)", background: "var(--bg0)", marginTop: "auto", transition: "padding 0.2s" }}>
                    {!effectiveCollapsed ? (
                        <>
                            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>SESIÓN ACTUAL</div>
                            <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 16 }}>
                                {user?.email || "admin"}
                            </div>
                            <button
                                className="btn-ghost"
                                onClick={onLogout}
                                style={{ width: "100%", height: 36, fontSize: 12, borderRadius: 8, minHeight: 0, color: "var(--muted)" }}
                            >
                                Cerrar sesión
                            </button>
                        </>
                    ) : (
                        <div
                            title="Cerrar sesión"
                            onClick={onLogout}
                            style={{ width: "100%", height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--muted)", borderRadius: 8, transition: "background 0.2s" }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(239, 68, 68, .1)"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                            <span style={{ fontSize: 18 }}>🚪</span>
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}
