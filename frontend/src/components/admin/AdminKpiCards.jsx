import { motion } from "framer-motion";
import IconBadge from "./IconBadge.jsx";
import "../../styles/special-effects.css";

// Diversidad de colores para que no se repitan tanto (diseño Hyper-Premium)
const TONE_COLORS = {
    blue: { border: "#3b82f6", glow: "rgba(59, 130, 246, .22)" },
    emerald: { border: "#10b981", glow: "rgba(16, 185, 129, .20)" },
    violet: { border: "#8b5cf6", glow: "rgba(139, 92, 246, .20)" },
    amber: { border: "#f59e0b", glow: "rgba(245, 158, 11, .20)" },
    pink: { border: "#ec4899", glow: "rgba(236, 72, 153, .20)" },
    cyan: { border: "#06b6d4", glow: "rgba(6, 182, 212, .20)" },
    orange: { border: "#f97316", glow: "rgba(249, 115, 22, .20)" },
    lime: { border: "#84cc16", glow: "rgba(132, 204, 22, .20)" },
    red: { border: "#ef4444", glow: "rgba(239, 68, 68, .20)" },
    indigo: { border: "#6366f1", glow: "rgba(99, 102, 241, .20)" },
    fuchsia: { border: "#d946ef", glow: "rgba(217, 70, 239, .20)" },
    sky: { border: "#0ea5e9", glow: "rgba(14, 165, 233, .20)" },
    rose: { border: "#f43f5e", glow: "rgba(244, 63, 94, .20)" },
    teal: { border: "#14b8a6", glow: "rgba(20, 184, 166, .20)" },
};

const containerVariants = {
    hidden: {},
    show: {
        transition: { staggerChildren: 0.045 }
    }
};

const itemVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    show: {
        opacity: 1, scale: 1,
        transition: { type: "spring", stiffness: 300, damping: 25 }
    }
};

export default function AdminKpiCards({ onNavigate }) {
    const sections = [
        { icon: "📊", tone: "blue", title: "Estadísticas", hint: "Ventas: mes actual vs anterior.", path: "/admin/analytics" },
        { icon: "🔄", tone: "emerald", title: "Renovaciones", hint: "Renovar pedidos y descontar saldo.", path: "/admin/renewals" },
        { icon: "👤", tone: "violet", title: "Usuarios", hint: "Crear, bloquear, cambiar contraseña.", path: "/admin/users" },
        { icon: "💲", tone: "amber", title: "Transacciones / Saldo", hint: "Global y por usuario.", path: "/admin/transactions" },
        { icon: "💳", tone: "pink", title: "Planes / Precios", hint: "Plataforma + duración + precio.", path: "/admin/prices" },
        { icon: "📦", tone: "cyan", title: "Inventario", hint: "Cuentas disponibles / vendidas.", path: "/admin/inventory" },
        { icon: "🧩", tone: "orange", title: "Plataformas / Productos", hint: "Crear plataformas y productos.", path: "/admin/platforms" },
        { icon: "🏷️", tone: "lime", title: "Categorías", hint: "Video, IA, Música, etc.", path: "/admin/categories" },
        { icon: "🔐", tone: "red", title: "Inventario de Cuentas", hint: "Subir cuentas a vender.", path: "/admin/accounts" },
        { icon: "🧾", tone: "indigo", title: "Historial de Compras", hint: "Órdenes y detalles.", path: "/admin/orders" },
        { icon: "⏱️", tone: "fuchsia", title: "Duraciones", hint: "Mensual, trimestral, etc.", path: "/admin/durations" },
        { icon: "📜", tone: "sky", title: "Logs de Códigos", hint: "Historial de solicitudes de pines.", path: "/admin/code-logs" },
        { icon: "⏳", tone: "rose", title: "Vencimientos", hint: "Cuentas próximas a vencer.", path: "/admin/expirations" },
        { icon: "🛠️", tone: "teal", title: "Soporte", hint: "Reemplazar cuentas caídas.", path: "/admin/support" },
    ];

    return (
        <motion.div
            className="admin-cards-grid"
            variants={containerVariants}
            initial="hidden"
            animate="show"
        >
            {sections.map((s) => {
                const { border, glow } = TONE_COLORS[s.tone] || TONE_COLORS.blue;
                return (
                    <motion.div
                        key={s.path}
                        variants={itemVariants}
                        className="stitch-beam-container"
                        whileHover={{ scale: 1.02, y: -4 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onNavigate(s.path)}
                        style={{
                            "--beam-color": border,
                            cursor: "pointer",
                            display: "flex",
                            height: "100%"
                        }}
                    >
                        <div
                            className="stitch-beam-content"
                            style={{
                                padding: 16,
                                display: "flex",
                                gap: 14,
                                alignItems: "center",
                                justifyContent: "flex-start",
                                background: "#060912",
                                border: `1px solid rgba(255,255,255,0.03)`,
                            }}
                        >
                            <IconBadge icon={s.icon} tone={s.tone} />
                            <div>
                                <div style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>
                                    {s.title}
                                </div>
                                <div style={{ marginTop: 4, color: "rgba(255,255,255,0.5)", fontSize: 11, lineHeight: 1.4 }}>
                                    {s.hint}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                );
            })}
        </motion.div>
    );
}
