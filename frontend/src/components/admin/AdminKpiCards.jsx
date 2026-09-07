import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { DatabaseZap, RefreshCcw } from "lucide-react";
import IconBadge from "./IconBadge.jsx";
import { apiFetch } from "../../api/api.js";
import "../../styles/special-effects.css";

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
        transition: { staggerChildren: 0.045 },
    },
};

const itemVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    show: {
        opacity: 1,
        scale: 1,
        transition: { type: "spring", stiffness: 300, damping: 25 },
    },
};

export default function AdminKpiCards({ onNavigate }) {
    const [supportSummary, setSupportSummary] = useState({ counts: {}, latest: [] });

    useEffect(() => {
        let cancelled = false;
        async function loadSupportSummary() {
            const response = await apiFetch("/admin/support-tickets/summary?limit=5");
            if (!cancelled && response.ok) {
                setSupportSummary({
                    counts: response.data?.counts || {},
                    latest: response.data?.latest || [],
                });
            }
        }
        void loadSupportSummary();
        const timer = setInterval(loadSupportSummary, 60000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, []);

    const groups = [
        {
            groupName: "Ventas & Finanzas",
            items: [
                { icon: "📊", tone: "blue", title: "Ganancias Netas", hint: "Ingresos, costos, utilidad y margen.", path: "/admin/analytics" },
                { icon: "🏆", tone: "violet", title: "Top de Ventas", hint: "Ranking mensual por vendedor.", path: "/admin/sales-top" },
                { icon: "💲", tone: "amber", title: "Transacciones / Saldo", hint: "Global y por usuario.", path: "/admin/transactions" },
                { icon: "💸", tone: "sky", title: "Recargas", hint: "Comprobantes y aprobaciones.", path: "/admin/topups" },
                { icon: "🧾", tone: "indigo", title: "Historial de Compras", hint: "Órdenes y detalles.", path: "/admin/orders" },
                { icon: "🔄", tone: "emerald", title: "Renovaciones", hint: "Renovar pedidos.", path: "/admin/renewals" },
            ],
        },
        {
            groupName: "Cuentas & Inventario",
            items: [
                { icon: "🔐", tone: "red", title: "Inventario de Cuentas", hint: "Crear y cargar cuentas/pines.", path: "/admin/accounts" },
                { icon: "📦", tone: "cyan", title: "Inventario General", hint: "Control de stock global.", path: "/admin/inventory" },
                { icon: "🏭", tone: "orange", title: "Proveedores", hint: "Gestiona proveedores y sus cuentas.", path: "/admin/providers" },
                { icon: <DatabaseZap size={20} strokeWidth={2.4} aria-hidden />, tone: "amber", title: "Cuentas Maestras", hint: "Cuentas caidas y reemplazo automatico.", path: "/admin/master-accounts" },
                { icon: "🔗", tone: "teal", title: "Links", hint: "Enlaces de credenciales.", path: "/admin/links" },
                { icon: "⏳", tone: "rose", title: "Vencimientos", hint: "Cuentas próximas a vencer.", path: "/admin/expirations" },
                { icon: <RefreshCcw size={20} strokeWidth={2.4} aria-hidden />, tone: "amber", title: "Reinicio de Codigo", hint: "Reinicia intentos por pedido.", path: "/admin/code-reset" },
                { icon: "📜", tone: "sky", title: "Logs de Códigos", hint: "Historial de pines generados.", path: "/admin/code-logs" },
            ],
        },
        {
            groupName: "Catálogo & Oferta",
            items: [
                { icon: "🏷️", tone: "lime", title: "Categorías", hint: "Streaming, IA, Música, etc.", path: "/admin/categories" },
                { icon: "🧩", tone: "orange", title: "Plataformas", hint: "Gestión de plataformas.", path: "/admin/platforms" },
                { icon: "💳", tone: "pink", title: "Planes y Precios", hint: "Configuración de precios.", path: "/admin/prices" },
                { icon: "🎁", tone: "emerald", title: "Combos", hint: "Paquetes con precio propio.", path: "/admin/combos" },
                { icon: "⏱️", tone: "fuchsia", title: "Duraciones", hint: "Mensualidades, trimestres, etc.", path: "/admin/durations" },
                { icon: "📢", tone: "sky", title: "Publicidad", hint: "Imágenes y carpetas de Drive.", path: "/admin/advertising" },
            ],
        },
        {
            groupName: "Usuarios & Atención",
            items: [
                { icon: "👤", tone: "violet", title: "Usuarios", hint: "Gestión de clientes/vendedores.", path: "/admin/users" },
                { icon: "🛠️", tone: "teal", title: "Soporte Técnico", hint: "Reemplazos y cuentas caídas.", path: "/admin/support" },
            ],
        },
    ];

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            style={{ display: "flex", flexDirection: "column", gap: 28, marginTop: -2 }}
        >
            {groups.map((group) => (
                <div key={group.groupName}>
                    <div
                        style={{
                            fontSize: 14,
                            fontWeight: 900,
                            color: "var(--text)",
                            textTransform: "uppercase",
                            letterSpacing: 1.2,
                            marginBottom: 14,
                            borderBottom: "1px solid var(--line)",
                            paddingBottom: 8,
                            opacity: 0.8,
                        }}
                    >
                        {group.groupName}
                    </div>

                    <div className="admin-cards-grid" style={{ marginTop: 0 }}>
                        {group.items.map((s) => {
                            const { border } = TONE_COLORS[s.tone] || TONE_COLORS.blue;
                            const isSupportCard = s.path === "/admin/support";
                            const supportPending = Number(supportSummary.counts?.pending || 0);
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
                                    }}
                                >
                                    <div
                                        className="stitch-beam-content"
                                        style={{
                                            padding: "20px 18px",
                                            display: "flex",
                                            gap: "16px",
                                            alignItems: "center",
                                            justifyContent: "flex-start",
                                            border: "1px solid var(--line)",
                                            width: "100%",
                                            background: "var(--card)",
                                            backdropFilter: "blur(18px)",
                                            borderRadius: "inherit",
                                            position: "relative",
                                        }}
                                    >
                                        {isSupportCard && supportPending > 0 ? (
                                            <span
                                                style={{
                                                    position: "absolute",
                                                    top: 12,
                                                    right: 12,
                                                    minWidth: 26,
                                                    height: 26,
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    padding: "0 8px",
                                                    borderRadius: 99,
                                                    background: "#f59e0b",
                                                    color: "#111827",
                                                    fontSize: 12,
                                                    fontWeight: 900,
                                                    boxShadow: "0 0 16px rgba(245,158,11,.35)",
                                                }}
                                            >
                                                {supportPending}
                                            </span>
                                        ) : null}
                                        <IconBadge icon={s.icon} tone={s.tone} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div
                                                style={{
                                                    fontWeight: 800,
                                                    fontSize: "14.5px",
                                                    color: "var(--text)",
                                                    letterSpacing: "-0.2px",
                                                }}
                                            >
                                                {s.title}
                                            </div>
                                            <div
                                                style={{
                                                    marginTop: 4,
                                                    color: "var(--muted)",
                                                    fontSize: "12px",
                                                    lineHeight: 1.4,
                                                    fontWeight: 500,
                                                }}
                                            >
                                                {s.hint}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    {group.items.some((item) => item.path === "/admin/support") && supportSummary.latest?.length ? (
                        <div
                            style={{
                                marginTop: 12,
                                padding: 14,
                                border: "1px solid rgba(20,184,166,.24)",
                                borderRadius: 12,
                                background: "linear-gradient(135deg, rgba(20,184,166,.10), rgba(14,165,233,.06))",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 10,
                                    marginBottom: 10,
                                }}
                            >
                                <strong style={{ color: "var(--text)", fontSize: 13 }}>Top 5 novedades recientes</strong>
                                <span style={{ color: "#5eead4", fontSize: 11, fontWeight: 900 }}>
                                    {supportSummary.counts?.pending || 0} pendientes
                                </span>
                            </div>
                            <div style={{ display: "grid", gap: 7 }}>
                                {supportSummary.latest.slice(0, 5).map((ticket) => (
                                    <button
                                        type="button"
                                        key={ticket.id}
                                        onClick={() => onNavigate("/admin/support")}
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "minmax(0, 1fr) auto",
                                            gap: 10,
                                            alignItems: "center",
                                            width: "100%",
                                            padding: "9px 10px",
                                            border: "1px solid var(--stroke2)",
                                            borderRadius: 8,
                                            background: "rgba(6,12,30,.30)",
                                            color: "var(--text)",
                                            textAlign: "left",
                                            cursor: "pointer",
                                        }}
                                    >
                                        <span style={{ minWidth: 0 }}>
                                            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: 800 }}>
                                                #{ticket.subscriptionId} · {ticket.platformName}
                                            </span>
                                            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--muted)", fontSize: 11 }}>
                                                {ticket.ticketCode} · {ticket.userEmail}
                                            </span>
                                        </span>
                                        <span style={{ color: ticket.status === "open" ? "#f59e0b" : "#22d3ee", fontSize: 10, fontWeight: 900 }}>
                                            {ticket.status === "open" ? "Nuevo" : "En revision"}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            ))}
        </motion.div>
    );
}
