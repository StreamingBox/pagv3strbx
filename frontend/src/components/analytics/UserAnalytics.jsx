import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SalesChart, { MONTH_COLORS } from "./SalesChart";
import DistributionChart from "./DistributionChart";
import { apiGet } from "../../api/api";

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 40, background: "#fff0f0", color: "#d8000c", borderRadius: 12, margin: 20 }}>
                    <h2>Algo salió mal al cargar los gráficos</h2>
                    <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>{this.state.error?.toString()}</pre>
                </div>
            );
        }
        return this.props.children;
    }
}

const MONTH_NAMES = [
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const MONTH_SHORT = [
    "", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
];

const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.07 } }
};
const itemVariants = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 340, damping: 25 } }
};

const TOP_COLORS = ["#0da6f2", "#8b5cf6", "#10b981", "#f43f5e", "#f59e0b"];

/** Formatea clave mes como "2026-03" */
function monthKey(year, month) {
    return `${year}-${String(month).padStart(2, "0")}`;
}

/** Chip de insight rápido */
function InsightChip({ emoji, label, value, color = "var(--accent)" }) {
    return (
        <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "7px 13px",
            background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 12,
        }}>
            <span style={{ fontSize: 15 }}>{emoji}</span>
            <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px" }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 900, color, lineHeight: 1.2 }}>{value}</div>
            </div>
        </div>
    );
}

/** Pill para seleccionar/deseleccionar un mes */
function MonthPill({ label, color, selected, onClick }) {
    return (
        <button
            onClick={onClick}
            style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 20,
                border: selected ? `1.5px solid ${color}` : "1.5px solid var(--stroke)",
                background: selected ? `${color}22` : "var(--card)",
                color: selected ? color : "var(--muted)",
                fontWeight: 700, fontSize: 13, cursor: "pointer",
                transition: "all 0.15s ease", fontFamily: "var(--font)",
                whiteSpace: "nowrap",
            }}
        >
            {selected && <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />}
            {label}
        </button>
    );
}

export default function UserAnalytics() {
    const now = new Date();
    const currentYear = now.getFullYear();

    const [year, setYear] = useState(currentYear);
    const [chartType, setChartType] = useState("area");

    // Meses disponibles (histórico completo para extraer años disponibles)
    const [allHistorical, setAllHistorical] = useState([]);
    const [availableYears, setAvailableYears] = useState([currentYear]);
    const [loadingMonths, setLoadingMonths] = useState(true);

    // Meses seleccionados para comparar (keys "2026-03")
    const [selectedKeys, setSelectedKeys] = useState([]);

    // 1. Cargar histórico completo una sola vez al cargar componente
    useEffect(() => {
        setLoadingMonths(true);
        apiGet(`/analytics/available-months`)
            .then(res => {
                const monthsList = Array.isArray(res?.months) ? res.months : (Array.isArray(res?.data?.months) ? res.data.months : []);
                setAllHistorical(monthsList);

                // Sacar años únicos
                if (monthsList.length > 0) {
                    const years = [...new Set(monthsList.map(m => m.year))].sort((a, b) => b - a);
                    setAvailableYears(years);

                    // Asegurar que `year` sea uno de los años con datos (o el más reciente)
                    if (!years.includes(year) && years.length > 0) {
                        setYear(years[0]); // fallback al más reciente
                    }
                }
            })
            .catch(() => setAllHistorical([]))
            .finally(() => setLoadingMonths(false));
        // Solo montar
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Derivar meses filtrados por año localmente
    const filteredMonths = allHistorical.filter(m => m.year === year);

    // Auto-seleccionar si el año cambia y no hay nada seleccionado (o tras cargar)
    useEffect(() => {
        if (!loadingMonths && selectedKeys.length === 0 && filteredMonths.length > 0) {
            const top2 = filteredMonths.slice(0, 2).map(m => monthKey(m.year, m.month));
            setSelectedKeys(top2);
        }
    }, [filteredMonths, loadingMonths, selectedKeys.length]);

    // 2. Cargar datos de los meses seleccionados
    const loadMultiData = useCallback(async () => {
        if (selectedKeys.length === 0) { setMonthsData([]); return; }
        setLoadingData(true);
        setError("");
        try {
            const res = await apiGet(`/analytics/sales/multi?months=${selectedKeys.join(",")}`);
            const list = Array.isArray(res?.months) ? res.months : (Array.isArray(res?.data?.months) ? res.data.months : []);
            // Agregar label legible a cada mes
            const withLabel = list.map(m => ({
                ...m,
                daily: m.daily || [],
                distribution: Array.isArray(m.distribution) ? m.distribution : [],
                label: `${MONTH_SHORT[m.month]} ${m.year}`,
            }));
            setMonthsData(withLabel);
        } catch (e) {
            setError(e.message || "Error al cargar datos.");
        } finally {
            setLoadingData(false);
        }
    }, [selectedKeys]);

    useEffect(() => { loadMultiData(); }, [loadMultiData]);

    // Toggle selección de mes (máx 6)
    function toggleMonth(key) {
        setSelectedKeys(prev => {
            if (prev.includes(key)) return prev.filter(k => k !== key);
            if (prev.length >= 6) return prev; // máx 6
            return [...prev, key];
        });
    }

    // Mes principal = primero seleccionado
    const primary = monthsData[0] ?? null;
    const secondary = monthsData[1] ?? null;

    // Insights del mes principal
    const pctRaw = primary && secondary && secondary.total > 0
        ? ((primary.total - secondary.total) / secondary.total * 100).toFixed(1)
        : primary && secondary && secondary.total === 0 && primary.total > 0
            ? "100"
            : null;
    const pctNum = pctRaw !== null ? Number(pctRaw) : null;
    const pctLabel = pctNum !== null ? `${pctNum >= 0 ? "+" : ""}${pctNum}%` : "—";
    const pctColor = pctNum === null ? "var(--muted)" : pctNum >= 0 ? "#10b981" : "#ef4444";
    const pctBg = pctNum === null ? "transparent" : pctNum >= 0 ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)";
    const pctBorder = pctNum === null ? "var(--stroke)" : pctNum >= 0 ? "rgba(16,185,129,0.30)" : "rgba(239,68,68,0.25)";

    const avgOrder = primary && primary.orders > 0
        ? Math.round(primary.total / primary.orders).toLocaleString("es-CO")
        : "—";
    const topPlatform = primary?.distribution?.[0]?.name ?? null;

    return (
        <ErrorBoundary>
            <motion.div style={{ marginTop: 20 }} initial="hidden" animate="show" variants={containerVariants}>

                {/* ─── HEADER ─── */}
                <motion.div variants={itemVariants} style={{ marginBottom: 20 }}>
                    {/* Fila título + filtros */}
                    <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        flexWrap: "wrap", gap: 10, marginBottom: 14,
                    }}>
                        <div>
                            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" }}>
                                📊 Mis Analíticas de Ventas
                            </h1>
                            <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--muted)" }}>
                                Selecciona hasta 6 meses para comparar
                            </p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {availableYears.length > 0 && (
                                <select className="select-inline" value={year} onChange={e => {
                                    setYear(Number(e.target.value));
                                    setSelectedKeys([]); // Reset selection on year change
                                }}>
                                    {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            )}
                            <select className="select-inline" value={chartType} onChange={e => setChartType(e.target.value)}>
                                <option value="area">Área</option>
                                <option value="bar">Barras</option>
                            </select>
                        </div>
                    </div>

                    {/* Selector de meses disponibles */}
                    <div style={{ marginBottom: 14 }}>
                        {loadingMonths ? (
                            <div style={{ color: "var(--muted)", fontSize: 13 }}>Cargando datos...</div>
                        ) : filteredMonths.length === 0 ? (
                            <div style={{ color: "var(--muted)", fontSize: 13 }}>Sin ventas registradas.</div>
                        ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginRight: 4 }}>
                                    COMPARAR:
                                </span>
                                {filteredMonths.map((m, i) => {
                                    const key = monthKey(m.year, m.month);
                                    const selIdx = selectedKeys.indexOf(key);
                                    const color = selIdx >= 0 ? MONTH_COLORS[selIdx % MONTH_COLORS.length] : "var(--muted)";
                                    return (
                                        <MonthPill
                                            key={key}
                                            label={`${MONTH_SHORT[m.month]} ${m.year}`}
                                            color={color}
                                            selected={selIdx >= 0}
                                            onClick={() => toggleMonth(key)}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Chips de resumen rápido */}
                    {primary && !loadingData && (
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <InsightChip emoji="💰" label={primary.label} value={`$${Number(primary.total).toLocaleString("es-CO")}`} color="var(--accent)" />
                            <InsightChip emoji="📦" label="Órdenes" value={`${primary.orders} completadas`} color="var(--text)" />
                            {pctLabel !== "—" && secondary && (
                                <InsightChip emoji="📈" label={`vs ${secondary.label}`} value={pctLabel} color={pctColor} />
                            )}
                            {avgOrder !== "—" && (
                                <InsightChip emoji="🧾" label="Ticket promedio" value={`$${avgOrder}`} color="var(--text)" />
                            )}
                            {topPlatform && (
                                <InsightChip emoji="🏆" label="Top plataforma" value={topPlatform} color="#f59e0b" />
                            )}
                        </div>
                    )}
                </motion.div>

                {error && (
                    <motion.div variants={itemVariants} style={{
                        marginBottom: 16, borderRadius: 12, padding: "12px 16px",
                        background: "rgba(239,68,68,.10)", border: "1px solid rgba(239,68,68,.25)",
                        color: "#ef4444", fontSize: 14, fontWeight: 600,
                    }}>{error}</motion.div>
                )}

                {/* KPI Cards de meses seleccionados */}
                {monthsData.length > 0 && !loadingData && (
                    <motion.div initial="hidden" animate="show" variants={containerVariants}
                        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
                        {monthsData.map((m, idx) => {
                            const color = MONTH_COLORS[idx % MONTH_COLORS.length];
                            return (
                                <motion.div key={m.label} variants={itemVariants} className="kpi"
                                    whileHover={{ y: -3 }}
                                    style={{ padding: "18px 20px", borderRadius: 16, borderTop: `3px solid ${color}` }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color, marginBottom: 6 }}>
                                        {m.label}
                                    </div>
                                    <div style={{ fontSize: 26, fontWeight: 900, color: "var(--text)", lineHeight: 1 }}>
                                        <span style={{ fontSize: 16, color: "var(--muted)", marginRight: 1 }}>$</span>
                                        {Number(m.total).toLocaleString("es-CO")}
                                    </div>
                                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                                        {m.orders} órdenes · {m.distribution?.[0]?.name ?? "—"}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                )}

                {(loadingData || loadingMonths) && (
                    <div className="kpi" style={{ color: "var(--muted)", padding: 40, textAlign: "center", borderRadius: 16 }}>
                        <div className="spinner" style={{ margin: "0 auto 14px" }} />
                        Cargando datos...
                    </div>
                )}

                {/* Charts */}
                {monthsData.length > 0 && !loadingData && (
                    <motion.div initial="hidden" animate="show" variants={containerVariants}
                        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16 }}>

                        {/* Gráfico de tendencias */}
                        <motion.div variants={itemVariants} className="kpi"
                            style={{ padding: "20px 22px", borderRadius: 16, gridColumn: "1 / -1" }}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", marginBottom: 16 }}>
                                Tendencia de Ventas — {monthsData.map(m => m.label).join(" vs ")}
                            </div>
                            <SalesChart months={monthsData} chartType={chartType} />
                        </motion.div>

                        {/* Distribución por plataforma del mes principal */}
                        {primary?.distribution && (
                            <motion.div variants={itemVariants} className="kpi" style={{ padding: "20px 22px", borderRadius: 16 }}>
                                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", marginBottom: 16 }}>
                                    Ventas por plataforma · {primary.label}
                                </div>
                                <DistributionChart data={primary.distribution} />
                            </motion.div>
                        )}

                        {/* Top Productos del mes principal */}
                        {primary?.distribution && (
                            <motion.div variants={itemVariants} className="kpi"
                                style={{ padding: "20px 22px", borderRadius: 16, display: "flex", flexDirection: "column" }}>
                                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", marginBottom: 16 }}>
                                    Top Productos · {primary.label}
                                </div>
                                {primary.distribution.slice(0, 5).map((item, idx) => (
                                    <motion.div key={idx}
                                        whileHover={{ x: 4 }}
                                        style={{
                                            display: "flex", justifyContent: "space-between", alignItems: "center",
                                            padding: "11px 14px", background: "var(--card)",
                                            borderRadius: 10, marginBottom: 8,
                                            border: "1px solid var(--stroke)", transition: "all 0.15s ease",
                                        }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                            <div style={{
                                                width: 28, height: 28, borderRadius: "50%",
                                                background: TOP_COLORS[idx % TOP_COLORS.length],
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                fontWeight: 900, fontSize: 12, color: "#fff", flexShrink: 0,
                                            }}>
                                                {idx + 1}
                                            </div>
                                            <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
                                                {item.name}
                                            </span>
                                        </div>
                                        <span style={{ fontWeight: 800, fontSize: 14, color: "var(--accent)", whiteSpace: "nowrap" }}>
                                            ${Number(item.value).toLocaleString("es-CO")}
                                        </span>
                                    </motion.div>
                                ))}
                            </motion.div>
                        )}
                    </motion.div>
                )}

                {/* Sin meses seleccionados */}
                {selectedKeys.length === 0 && !loadingMonths && (
                    <div style={{
                        textAlign: "center", padding: "60px 20px", color: "var(--muted)",
                        border: "1px dashed var(--stroke)", borderRadius: 16, fontSize: 14,
                    }}>
                        Selecciona al menos un mes para ver los datos.
                    </div>
                )}
            </motion.div>
        </ErrorBoundary>
    );
}
