import IconBadge from "./IconBadge.jsx";

export default function AdminKpiCards() {
    return (
        <div className="kpi-row">
            <div className="kpi" style={{ padding: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <IconBadge icon="👤" tone="blue" />
                <div>
                    <div style={{ fontWeight: 900 }}>Usuarios</div>
                    <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 12 }}>
                        Crear, bloquear, cambiar contraseña.
                    </div>
                </div>
            </div>

            <div className="kpi" style={{ padding: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <IconBadge icon="📦" tone="green" />
                <div>
                    <div style={{ fontWeight: 900 }}>Inventario</div>
                    <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 12 }}>
                        Cuentas disponibles / vendidas.
                    </div>
                </div>
            </div>

            <div className="kpi" style={{ padding: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <IconBadge icon="🧾" tone="orange" />
                <div>
                    <div style={{ fontWeight: 900 }}>Compras</div>
                    <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 12 }}>
                        Historial completo de órdenes.
                    </div>
                </div>
            </div>
        </div>
    );
}
