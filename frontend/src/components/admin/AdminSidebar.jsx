import { useState } from "react";
import ThemeToggle from "../ThemeToggle.jsx";

export default function AdminSidebar({
    user,
    logoSrc,
    logoOk,
    setLogoOk,
    uploadingLogo,
    onOpenLogoPicker,
    onLogout,
}) {
    const [collapsed, setCollapsed] = useState(false);

    return (
        <>
            {/* Overlay oscuro para cerrar el sidebar en móvil */}
            {!collapsed && (
                <div
                    className="sidebar-overlay"
                    onClick={() => setCollapsed(true)}
                />
            )}

            {/* Botón hamburger (solo visible en móvil) */}
            <button
                className="sidebar-toggle-btn"
                onClick={() => setCollapsed((v) => !v)}
                title={collapsed ? "Abrir menú" : "Cerrar menú"}
            >
                {collapsed ? "☰" : "✕"}
            </button>

            <aside className={`sidebar${collapsed ? " sidebar--collapsed" : ""}`}>
                <div className="sidebar-top">
                    <div className="brand-row">
                        {logoOk ? (
                            <img
                                className="brand-logo-img"
                                src={logoSrc}
                                alt="Logo"
                                onError={() => setLogoOk(false)}
                            />
                        ) : null}

                        {!collapsed && (
                            <div style={{ minWidth: 0 }}>
                                <div className="title">Streaming Box</div>
                                <div className="subtitle">Panel administrador</div>

                                <button
                                    className="btn-ghost"
                                    onClick={onOpenLogoPicker}
                                    disabled={uploadingLogo}
                                    style={{ marginTop: 8, height: 34, padding: "0 10px", borderRadius: 12, width: "fit-content" }}
                                >
                                    {uploadingLogo ? "Subiendo..." : "Cambiar logo"}
                                </button>
                            </div>
                        )}
                    </div>

                    {!collapsed && <ThemeToggle />}
                </div>

                {!collapsed && (
                    <>
                        <div className="nav-title" style={{ marginTop: 14 }}>Sesión</div>
                        <p className="nav-sub">
                            <b>{user?.email || "admin"}</b>
                        </p>

                        <button
                            className="btn-ghost"
                            onClick={onLogout}
                            style={{ marginTop: "auto", width: "100%" }}
                        >
                            Cerrar sesión
                        </button>
                    </>
                )}
            </aside>
        </>
    );
}
