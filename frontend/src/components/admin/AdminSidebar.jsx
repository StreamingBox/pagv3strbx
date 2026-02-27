import ThemeToggle from "../ThemeToggle.jsx";
import NavItem from "./NavItem.jsx";

export default function AdminSidebar({
                                         user,
                                         logoSrc,
                                         logoOk,
                                         setLogoOk,
                                         uploadingLogo,
                                         onOpenLogoPicker,
                                         onLogout,
                                         onNavigate,
                                     }) {
    return (
        <aside className="sidebar">
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

                    <div style={{ minWidth: 0 }}>
                        <div className="title">Streaming Box</div>
                        <div className="subtitle">Panel administrador</div>

                        <button
                            className="btn-ghost"
                            onClick={onOpenLogoPicker}
                            disabled={uploadingLogo}
                            style={{
                                marginTop: 8,
                                height: 34,
                                padding: "0 10px",
                                borderRadius: 12,
                                width: "fit-content",
                            }}
                        >
                            {uploadingLogo ? "Subiendo..." : "Cambiar logo"}
                        </button>
                    </div>
                </div>

                <ThemeToggle />
            </div>

            <div className="nav-title" style={{ marginTop: 14 }}>
                Navegación
            </div>

            <p className="nav-sub">
                Sesión: <b>{user?.email || "admin"}</b>
            </p>

            <NavItem
                icon="👤"
                tone="blue"
                title="Usuarios"
                hint="Crear, bloquear, contraseña"
                to="/admin/users"
                onNavigate={onNavigate}
            />

            <NavItem
                icon="💳"
                tone="accent"
                title="Planes / Precios"
                hint="Plataforma + duración + precio"
                to="/admin/prices"
                onNavigate={onNavigate}
            />

            <NavItem
                icon="📦"
                tone="green"
                title="Inventario"
                hint="Disponibles / vendidas"
                to="/admin/inventory"
                onNavigate={onNavigate}
            />

            <NavItem
                icon="🧩"
                tone="orange"
                title="Plataformas / Productos"
                hint="Crear plataformas y productos"
                to="/admin/platforms"
                onNavigate={onNavigate}
            />

            {/* ✅ NUEVO: CATEGORÍAS */}
            <NavItem
                icon="🏷️"
                tone="accent"
                title="Categorías"
                hint="Video, IA, Música, etc."
                to="/admin/categories"
                onNavigate={onNavigate}
            />

            <NavItem
                icon="🔐"
                tone="blue"
                title="Inventario de Cuentas"
                hint="Subir cuentas a vender"
                to="/admin/accounts"
                onNavigate={onNavigate}
            />

            <NavItem
                icon="🧾"
                tone="orange"
                title="Historial de Compras"
                hint="Órdenes y detalles"
                to="/admin/orders"
                onNavigate={onNavigate}
            />

            <NavItem
                icon="⏱️"
                tone="accent"
                title="Duraciones"
                hint="Mensual, trimestral, etc."
                to="/admin/durations"
                onNavigate={onNavigate}
            />

            <NavItem
                icon="🛠️"
                tone="blue"
                title="Soporte"
                hint="Reemplazar cuentas caídas"
                to="/admin/support"
                onNavigate={onNavigate}
            />

            <button
                className="btn-ghost"
                onClick={onLogout}
                style={{ marginTop: 10, width: "100%" }}
            >
                Cerrar sesión
            </button>



        </aside>
    );
}
