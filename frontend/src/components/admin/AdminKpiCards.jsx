import IconBadge from "./IconBadge.jsx";

export default function AdminKpiCards({ onNavigate }) {
    const sections = [
        { icon: "📊", tone: "blue", title: "Estadísticas", hint: "Ventas: mes actual vs anterior.", path: "/admin/analytics" },
        { icon: "🔄", tone: "green", title: "Renovaciones", hint: "Renovar pedidos y descontar saldo.", path: "/admin/renewals" },
        { icon: "👤", tone: "blue", title: "Usuarios", hint: "Crear, bloquear, cambiar contraseña.", path: "/admin/users" },
        { icon: "💲", tone: "green", title: "Transacciones / Saldo", hint: "Global y por usuario.", path: "/admin/transactions" },
        { icon: "💳", tone: "accent", title: "Planes / Precios", hint: "Plataforma + duración + precio.", path: "/admin/prices" },
        { icon: "📦", tone: "green", title: "Inventario", hint: "Cuentas disponibles / vendidas.", path: "/admin/inventory" },
        { icon: "🧩", tone: "orange", title: "Plataformas / Productos", hint: "Crear plataformas y productos.", path: "/admin/platforms" },
        { icon: "🏷️", tone: "accent", title: "Categorías", hint: "Video, IA, Música, etc.", path: "/admin/categories" },
        { icon: "🔐", tone: "blue", title: "Inventario de Cuentas", hint: "Subir cuentas a vender.", path: "/admin/accounts" },
        { icon: "🧾", tone: "orange", title: "Historial de Compras", hint: "Órdenes y detalles.", path: "/admin/orders" },
        { icon: "⏱️", tone: "accent", title: "Duraciones", hint: "Mensual, trimestral, etc.", path: "/admin/durations" },
        { icon: "📜", tone: "blue", title: "Logs de Códigos", hint: "Historial de solicitudes de pines.", path: "/admin/code-logs" },
        { icon: "⏳", tone: "purple", title: "Vencimientos", hint: "Cuentas próximas a vencer.", path: "/admin/expirations" },
        { icon: "🛠️", tone: "purple", title: "Soporte", hint: "Reemplazar cuentas caídas.", path: "/admin/support" },
    ];

    return (
        <div className="admin-cards-grid">
            {sections.map((s) => (
                <div
                    key={s.path}
                    className="kpi"
                    style={{ padding: 14, display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s" }}
                    onClick={() => onNavigate(s.path)}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(46,123,255,0.18)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = ""; }}
                >
                    <IconBadge icon={s.icon} tone={s.tone} />
                    <div>
                        <div style={{ fontWeight: 900, fontSize: 13 }}>{s.title}</div>
                        <div style={{ marginTop: 3, color: "var(--muted)", fontSize: 11 }}>{s.hint}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}
