import { useState, useEffect, useCallback, useMemo } from "react";
import {
    ResponsiveContainer, BarChart, Bar,
    AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { apiGet } from "../../api/api";
import useMediaQuery from "../../hooks/useMediaQuery.js";
import { formatCurrency, getAverageTicket, getWeeklyProjection } from "../../utils/analyticsForecast.js";

const WEEK_COLORS = ["#0da6f2", "#8b5cf6", "#10b981", "#f59e0b", "#f43f5e", "#06b6d4"];

const MONTH_SHORT = [
    "", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function fmt(val) {
    if (!val) return "$0";
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}k`;
    return `$${val}`;
}
function fmtFull(val) {
    return `$${Number(val || 0).toLocaleString("es-CO")}`;
}

/* ── Tooltip personalizado ── */
function WeekTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    const light = document.documentElement.getAttribute("data-theme") === "light";
    return (
        <div style={{
            background: light ? "rgba(255,255,255,0.97)" : "rgba(10,15,30,0.96)",
            border: "1px solid rgba(13,166,242,0.25)",
            borderRadius: 12, padding: "10px 14px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)", minWidth: 160,
        }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 7, borderBottom: "1px solid var(--stroke2)", paddingBottom: 5 }}>
                📅 {label}
            </div>
            {payload.map((p, i) => (
                p.value > 0 && (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 14, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: p.fill, fontWeight: 600 }}>{p.name}</span>
                        <span style={{ fontSize: 13, fontWeight: 900, color: "var(--text)" }}>
                            {fmtFull(p.value)}
                        </span>
                    </div>
                )
            ))}
        </div>
    );
}

/* ── Tarjeta KPI por mes ── */
function MonthKpiCard({ monthData, color, monthKey, averageTicket, projection }) {
    const bestWeek = [...(monthData?.weeks ?? [])].sort((a, b) => b.revenue - a.revenue)[0];
    return (
        <div style={{
            flex: "1 1 180px",
            minWidth: 0,
            background: "var(--card)",
            border: "1px solid var(--stroke)",
            borderRadius: 16,
            padding: "16px 18px",
            borderTop: `3px solid ${color}`,
            boxShadow: `0 4px 20px rgba(0,0,0,0.08), 0 0 0 1px ${color}18`,
            position: "relative", overflow: "hidden",
        }}>
            <div style={{ position: "absolute", top: -10, right: -10, width: 60, height: 60, borderRadius: "50%", background: `${color}18`, filter: "blur(16px)", pointerEvents: "none" }} />
            <div style={{ fontSize: 10, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
                {monthKey}
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.5px", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                {fmtFull(monthData?.total ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 7, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                📦 {monthData?.orders ?? 0} órdenes
                {bestWeek?.revenue > 0 && (
                    <span style={{ marginLeft: 8, color, fontWeight: 700 }}>
                        · Mejor: {bestWeek.label}
                    </span>
                )}
            </div>
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 8,
                marginTop: 14,
                paddingTop: 12,
                borderTop: "1px solid var(--stroke2)",
                minWidth: 0,
            }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                        Ticket prom.
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#10b981", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {formatCurrency(averageTicket)}
                    </div>
                </div>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                        {projection?.isProjection ? "Proyección" : "Promedio"}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 900, color, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {formatCurrency(projection?.value)}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {projection?.detail}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ── Componente principal ── */
export default function WeeklyChart({ selectedMonthKeys = [], admin = false, selectedUserIds = [], chartType = "bar" }) {
    const [monthsData, setMonthsData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const selectedMonthKeyString = useMemo(() => selectedMonthKeys.join(","), [selectedMonthKeys]);
    const selectedUserIdString = useMemo(() => selectedUserIds.join(","), [selectedUserIds]);
    const isMobile = useMediaQuery("(max-width: 640px)");

    const load = useCallback(async () => {
        const monthKeys = selectedMonthKeyString.split(",").filter(Boolean);
        if (!monthKeys.length) { setMonthsData([]); return; }
        setLoading(true);
        setError("");
        try {
            const promises = monthKeys.map(async (mk) => {
                const [year, month] = mk.split("-").map(Number);
                let url = `/analytics/sales/weekly?year=${year}&month=${month}`;
                if (admin && !selectedUserIdString) {
                    url += `&global=true`;
                } else if (admin && selectedUserIdString) {
                    url += `&userIds=${selectedUserIdString}`;
                }
                const res = await apiGet(url);
                if (!res.ok) throw new Error(res.data?.error || "Error al cargar datos semanales.");
                return {
                    ...res.data,
                    label: `${MONTH_SHORT[month]} ${year}`,
                    monthKey: mk,
                };
            });
            const results = await Promise.all(promises);
            setMonthsData(results);
        } catch (e) {
            setError(e.message || "Error desconocido.");
        } finally {
            setLoading(false);
        }
    }, [admin, selectedMonthKeyString, selectedUserIdString]);

    useEffect(() => { load(); }, [load]);

    if (!selectedMonthKeys.length) {
        return (
            <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                textAlign: "center", padding: "60px 20px", color: "var(--muted)",
                border: "1px dashed var(--stroke)", borderRadius: 18, gap: 10,
            }}>
                <span style={{ fontSize: 36 }}>📅</span>
                <span style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>Sin mes seleccionado</span>
                <span style={{ fontSize: 13 }}>Elige al menos un mes arriba para ver las semanas.</span>
            </div>
        );
    }

    if (loading) {
        return (
            <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                padding: "60px 20px", gap: 14, color: "var(--muted)",
                background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 18,
            }}>
                <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
                <span style={{ fontSize: 14 }}>Cargando semanas...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                borderRadius: 12, padding: "14px 18px",
                background: "rgba(239,68,68,.10)", border: "1px solid rgba(239,68,68,.25)",
                color: "#ef4444", fontSize: 14, fontWeight: 600,
            }}>{error}</div>
        );
    }

    if (!monthsData.length) return null;

    // Construir datos agrupados por semana
    // chartData = [ { week: "Sem 1", "Mar 2026": 922000, "Feb 2026": 340000 }, ... ]
    const chartData = [1, 2, 3, 4].map(wkNum => {
        const row = { week: `Sem ${wkNum}` };
        monthsData.forEach(md => {
            const wk = md.weeks?.find(w => w.week === wkNum);
            row[md.label] = wk?.revenue ?? 0;
        });
        return row;
    });

    const light = document.documentElement.getAttribute("data-theme") === "light";
    const axisColor = light ? "rgba(11,16,32,0.65)" : "rgba(200,225,255,0.80)";
    const gridColor = light ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.06)";

    // Mejor semana + mes global
    let bestEntry = null;
    monthsData.forEach(md => {
        md.weeks?.forEach(wk => {
            if (!bestEntry || wk.revenue > bestEntry.revenue) {
                bestEntry = { ...wk, monthLabel: md.label };
            }
        });
    });

    const totalGeneral = monthsData.reduce((s, md) => s + (md.total ?? 0), 0);
    const ordersGeneral = monthsData.reduce((s, md) => s + (md.orders ?? 0), 0);
    const weeklyProjections = monthsData.map((md) => getWeeklyProjection(md));
    const averageTicketGeneral = getAverageTicket(totalGeneral, ordersGeneral);
    const weeklyProjectionTotal = weeklyProjections.reduce((sum, projection) => sum + Number(projection?.value || 0), 0);
    const hasWeeklyProjection = weeklyProjections.some((projection) => projection?.isProjection);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0, width: "100%" }}>

            {/* ─── KPI Cards por mes ─── */}
            <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
                minWidth: 0,
            }}>
                {monthsData.map((md, i) => (
                    <MonthKpiCard
                        key={md.monthKey}
                        monthData={md}
                        color={WEEK_COLORS[i % WEEK_COLORS.length]}
                        monthKey={md.label}
                        averageTicket={getAverageTicket(md.total, md.orders)}
                        projection={weeklyProjections[i]}
                    />
                ))}
            </div>

            {/* ─── Gráfica de barras agrupadas ─── */}
            <div style={{
                padding: isMobile ? "16px 12px" : "22px 20px", borderRadius: 18,
                background: "var(--card)", border: "1px solid var(--stroke)",
                boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
                minWidth: 0,
                overflow: "hidden",
            }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text)" }}>
                        Comparativa Semanal
                        {monthsData.length >= 2 && (
                            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)", marginLeft: 8 }}>
                                · semana a semana
                            </span>
                        )}
                    </div>
                    {/* Leyenda de meses */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
                        {monthsData.map((md, i) => (
                            <span key={i} style={{
                                display: "inline-flex", alignItems: "center", gap: 5,
                                fontSize: 12, fontWeight: 700, color: WEEK_COLORS[i % WEEK_COLORS.length],
                                background: `${WEEK_COLORS[i % WEEK_COLORS.length]}15`,
                                border: `1px solid ${WEEK_COLORS[i % WEEK_COLORS.length]}30`,
                                borderRadius: 8, padding: "3px 9px",
                            }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: WEEK_COLORS[i % WEEK_COLORS.length] }} />
                                {md.label}
                            </span>
                        ))}
                    </div>
                </div>

                <div style={{ width: "100%", height: isMobile ? 240 : 260, minWidth: 0, overflow: "hidden" }}>
                    <ResponsiveContainer width="100%" height="100%">
                        {chartType === "area" ? (
                            <AreaChart
                                data={chartData}
                                margin={isMobile ? { top: 10, right: 0, left: -10, bottom: 0 } : { top: 10, right: 10, left: 0, bottom: 0 }}
                            >
                                <defs>
                                    {monthsData.map((_, i) => (
                                        <linearGradient key={i} id={`wkAreaGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={WEEK_COLORS[i % WEEK_COLORS.length]} stopOpacity={0.40} />
                                            <stop offset="95%" stopColor={WEEK_COLORS[i % WEEK_COLORS.length]} stopOpacity={0} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: axisColor, fontSize: isMobile ? 10 : 12, fontWeight: 700 }} dy={8} />
                                <YAxis axisLine={false} tickLine={false} tickFormatter={fmt} tick={{ fill: axisColor, fontSize: isMobile ? 10 : 11, fontWeight: 500 }} dx={isMobile ? -10 : -4} width={isMobile ? 34 : 52} />
                                <Tooltip content={<WeekTooltip />} cursor={{ stroke: "rgba(255,255,255,0.07)", strokeWidth: 1, strokeDasharray: "4 3" }} />
                                {monthsData.map((md, i) => (
                                    <Area
                                        key={md.label}
                                        type="monotone"
                                        dataKey={md.label}
                                        stroke={WEEK_COLORS[i % WEEK_COLORS.length]}
                                        fill={`url(#wkAreaGrad${i})`}
                                        strokeWidth={i === 0 ? 3 : 2}
                                        strokeDasharray={i === 0 ? undefined : "5 4"}
                                        activeDot={{ r: 5, strokeWidth: 2, stroke: WEEK_COLORS[i % WEEK_COLORS.length] }}
                                        connectNulls
                                    />
                                ))}
                            </AreaChart>
                        ) : (
                            <BarChart
                                data={chartData}
                                margin={isMobile ? { top: 10, right: 0, left: -10, bottom: 0 } : { top: 10, right: 10, left: 0, bottom: 0 }}
                                barCategoryGap="25%"
                                barGap={4}
                            >
                                <defs>
                                    {monthsData.map((_, i) => (
                                        <linearGradient key={i} id={`wkMonthGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={WEEK_COLORS[i % WEEK_COLORS.length]} stopOpacity={0.95} />
                                            <stop offset="100%" stopColor={WEEK_COLORS[i % WEEK_COLORS.length]} stopOpacity={0.30} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: axisColor, fontSize: isMobile ? 10 : 12, fontWeight: 700 }} dy={8} />
                                <YAxis axisLine={false} tickLine={false} tickFormatter={fmt} tick={{ fill: axisColor, fontSize: isMobile ? 10 : 11, fontWeight: 500 }} dx={isMobile ? -10 : -4} width={isMobile ? 34 : 52} />
                                <Tooltip content={<WeekTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                                {monthsData.map((md, i) => (
                                    <Bar key={md.label} dataKey={md.label} fill={`url(#wkMonthGrad${i})`} radius={[5, 5, 0, 0]} maxBarSize={50} />
                                ))}
                            </BarChart>
                        )}
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ─── Bottom row ─── */}
            <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
                minWidth: 0,
            }}>

                {/* Mejor semana global */}
                {bestEntry && bestEntry.revenue > 0 && (
                    <div style={{
                        flex: "1 1 200px", padding: isMobile ? "16px 14px" : "20px 22px", borderRadius: 18,
                        background: "var(--card)", border: "1px solid var(--stroke)",
                        boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
                        borderTop: "3px solid #10b981",
                        position: "relative", overflow: "hidden",
                    }}>
                        <div style={{ position: "absolute", top: -15, right: -15, width: 70, height: 70, borderRadius: "50%", background: "rgba(16,185,129,0.12)", filter: "blur(20px)", pointerEvents: "none" }} />
                        <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", color: "#10b981", marginBottom: 10 }}>
                            🏆 Mejor Semana Global
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                            <div style={{ fontSize: 24, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.5px" }}>
                                {fmtFull(bestEntry.revenue)}
                            </div>
                            <div style={{
                                fontSize: 11, fontWeight: 800, color: "#10b981",
                                background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)",
                                borderRadius: 8, padding: "2px 8px",
                            }}>
                                {bestEntry.label} · {bestEntry.monthLabel}
                            </div>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                            📦 {bestEntry.orders} órdenes
                        </div>
                    </div>
                )}

                {/* Total general */}
                <div style={{
                    flex: "1 1 200px", padding: isMobile ? "16px 14px" : "20px 22px", borderRadius: 18,
                    background: "var(--card)", border: "1px solid var(--stroke)",
                    boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
                    borderTop: "3px solid #0da6f2",
                    position: "relative", overflow: "hidden",
                }}>
                    <div style={{ position: "absolute", top: -15, right: -15, width: 70, height: 70, borderRadius: "50%", background: "rgba(13,166,242,0.12)", filter: "blur(20px)", pointerEvents: "none" }} />
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", color: "#0da6f2", marginBottom: 10 }}>
                        💰 Total del Período
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.5px" }}>
                        {fmtFull(totalGeneral)}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                        📦 {ordersGeneral} órdenes · {monthsData.length} mes{monthsData.length !== 1 ? "es" : ""}
                    </div>
                </div>

                {/* Ticket promedio */}
                <div style={{
                    flex: "1 1 200px", padding: isMobile ? "16px 14px" : "20px 22px", borderRadius: 18,
                    background: "var(--card)", border: "1px solid var(--stroke)",
                    boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
                    borderTop: "3px solid #10b981",
                    position: "relative", overflow: "hidden",
                }}>
                    <div style={{ position: "absolute", top: -15, right: -15, width: 70, height: 70, borderRadius: "50%", background: "rgba(16,185,129,0.12)", filter: "blur(20px)", pointerEvents: "none" }} />
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", color: "#10b981", marginBottom: 10 }}>
                        🎟️ Ticket promedio
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.5px" }}>
                        {formatCurrency(averageTicketGeneral)}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                        {ordersGeneral} órdenes en el periodo
                    </div>
                </div>

                {/* Proyección semanal */}
                <div style={{
                    flex: "1 1 200px", padding: isMobile ? "16px 14px" : "20px 22px", borderRadius: 18,
                    background: "var(--card)", border: "1px solid var(--stroke)",
                    boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
                    borderTop: "3px solid #8b5cf6",
                    position: "relative", overflow: "hidden",
                }}>
                    <div style={{ position: "absolute", top: -15, right: -15, width: 70, height: 70, borderRadius: "50%", background: "rgba(139,92,246,0.14)", filter: "blur(20px)", pointerEvents: "none" }} />
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", color: "#8b5cf6", marginBottom: 10 }}>
                        📈 {hasWeeklyProjection ? "Proyección semanal" : "Promedio semanal"}
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.5px" }}>
                        {formatCurrency(weeklyProjectionTotal)}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                        {weeklyProjections.map((projection) => projection.detail).filter(Boolean).join(" · ")}
                    </div>
                </div>

                {/* Comparativa entre meses (si hay 2+) */}
                {monthsData.length >= 2 && (() => {
                    const m1 = monthsData[0];
                    const m2 = monthsData[1];
                    const diff = m2.total > 0
                        ? Number(((m1.total - m2.total) / m2.total * 100).toFixed(1))
                        : null;
                    const diffColor = diff === null ? "var(--muted)" : diff >= 0 ? "#10b981" : "#ef4444";
                    return (
                        <div style={{
                            flex: "1 1 200px", padding: isMobile ? "16px 14px" : "20px 22px", borderRadius: 18,
                            background: "var(--card)", border: "1px solid var(--stroke)",
                            boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
                            borderTop: `3px solid ${diffColor}`,
                            position: "relative", overflow: "hidden",
                        }}>
                            <div style={{ position: "absolute", top: -15, right: -15, width: 70, height: 70, borderRadius: "50%", background: `${diffColor}18`, filter: "blur(20px)", pointerEvents: "none" }} />
                            <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", color: diffColor, marginBottom: 10 }}>
                                📈 {m1.label} vs {m2.label}
                            </div>
                            <div style={{ fontSize: 34, fontWeight: 900, color: diffColor, letterSpacing: "-1px" }}>
                                {diff !== null ? `${diff >= 0 ? "+" : ""}${diff}%` : "—"}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                                {m1.label}: {fmtFull(m1.total)} · {m2.label}: {fmtFull(m2.total)}
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}
