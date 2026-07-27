import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SalesChart from "./SalesChart";
import DistributionChart from "./DistributionChart";
import WeeklyChart from "./WeeklyChart";
import PlatformProfitView from "./PlatformProfitView";
import { apiGet } from "../../api/api";
import { MONTH_COLORS } from "./chartPalette.js";
import useMediaQuery from "../../hooks/useMediaQuery.js";
import { daysInMonth, formatCurrency, getAverageTicket, getBogotaToday, getMonthProjection } from "../../utils/analyticsForecast.js";

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
                <div style={{ padding: 40, background: "rgba(239,68,68,0.1)", color: "#ef4444", borderRadius: 16, margin: 20, border: "1px solid rgba(239,68,68,0.25)" }}>
                    <h2 style={{ margin: "0 0 8px" }}>Error al cargar los gráficos</h2>
                    <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", fontSize: 12 }}>{this.state.error?.toString()}</pre>
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

function formatSupportHours(value) {
    const hours = Number(value || 0);
    if (!hours) return "Sin cierre";
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
    return `${Number(hours.toFixed(1)).toLocaleString("es-CO")} h`;
}

function buildSupportDailySeries(month) {
    const stats = month?.supportStats || {};
    const monthDays = daysInMonth(Number(month?.year), Number(month?.month)) || 31;
    const byDay = new Map((stats.daily || []).map((point) => [
        Number(point.day),
        {
            created: Number(point.created || 0),
            resolved: Number(point.resolved || 0),
        },
    ]));

    return Array.from({ length: monthDays }, (_item, index) => {
        const day = index + 1;
        const point = byDay.get(day) || {};
        return {
            day,
            created: Number(point.created || 0),
            resolved: Number(point.resolved || 0),
        };
    });
}

function SupportTrendChart({ month, color, isMobile }) {
    const series = buildSupportDailySeries(month);
    const maxValue = Math.max(4, ...series.map((point) => Math.max(point.created, point.resolved)));
    const hasData = series.some((point) => point.created > 0 || point.resolved > 0);
    const width = 760;
    const height = 210;
    const pad = { top: 20, right: 18, bottom: 34, left: 38 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const xFor = (index) => pad.left + (series.length <= 1 ? chartW / 2 : (chartW / (series.length - 1)) * index);
    const yFor = (value) => pad.top + chartH - (Number(value || 0) / maxValue) * chartH;
    const pathFor = (key) => series.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(1)} ${yFor(point[key]).toFixed(1)}`).join(" ");
    const activePoints = series.filter((point) => point.created > 0 || point.resolved > 0);
    const tickValues = [maxValue, Math.ceil(maxValue / 2), 0];

    return (
        <div style={{
            padding: isMobile ? 12 : 16,
            border: "1px solid rgba(34,211,238,.18)",
            borderRadius: 14,
            background: "rgba(7,14,34,.48)",
            minWidth: 0,
            overflow: "hidden",
        }}>
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                marginBottom: 10,
                flexWrap: "wrap",
            }}>
                <div>
                    <strong style={{ display: "block", color: "var(--text)", fontSize: 13 }}>Tendencia diaria</strong>
                    <span style={{ color: "var(--muted)", fontSize: 11, fontWeight: 700 }}>
                        Casos creados vs. casos resueltos
                    </span>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", color: "var(--muted)", fontSize: 11, fontWeight: 800 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <i style={{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block" }} />
                        Recibidos
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <i style={{ width: 8, height: 8, borderRadius: 999, background: "#10b981", display: "inline-block" }} />
                        Resueltos
                    </span>
                </div>
            </div>

            {hasData ? (
                <div style={{ width: "100%", minWidth: 0 }}>
                    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Tendencia de soportes ${month?.label || ""}`} style={{ display: "block", width: "100%", height: isMobile ? 170 : 210 }}>
                        <defs>
                            <linearGradient id={`supportFill-${month?.year}-${month?.month}`} x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                                <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                            </linearGradient>
                        </defs>

                        {tickValues.map((tick) => {
                            const y = yFor(tick);
                            return (
                                <g key={`tick-${tick}`}>
                                    <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="rgba(148,163,184,.12)" strokeDasharray="5 7" />
                                    <text x={8} y={y + 4} fill="rgba(226,232,240,.55)" fontSize="11" fontWeight="700">{tick}</text>
                                </g>
                            );
                        })}

                        <path
                            d={`${pathFor("created")} L ${xFor(series.length - 1).toFixed(1)} ${yFor(0).toFixed(1)} L ${xFor(0).toFixed(1)} ${yFor(0).toFixed(1)} Z`}
                            fill={`url(#supportFill-${month?.year}-${month?.month})`}
                        />
                        <path d={pathFor("created")} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                        <path d={pathFor("resolved")} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 7" />

                        {activePoints.map((point) => {
                            const index = point.day - 1;
                            return (
                                <g key={`support-point-${point.day}`}>
                                    {point.created > 0 && (
                                        <circle cx={xFor(index)} cy={yFor(point.created)} r="6" fill={color} stroke="#0b1024" strokeWidth="3" />
                                    )}
                                    {point.resolved > 0 && (
                                        <circle cx={xFor(index)} cy={yFor(point.resolved)} r="5" fill="#10b981" stroke="#0b1024" strokeWidth="3" />
                                    )}
                                    <text x={xFor(index)} y={height - 10} fill="rgba(226,232,240,.62)" fontSize="10" fontWeight="800" textAnchor="middle">
                                        {point.day}
                                    </text>
                                </g>
                            );
                        })}

                        {[1, Math.ceil(series.length / 2), series.length].map((day) => (
                            <text key={`day-label-${day}`} x={xFor(day - 1)} y={height - 10} fill="rgba(226,232,240,.38)" fontSize="10" fontWeight="800" textAnchor="middle">
                                {activePoints.some((point) => point.day === day) ? "" : day}
                            </text>
                        ))}
                    </svg>
                    <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        color: "var(--muted)",
                        fontSize: 11,
                        fontWeight: 700,
                        flexWrap: "wrap",
                    }}>
                        <span>Escala maxima: {maxValue} casos por dia</span>
                        <span>{activePoints.length} dia(s) con movimiento</span>
                    </div>
                </div>
            ) : (
                <div style={{
                    height: isMobile ? 150 : 190,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 12,
                    background: "rgba(8,14,32,.42)",
                    color: "var(--muted)",
                    fontSize: 13,
                    fontWeight: 700,
                    textAlign: "center",
                    padding: 18,
                }}>
                    Sin novedades registradas en este mes.
                </div>
            )}
        </div>
    );
}

function SupportPulse({ month, color, isMobile }) {
    const stats = month?.supportStats;
    if (!stats) return null;
    const maxDaily = Math.max(1, ...((stats.daily || []).map((day) => Number(day.created || 0))));
    return (
        <motion.div
            variants={itemVariants}
            style={{
                padding: isMobile ? "16px 12px" : "18px 20px",
                borderRadius: 16,
                border: "1px solid rgba(20,184,166,.26)",
                background: "linear-gradient(135deg, rgba(20,184,166,.10), rgba(13,166,242,.06))",
                minWidth: 0,
            }}
        >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ color: "#5eead4", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1 }}>
                        Novedades de soporte
                    </div>
                    <div style={{ marginTop: 4, color: "var(--text)", fontSize: 15, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {month.label}
                    </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ color, fontSize: 24, fontWeight: 950, lineHeight: 1 }}>
                        {Number(stats.created || 0)}
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: 10, fontWeight: 800 }}>casos</div>
                </div>
            </div>

            <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))",
                gap: 8,
                marginBottom: 14,
            }}>
                <InsightChip emoji="🟠" label="Pendientes" value={stats.pending || 0} color="#f59e0b" />
                <InsightChip emoji="✅" label="Resueltos" value={stats.resolved || 0} color="#10b981" />
                <InsightChip emoji="📌" label="Abiertos" value={stats.open || 0} color="#f43f5e" />
                <InsightChip emoji="🧭" label="En revision" value={stats.inProgress || 0} color="#22d3ee" />
                <InsightChip emoji="📉" label="Impacto" value={`${Number(stats.supportRatePct || 0).toLocaleString("es-CO")} %`} color="#8b5cf6" />
            </div>

            <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.1fr) minmax(0, .9fr)",
                gap: 14,
                alignItems: "stretch",
            }}>
                <div style={{ minWidth: 0, padding: 12, border: "1px solid var(--stroke2)", borderRadius: 12, background: "rgba(6,12,30,.24)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                        <strong style={{ color: "var(--text)", fontSize: 12 }}>Entrada diaria</strong>
                        <span style={{ color: "#5eead4", fontSize: 11, fontWeight: 900 }}>
                            Prom. cierre {formatSupportHours(stats.avgResolutionHours)}
                        </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "end", gap: 4, height: 78, overflow: "hidden" }}>
                        {(stats.daily || []).length ? (stats.daily || []).map((point) => (
                            <div
                                key={point.day}
                                title={`Dia ${point.day}: ${point.created} caso(s)`}
                                style={{
                                    flex: "1 1 0",
                                    minWidth: 5,
                                    height: `${Math.max(8, (Number(point.created || 0) / maxDaily) * 76)}px`,
                                    borderRadius: "6px 6px 2px 2px",
                                    background: `linear-gradient(180deg, ${color}, rgba(20,184,166,.28))`,
                                }}
                            />
                        )) : (
                            <div style={{ width: "100%", color: "var(--muted)", fontSize: 12, textAlign: "center", alignSelf: "center" }}>
                                Sin novedades registradas.
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ minWidth: 0, padding: 12, border: "1px solid var(--stroke2)", borderRadius: 12, background: "rgba(6,12,30,.24)" }}>
                    <strong style={{ display: "block", color: "var(--text)", fontSize: 12, marginBottom: 10 }}>Cierres por subtipificacion</strong>
                    <div style={{ display: "grid", gap: 7 }}>
                        {(stats.subtypes || []).length ? stats.subtypes.slice(0, 5).map((item, idx) => (
                            <div key={item.key || item.name} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "center" }}>
                                <span style={{ color: "var(--text)", fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {item.name}
                                </span>
                                <span style={{ color: TOP_COLORS[idx % TOP_COLORS.length], fontSize: 12, fontWeight: 900 }}>
                                    {item.value}
                                </span>
                            </div>
                        )) : (
                            <span style={{ color: "var(--muted)", fontSize: 12 }}>Sin cierres subtipificados todavia.</span>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

function SupportAnalyticsView({ months, isMobile }) {
    const visibleMonths = Array.isArray(months) ? months : [];
    const totals = visibleMonths.reduce((acc, month) => {
        const stats = month.supportStats || {};
        acc.created += Number(stats.created || 0);
        acc.open += Number(stats.open || 0);
        acc.inProgress += Number(stats.inProgress || 0);
        acc.pending += Number(stats.pending || 0);
        acc.resolved += Number(stats.resolved || 0);
        acc.orders += Number(month.orders || 0);
        if (Number(stats.avgResolutionHours || 0) > 0) acc.avgHours.push(Number(stats.avgResolutionHours || 0));
        return acc;
    }, { created: 0, open: 0, inProgress: 0, pending: 0, resolved: 0, orders: 0, avgHours: [] });
    const supportRate = totals.orders > 0 ? Number(((totals.created / totals.orders) * 100).toFixed(2)) : 0;
    const resolvedRate = totals.created > 0 ? Number(((totals.resolved / totals.created) * 100).toFixed(1)) : 0;
    const avgHours = totals.avgHours.length
        ? totals.avgHours.reduce((sum, value) => sum + value, 0) / totals.avgHours.length
        : 0;

    return (
        <motion.div initial="hidden" animate="show" variants={containerVariants} style={{ display: "grid", gap: 16, minWidth: 0 }}>
            <motion.div variants={itemVariants} style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
                minWidth: 0,
            }}>
                <InsightChip emoji="🎧" label="Casos recibidos" value={totals.created} color="#22d3ee" />
                <InsightChip emoji="🟠" label="Pendientes" value={totals.pending} color="#f59e0b" />
                <InsightChip emoji="✅" label="Resueltos" value={`${totals.resolved} (${resolvedRate} %)`} color="#10b981" />
                <InsightChip emoji="📉" label="Impacto sobre ventas" value={`${supportRate} %`} color="#8b5cf6" />
                <InsightChip emoji="⏱️" label="Prom. cierre" value={formatSupportHours(avgHours)} color="#06b6d4" />
            </motion.div>

            {visibleMonths.map((month, idx) => {
                const color = MONTH_COLORS[idx % MONTH_COLORS.length];
                const stats = month.supportStats || {};
                const daily = stats.daily || [];
                const maxDaily = Math.max(1, ...daily.map((point) => Math.max(Number(point.created || 0), Number(point.resolved || 0))));
                return (
                    <motion.section
                        key={`support-view-${month.label}`}
                        variants={itemVariants}
                        style={{
                            padding: isMobile ? "16px 12px" : 20,
                            border: "1px solid rgba(34,211,238,.20)",
                            borderRadius: 16,
                            background: "linear-gradient(135deg, rgba(14,24,55,.94), rgba(12,20,48,.88))",
                            minWidth: 0,
                            boxShadow: "0 18px 40px rgba(0,0,0,.16)",
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap" }}>
                            <div>
                                <div style={{ color: "#22d3ee", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1 }}>
                                    Soportes recibidos
                                </div>
                                <h2 style={{ margin: "5px 0 0", color: "var(--text)", fontSize: isMobile ? 18 : 22, letterSpacing: 0 }}>
                                    {month.label}
                                </h2>
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                <span style={{ color, fontSize: 24, fontWeight: 950 }}>{stats.created || 0} casos</span>
                                <span style={{ padding: "7px 10px", borderRadius: 999, color: "#10b981", background: "rgba(16,185,129,.10)", fontSize: 12, fontWeight: 900 }}>
                                    {stats.resolved || 0} resueltos
                                </span>
                                <span style={{ padding: "7px 10px", borderRadius: 999, color: "#f59e0b", background: "rgba(245,158,11,.10)", fontSize: 12, fontWeight: 900 }}>
                                    {stats.pending || 0} pendientes
                                </span>
                            </div>
                        </div>

                        <div style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.4fr) minmax(280px, .8fr)",
                            gap: 14,
                            minWidth: 0,
                        }}>
                            <SupportTrendChart month={month} color={color} isMobile={isMobile} />
                            <div style={{ display: "none", padding: 14, border: "1px solid var(--stroke2)", borderRadius: 12, background: "rgba(6,12,30,.28)", minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                                    <strong style={{ color: "var(--text)", fontSize: 13 }}>Flujo diario de novedades</strong>
                                    <span style={{ color: "var(--muted)", fontSize: 11, fontWeight: 800 }}>
                                        Azul: creados · Verde: resueltos
                                    </span>
                                </div>
                                {daily.length ? (
                                    <div style={{ display: "flex", alignItems: "end", gap: isMobile ? 3 : 5, height: 150, minWidth: 0 }}>
                                        {daily.map((point) => {
                                            const created = Number(point.created || 0);
                                            const resolved = Number(point.resolved || 0);
                                            return (
                                                <div key={point.day} style={{ flex: "1 1 0", minWidth: isMobile ? 5 : 8, display: "grid", gap: 3, alignItems: "end" }} title={`Dia ${point.day}: ${created} creados, ${resolved} resueltos`}>
                                                    <div style={{ height: `${Math.max(6, (created / maxDaily) * 120)}px`, borderRadius: "7px 7px 2px 2px", background: `linear-gradient(180deg, ${color}, rgba(34,211,238,.26))` }} />
                                                    <div style={{ height: `${resolved ? Math.max(6, (resolved / maxDaily) * 120) : 3}px`, borderRadius: "7px 7px 2px 2px", background: resolved ? "linear-gradient(180deg,#10b981,rgba(16,185,129,.24))" : "rgba(255,255,255,.10)" }} />
                                                    {!isMobile || point.day % 5 === 0 ? (
                                                        <span style={{ color: "var(--muted)", fontSize: 9, textAlign: "center" }}>{point.day}</span>
                                                    ) : null}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div style={{ height: 150, display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 13 }}>
                                        Sin novedades registradas en este mes.
                                    </div>
                                )}
                            </div>

                            <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                                <div style={{ padding: 14, border: "1px solid var(--stroke2)", borderRadius: 12, background: "rgba(6,12,30,.28)" }}>
                                    <strong style={{ display: "block", color: "var(--text)", fontSize: 13, marginBottom: 10 }}>Plataformas que mas reportan</strong>
                                    <div style={{ display: "grid", gap: 8 }}>
                                        {(stats.platforms || []).length ? stats.platforms.slice(0, 5).map((item, itemIdx) => (
                                            <div key={item.name} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center" }}>
                                                <span style={{ color: "var(--text)", fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                                                <span style={{ color: TOP_COLORS[itemIdx % TOP_COLORS.length], fontSize: 12, fontWeight: 950 }}>{item.value}</span>
                                            </div>
                                        )) : <span style={{ color: "var(--muted)", fontSize: 12 }}>Sin plataformas reportadas.</span>}
                                    </div>
                                </div>

                                <div style={{ padding: 14, border: "1px solid var(--stroke2)", borderRadius: 12, background: "rgba(6,12,30,.28)" }}>
                                    <strong style={{ display: "block", color: "var(--text)", fontSize: 13, marginBottom: 10 }}>Cierres por subtipificacion</strong>
                                    <div style={{ display: "grid", gap: 8 }}>
                                        {(stats.subtypes || []).length ? stats.subtypes.slice(0, 5).map((item, itemIdx) => (
                                            <div key={item.key || item.name} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center" }}>
                                                <span style={{ color: "var(--text)", fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                                                <span style={{ color: TOP_COLORS[itemIdx % TOP_COLORS.length], fontSize: 12, fontWeight: 950 }}>{item.value}</span>
                                            </div>
                                        )) : <span style={{ color: "var(--muted)", fontSize: 12 }}>Sin cierres subtipificados todavia.</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.section>
                );
            })}
        </motion.div>
    );
}

function monthKey(year, month) {
    return `${year}-${String(month).padStart(2, "0")}`;
}

function formatTrackingStart(value) {
    if (!value) return "el inicio del control de costos";
    const date = new Date(`${String(value).replace(" ", "T")}-05:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("es-CO", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "America/Bogota",
    }).format(date);
}

function getApiPayload(res) {
    return res?.data ?? res ?? {};
}

function assertApiOk(res, fallbackMessage) {
    if (res?.ok === false) {
        throw new Error(res?.data?.message || fallbackMessage);
    }
    return getApiPayload(res);
}

/* ── InsightChip ── */
function InsightChip({ emoji, label, value, color = "var(--accent)" }) {
    return (
        <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px",
            background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 14,
            flex: "1 1 auto", minWidth: 120,
        }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>{emoji}</span>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", whiteSpace: "nowrap" }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 900, color, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
            </div>
        </div>
    );
}

/* ── MonthPill ── */
function MonthPill({ label, color, selected, onClick }) {
    return (
        <button
            onClick={onClick}
            style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 22,
                border: selected ? `2px solid ${color}` : "1.5px solid var(--stroke)",
                background: selected ? `${color}22` : "var(--card)",
                color: selected ? color : "var(--muted)",
                fontWeight: 700, fontSize: 13, cursor: "pointer",
                transition: "all 0.18s ease", fontFamily: "var(--font)",
                whiteSpace: "nowrap", boxShadow: selected ? `0 0 12px ${color}33` : "none",
            }}
        >
            {selected && <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />}
            {label}
        </button>
    );
}

/* Altura compartida para los 3 controles del header */
const CTRL_H = 34;
const CTRL_STYLE = {
    height: CTRL_H,
    padding: "0 14px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "var(--font)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    border: "1px solid var(--stroke)",
    background: "var(--card)",
    color: "var(--text)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    transition: "all 0.18s ease",
    outline: "none",
    whiteSpace: "nowrap",
};

/* ── PillSelect (reemplaza <select> con diseño premium) ── */
function PillSelect({ value, onChange, options, icon, fullWidth = false }) {
    return (
        <div style={{ position: "relative", display: "inline-flex", alignItems: "center", width: fullWidth ? "100%" : undefined, minWidth: 0 }}>
            {icon && (
                <span style={{
                    position: "absolute", left: 10, fontSize: 13,
                    pointerEvents: "none", zIndex: 1, lineHeight: 1,
                }}>{icon}</span>
            )}
            <select
                value={value}
                onChange={onChange}
                style={{
                    ...CTRL_STYLE,
                    appearance: "none", WebkitAppearance: "none",
                    paddingLeft: icon ? 30 : 14,
                    paddingRight: 28,
                    minWidth: 80,
                    width: fullWidth ? "100%" : undefined,
                    justifyContent: fullWidth ? "center" : undefined,
                }}
            >
                {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <span style={{
                position: "absolute", right: 9, fontSize: 9,
                color: "var(--muted)", pointerEvents: "none",
            }}>▼</span>
        </div>
    );
}

/* ── UserDropdown (mega-menu premium) ── */
function UserDropdown({ users, selectedUserIds, setSelectedUserIds, onClose }) {
    const [search, setSearch] = useState("");
    const inputRef = useRef(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const filtered = users.filter(u =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        String(u.id).includes(search)
    );

    function toggle(uid) {
        setSelectedUserIds(prev => {
            if (prev.includes(uid)) return prev.filter(id => id !== uid);
            if (prev.length >= 5) return prev;
            return [...prev, uid];
        });
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            style={{
                position: "absolute", top: "calc(100% + 10px)", right: 0,
                width: "min(320px, calc(100vw - 32px))", zIndex: 200,
                background: "var(--card)", backdropFilter: "blur(24px)",
                border: "1px solid var(--stroke)",
                borderRadius: 18, overflow: "hidden",
                boxShadow: "0 20px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(13,166,242,0.08)",
            }}
        >
            {/* Header */}
            <div style={{
                padding: "14px 16px 12px",
                borderBottom: "1px solid var(--stroke2)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
                <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", letterSpacing: "0.4px" }}>
                        Filtrar usuarios
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                        {selectedUserIds.length === 0 ? "Vista global" : `${selectedUserIds.length}/5 seleccionados`}
                    </div>
                </div>
                {selectedUserIds.length > 0 && (
                    <button
                        onClick={() => setSelectedUserIds([])}
                        style={{
                            fontSize: 11, fontWeight: 700, color: "var(--accent)", cursor: "pointer",
                            background: "rgba(13,166,242,0.08)", border: "1px solid rgba(13,166,242,0.2)",
                            borderRadius: 8, padding: "4px 8px", transition: "all 0.15s",
                        }}
                    >
                        Limpiar
                    </button>
                )}
            </div>

            {/* Search */}
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--stroke2)" }}>
                <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "var(--bg0)", border: "1px solid var(--stroke)",
                    borderRadius: 10, padding: "7px 12px",
                }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Buscar correo o ID..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            flex: 1, border: "none", outline: "none", background: "transparent",
                            color: "var(--text)", fontSize: 13, fontFamily: "var(--font)",
                        }}
                    />
                </div>
            </div>

            {/* List */}
            <div style={{ maxHeight: 240, overflowY: "auto", padding: "8px 8px" }}>
                {/* Opción "Todos" */}
                {!search && (
                    <UserOption
                        checked={selectedUserIds.length === 0}
                        label="Todos los usuarios"
                        sublabel="Vista global acumulada"
                        emoji="🌟"
                        onChange={() => { setSelectedUserIds([]); onClose(); }}
                    />
                )}
                {filtered.map(u => (
                    <UserOption
                        key={u.id}
                        checked={selectedUserIds.includes(u.id)}
                        disabled={selectedUserIds.length >= 5 && !selectedUserIds.includes(u.id)}
                        label={u.email}
                        sublabel={`#${u.id}${u.name ? ` · ${u.name}` : ""}`}
                        onChange={() => toggle(u.id)}
                    />
                ))}
                {filtered.length === 0 && (
                    <div style={{ padding: "20px 10px", textAlign: "center", fontSize: 12, color: "var(--muted)" }}>
                        Sin resultados
                    </div>
                )}
            </div>

            {/* Footer */}
            <div style={{ padding: "10px 14px", borderTop: "1px solid var(--stroke2)" }}>
                <button
                    onClick={onClose}
                    style={{
                        width: "100%", padding: "9px", borderRadius: 10,
                        background: "var(--accent)", color: "#fff",
                        border: "none", fontWeight: 700, fontSize: 13,
                        cursor: "pointer", fontFamily: "var(--font)",
                        boxShadow: "0 4px 14px rgba(13,166,242,0.3)",
                        transition: "opacity 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                >
                    Aplicar filtro
                </button>
            </div>
        </motion.div>
    );
}

function UserOption({ checked, disabled, label, sublabel, emoji, onChange }) {
    return (
        <label style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 10px", borderRadius: 10,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.45 : 1,
            background: checked ? "rgba(13,166,242,0.08)" : "transparent",
            border: checked ? "1px solid rgba(13,166,242,0.2)" : "1px solid transparent",
            marginBottom: 3,
            transition: "background 0.12s ease, border-color 0.12s ease",
        }}>
            {/* Custom checkbox */}
            <div style={{
                width: 18, height: 18, borderRadius: 6, flexShrink: 0,
                background: checked ? "var(--accent)" : "var(--input-bg)",
                border: checked ? "2px solid var(--accent)" : "2px solid var(--stroke)",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
            }}>
                {checked && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6.5L4.8 9.5L10 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </div>
            <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} style={{ display: "none" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: 13, fontWeight: 600, color: "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                    {emoji && <span style={{ marginRight: 6 }}>{emoji}</span>}
                    {label}
                </div>
                {sublabel && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{sublabel}</div>
                )}
            </div>
        </label>
    );
}

/* ── KPI Card ── */
function KpiCard({ label, total, orders, topPlatform, color, averageTicket, projection }) {
    return (
        <motion.div
            variants={itemVariants}
            whileHover={{ y: -4, scale: 1.01 }}
            style={{
                padding: "20px 22px", borderRadius: 18,
                background: "var(--card)", border: "1px solid var(--stroke)",
                borderTop: `3px solid ${color}`,
                boxShadow: `0 8px 30px rgba(0,0,0,0.08), 0 0 0 1px ${color}1a`,
                position: "relative", overflow: "hidden",
                minWidth: 0, // Prevent flex blowup
            }}
        >
            {/* Glow bg */}
            <div style={{
                position: "absolute", top: -20, right: -20,
                width: 80, height: 80, borderRadius: "50%",
                background: `${color}18`, filter: "blur(20px)",
                pointerEvents: "none",
            }} />
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "1.2px", color, marginBottom: 10 }}>
                {label}
            </div>
            <div style={{ fontSize: "calc(1.2rem + 0.8vw)", fontWeight: 900, color: "var(--text)", lineHeight: 1, letterSpacing: "-0.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                <span style={{ fontSize: "0.6em", color: "var(--muted)", marginRight: 2 }}>$</span>
                {Number(total).toLocaleString("es-CO")}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span style={{ whiteSpace: "nowrap" }}>📦 {orders} órd.</span>
                {topPlatform && <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>🏆 {topPlatform}</span>}
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
                        {projection?.isProjection ? "Proyección" : "Cierre"}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 900, color, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {formatCurrency(projection?.value)}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {projection?.detail}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

/* ─────────────────────────────────────── */
function UserAnalyticsContent({ admin }) {
    const now = new Date();
    const currentYear = now.getFullYear();

    const [viewMode, setViewMode] = useState("monthly"); // "monthly" | "weekly" | "support" | "platform"
    const [year, setYear] = useState(currentYear);
    const [chartType, setChartType] = useState("area");
    const [currency, setCurrency] = useState("COP");

    const [users, setUsers] = useState([]);
    const [selectedUserIds, setSelectedUserIds] = useState([]);
    const [showUserDrop, setShowUserDrop] = useState(false);
    const userDropRef = useRef(null);

    const [allHistorical, setAllHistorical] = useState([]);
    const [availableYears, setAvailableYears] = useState([currentYear]);
    const [loadingMonths, setLoadingMonths] = useState(true);
    const [selectedKeys, setSelectedKeys] = useState([]);

    const [monthsData, setMonthsData] = useState([]);
    const [loadingData, setLoadingData] = useState(false);
    const [platformProfit, setPlatformProfit] = useState(null);
    const [loadingPlatformProfit, setLoadingPlatformProfit] = useState(false);
    const [error, setError] = useState("");
    const isMobile = useMediaQuery("(max-width: 640px)");
    const isNarrow = useMediaQuery("(max-width: 430px)");

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e) {
            if (userDropRef.current && !userDropRef.current.contains(e.target)) {
                setShowUserDrop(false);
            }
        }
        if (showUserDrop) document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [showUserDrop]);

    useEffect(() => {
        if (admin) {
            apiGet("/admin/users?limit=1000")
                .then(res => {
                    const data = assertApiOk(res, "No se pudo cargar la lista de usuarios.");
                    const uList = data?.items || [];
                    setUsers(Array.isArray(uList) ? uList : []);
                })
                .catch(err => {
                    console.error(err);
                    setError(err.message || "No se pudo cargar la lista de usuarios.");
                });
        }
    }, [admin]);

    useEffect(() => {
        let cancelled = false;
        setError("");
        setSelectedKeys([]);
        setMonthsData([]);
        setLoadingMonths(true);
        const query = new URLSearchParams({ currency });
        if (admin && selectedUserIds.length === 0) query.set("global", "true");
        if (admin && selectedUserIds.length > 0) query.set("userIds", selectedUserIds.join(","));
        const url = `/analytics/available-months?${query.toString()}`;

        apiGet(url)
            .then(res => {
                const data = assertApiOk(res, "No se pudieron cargar los meses con ventas.");
                const monthsList = Array.isArray(data?.months) ? data.months : [];
                if (cancelled) return;
                setAllHistorical(monthsList);
                if (monthsList.length > 0) {
                    const years = [...new Set(monthsList.map(m => m.year))].sort((a, b) => b - a);
                    setAvailableYears(years);
                    if (years.length > 0) setYear(prevYear => (years.includes(prevYear) ? prevYear : years[0]));
                } else {
                    setAvailableYears([currentYear]);
                }
            })
            .catch(err => {
                if (cancelled) return;
                setAllHistorical([]);
                setAvailableYears([currentYear]);
                setError(err.message || "No se pudieron cargar los meses con ventas.");
            })
            .finally(() => {
                if (!cancelled) setLoadingMonths(false);
            });

        return () => {
            cancelled = true;
        };
    }, [admin, currentYear, selectedUserIds, currency]);

    const filteredMonths = allHistorical.filter(m => m.year === year);

    useEffect(() => {
        if (!loadingMonths && selectedKeys.length === 0 && filteredMonths.length > 0) {
            const top2 = filteredMonths.slice(0, 2).map(m => monthKey(m.year, m.month));
            setSelectedKeys(top2);
        }
    }, [filteredMonths, loadingMonths, selectedKeys.length]);

    const loadMultiData = useCallback(async () => {
        if (viewMode === "platform") {
            setLoadingData(false);
            return;
        }
        if (selectedKeys.length === 0) { setMonthsData([]); return; }
        setLoadingData(true);
        setError("");
        const supportQuery = admin && viewMode === "support" ? "&includeSupport=true" : "&includeSupport=false";
        try {
            if (admin && selectedUserIds.length >= 2) {
                const primaryMonth = selectedKeys[0];
                const promises = selectedUserIds.map(async (uId) => {
                    const res = await apiGet(`/analytics/sales/multi?months=${primaryMonth}&userIds=${uId}&currency=${currency}${supportQuery}`);
                    const data = assertApiOk(res, "No se pudieron cargar las ventas comparadas.");
                    const list = Array.isArray(data?.months) ? data.months : [];
                    const monthData = list[0];
                    if (!monthData) return null;
                    const userObj = users.find(u => u.id === uId);
                    const displayName = userObj ? (userObj.name || userObj.email.split("@")[0]) : `#${uId}`;
                    return { ...monthData, daily: monthData.daily || [], distribution: Array.isArray(monthData.distribution) ? monthData.distribution : [], label: displayName, isUserCompare: true };
                });
                const results = (await Promise.all(promises)).filter(Boolean);
                setMonthsData(results);
            } else {
                let url = `/analytics/sales/multi?months=${selectedKeys.join(",")}&currency=${currency}${supportQuery}`;
                if (admin && selectedUserIds.length === 0) url += `&global=true`;
                if (admin && selectedUserIds.length === 1) url += `&userIds=${selectedUserIds[0]}`;
                const res = await apiGet(url);
                const data = assertApiOk(res, "No se pudieron cargar las ventas.");
                const list = Array.isArray(data?.months) ? data.months : [];
                const withLabel = list.map(m => ({ ...m, daily: m.daily || [], distribution: Array.isArray(m.distribution) ? m.distribution : [], label: `${MONTH_SHORT[m.month]} ${m.year}` }));
                setMonthsData(withLabel);
            }
        } catch (e) {
            setError(e.message || "Error al cargar datos.");
        } finally {
            setLoadingData(false);
        }
    }, [selectedKeys, admin, selectedUserIds, users, currency, viewMode]);

    useEffect(() => { loadMultiData(); }, [loadMultiData]);

    useEffect(() => {
        let cancelled = false;
        if (!admin || viewMode !== "platform" || selectedKeys.length === 0) {
            setPlatformProfit(null);
            setLoadingPlatformProfit(false);
            return () => { cancelled = true; };
        }

        setLoadingPlatformProfit(true);
        setError("");
        const query = new URLSearchParams({ months: selectedKeys.join(","), currency });
        if (selectedUserIds.length === 0) query.set("global", "true");
        if (selectedUserIds.length > 0) query.set("userIds", selectedUserIds.join(","));

        apiGet(`/admin/analytics/platform-profit?${query.toString()}`)
            .then((res) => {
                const data = assertApiOk(res, "No se pudo cargar la rentabilidad por plataforma.");
                if (!cancelled) setPlatformProfit(data);
            })
            .catch((err) => {
                if (!cancelled) {
                    setPlatformProfit(null);
                    setError(err.message || "No se pudo cargar la rentabilidad por plataforma.");
                }
            })
            .finally(() => {
                if (!cancelled) setLoadingPlatformProfit(false);
            });

        return () => {
            cancelled = true;
        };
    }, [admin, viewMode, selectedKeys, selectedUserIds, currency]);

    useEffect(() => {
        if (admin && selectedUserIds.length >= 2 && selectedKeys.length > 1) {
            setSelectedKeys([selectedKeys[0]]);
        }
    }, [admin, selectedUserIds.length, selectedKeys]);

    function toggleMonth(key) {
        setSelectedKeys(prev => {
            if (admin && selectedUserIds.length >= 2) return [key]; // comparando usuarios: 1 mes
            // Modo semanal: máx 3 meses
            if (viewMode === "weekly") {
                if (prev.includes(key)) return prev.length > 1 ? prev.filter(k => k !== key) : prev; // no dejar vacío
                if (prev.length >= 3) return prev; // máx 3
                return [...prev, key];
            }
            if (prev.includes(key)) return prev.filter(k => k !== key);
            if (prev.length >= 6) return prev;
            return [...prev, key];
        });
    }

    const primary = monthsData[0] ?? null;
    const monthlyProjections = monthsData.map((m, idx) => (
        getMonthProjection(m, new Date(), { peerMonths: monthsData.filter((_month, peerIdx) => peerIdx !== idx) })
    ));
    const bogotaToday = getBogotaToday(now);
    const primaryDaysInMonth = daysInMonth(Number(primary?.year), Number(primary?.month));
    const primaryElapsedDays = primary?.year === bogotaToday.year && primary?.month === bogotaToday.month
        ? Math.min(Math.max(bogotaToday.day, 1), primaryDaysInMonth || bogotaToday.day)
        : primaryDaysInMonth || 1;
    const primaryDailyAverage = primaryElapsedDays > 0
        ? Number(primary?.total || 0) / primaryElapsedDays
        : 0;
    const selectedProjectionTotal = monthlyProjections.reduce((sum, projection) => sum + Number(projection?.value || 0), 0);
    const selectedHasProjection = monthlyProjections.some((projection) => projection?.isProjection);
    const selectedProjectionLabel = selectedHasProjection
        ? monthsData.length > 1 ? "Proyección + cierre" : "Proyección mensual"
        : "Cierre seleccionado";
    const isComparingUsers = admin && selectedUserIds.length >= 2;
    const balanceScopeData = isComparingUsers ? monthsData : monthsData.slice(0, 1);
    const balanceScopeLabel = !isComparingUsers && balanceScopeData.length === 1 ? balanceScopeData[0]?.label : "";
    const balanceScopePrefix = balanceScopeLabel ? `Balance neto ${balanceScopeLabel}` : "Balance neto";
    const selectedTrackedRevenue = balanceScopeData.reduce((sum, m) => sum + Number(m.trackedRevenue || 0), 0);
    const selectedTrackedSalesCount = balanceScopeData.reduce((sum, m) => sum + Number(m.trackedSalesCount || 0), 0);
    const selectedCostTotal = balanceScopeData.reduce((sum, m) => sum + Number(m.costTotal || 0), 0);
    const selectedNetProfit = balanceScopeData.reduce((sum, m) => sum + Number(m.netProfit || 0), 0);
    const selectedMissingCostCount = balanceScopeData.reduce((sum, m) => sum + Number(m.missingCostCount || 0), 0);
    const selectedMarginPct = selectedTrackedRevenue > 0
        ? Number(((selectedNetProfit / selectedTrackedRevenue) * 100).toFixed(2))
        : 0;
    const trackingStartLabel = formatTrackingStart(
        balanceScopeData.find(m => m.netProfitTrackingStartAt)?.netProfitTrackingStartAt ||
        monthsData.find(m => m.netProfitTrackingStartAt)?.netProfitTrackingStartAt
    );
    const supportMonths = admin ? monthsData.filter((month) => month.supportStats) : [];
    const activeDataLoading = viewMode === "platform" ? loadingPlatformProfit : loadingData;

    return (
        <motion.div style={{ marginTop: isMobile ? 0 : 16, width: "100%", minWidth: 0 }} initial="hidden" animate="show" variants={containerVariants}>

            {/* ─── HEADER ─── */}
            <motion.div variants={itemVariants} style={{ marginBottom: 24 }}>
                {/* Row: título + controles */}
                <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                    flexDirection: isMobile ? "column" : "row",
                    flexWrap: "wrap", gap: 12, marginBottom: 18,
                    minWidth: 0,
                }}>
                    {/* Título */}
                    <div style={{ width: isMobile ? "100%" : undefined, minWidth: 0 }}>
                        <h1 style={{ margin: 0, fontSize: isMobile ? 18 : 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px", display: "flex", alignItems: "center", gap: 8, lineHeight: 1.18, minWidth: 0 }}>
                            <span style={{
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                width: isMobile ? 30 : 34, height: isMobile ? 30 : 34, borderRadius: 10,
                                background: "linear-gradient(135deg, var(--accent), #8b5cf6)",
                                fontSize: 16, flexShrink: 0,
                            }}>📊</span>
                            {admin ? "Balance y Ganancias Netas" : "Mis Analíticas de Ventas"}
                        </h1>
                        <p style={{ margin: isMobile ? "6px 0 0" : "6px 0 0 42px", fontSize: 13, color: "var(--muted)", lineHeight: 1.35 }}>
                            {admin
                                ? "Consulta ingresos, costos registrados, utilidad real y margen por periodo"
                                : isComparingUsers
                                    ? "Comparando usuarios en el mes seleccionado"
                                    : viewMode === "weekly"
                                        ? "Desglose semanal del mes seleccionado"
                                        : viewMode === "support"
                                            ? "Novedades de soporte, cierres, pendientes e impacto por periodo"
                                            : viewMode === "platform"
                                                ? "Rentabilidad por plataforma con costos registrados y margen real"
                                                : "Selecciona hasta 6 meses para comparar"}
                        </p>
                    </div>

                    {/* Controles derechos */}
                    <div style={{
                        display: isMobile ? "grid" : "flex",
                        gridTemplateColumns: isNarrow ? "1fr" : "repeat(2, minmax(0, 1fr))",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        width: isMobile ? "100%" : undefined,
                        minWidth: 0,
                    }}>

                        {/* Admin: user picker */}
                        {admin && (
                            <div style={{ position: "relative", minWidth: 0, width: isMobile ? "100%" : undefined }} ref={userDropRef}>
                                <button
                                    onClick={() => setShowUserDrop(v => !v)}
                                    aria-label="Filtrar por usuario"
                                    aria-expanded={showUserDrop}
                                    style={{
                                        ...CTRL_STYLE,
                                        background: selectedUserIds.length > 0 ? "rgba(13,166,242,0.12)" : "var(--card)",
                                        color: selectedUserIds.length > 0 ? "var(--accent)" : "var(--text)",
                                        border: selectedUserIds.length > 0 ? "1px solid rgba(13,166,242,0.35)" : "1px solid var(--stroke)",
                                        boxShadow: selectedUserIds.length > 0 ? "0 0 12px rgba(13,166,242,0.15)" : "0 2px 8px rgba(0,0,0,0.06)",
                                        width: isMobile ? "100%" : undefined,
                                        justifyContent: "center",
                                        minWidth: 0,
                                    }}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                        <circle cx="9" cy="7" r="4" />
                                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                    </svg>
                                    <span>{selectedUserIds.length === 0 ? "Todos" : `${selectedUserIds.length} usuario${selectedUserIds.length > 1 ? "s" : ""}`}</span>
                                    <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2 }}>▼</span>
                                </button>

                                <AnimatePresence>
                                    {showUserDrop && (
                                        <UserDropdown
                                            users={users}
                                            selectedUserIds={selectedUserIds}
                                            setSelectedUserIds={setSelectedUserIds}
                                            onClose={() => setShowUserDrop(false)}
                                        />
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        <PillSelect
                            value={currency}
                            onChange={e => { setCurrency(e.target.value); setSelectedKeys([]); }}
                            options={[
                                { value: "COP", label: "COP" },
                                { value: "MXN", label: "MXN" },
                                { value: "USD", label: "USD" },
                            ]}
                            icon="💱"
                            fullWidth={isMobile}
                        />

                        {/* Year picker */}
                        {availableYears.length > 0 && (
                            <PillSelect
                                value={year}
                                onChange={e => { setYear(Number(e.target.value)); setSelectedKeys([]); }}
                                options={availableYears.map(y => ({ value: y, label: y }))}
                                icon="📅"
                                fullWidth={isMobile}
                            />
                        )}

                        {/* Chart type — disponible en ambos modos */}
                        <PillSelect
                            value={chartType}
                            onChange={e => setChartType(e.target.value)}
                            options={[{ value: "area", label: "Área" }, { value: "bar", label: "Barras" }]}
                            icon="📈"
                        />

                        {/* Tab toggle Mensual / Semanal / Soportes */}
                        <div style={{
                            display: isMobile ? "grid" : "inline-flex", background: "var(--bg0)",
                            border: "1px solid var(--stroke)", borderRadius: 12,
                            padding: 3, gap: 2,
                            gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : undefined,
                            width: isMobile ? "100%" : undefined,
                            minWidth: 0,
                        }}>
                            {[
                                { key: "monthly", icon: "📅", label: "Mensual" },
                                { key: "weekly", icon: "📊", label: "Semanal" },
                                ...(admin ? [{ key: "support", icon: "🎧", label: "Soportes" }] : []),
                                ...(admin ? [{ key: "platform", icon: "📈", label: "Plataformas" }] : []),
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setViewMode(tab.key)}
                                    style={{
                                        height: CTRL_H, padding: isMobile ? "0 8px" : "0 12px", borderRadius: 9,
                                        fontSize: 12, fontWeight: 700, fontFamily: "var(--font)",
                                        cursor: "pointer", border: "none",
                                        display: "inline-flex", alignItems: "center", gap: 5,
                                        flex: isMobile ? 1 : undefined,
                                        width: isMobile ? "100%" : undefined,
                                        justifyContent: "center",
                                        background: viewMode === tab.key
                                            ? "linear-gradient(135deg, var(--accent), #8b5cf6)"
                                            : "transparent",
                                        color: viewMode === tab.key ? "#fff" : "var(--muted)",
                                        boxShadow: viewMode === tab.key ? "0 2px 12px rgba(13,166,242,0.3)" : "none",
                                        transition: "all 0.18s ease",
                                    }}
                                >
                                    <span>{tab.icon}</span>
                                    <span>{tab.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Selector de meses */}
                <div style={{
                    background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 14,
                    padding: isMobile ? "10px" : "12px 16px",
                    minWidth: 0,
                    overflow: "hidden",
                }}>
                    {loadingMonths ? (
                        <div style={{ color: "var(--muted)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                            <span className="spinner" style={{ width: 14, height: 14 }} /> Cargando meses...
                        </div>
                    ) : filteredMonths.length === 0 ? (
                        <div style={{ color: "var(--muted)", fontSize: 13 }}>Sin ventas registradas para {year}.</div>
                    ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", minWidth: 0 }}>
                            <span style={{
                                fontSize: 11, fontWeight: 800, color: "var(--muted)",
                                textTransform: "uppercase", letterSpacing: "0.8px", marginRight: 4, flexShrink: 0,
                                width: isMobile ? "100%" : undefined,
                            }}>
                                {viewMode === "weekly"
                                    ? "Mes a desglosar:"
                                    : viewMode === "support"
                                        ? "Meses de soporte:"
                                        : viewMode === "platform"
                                            ? "Meses a rentabilizar:"
                                            : isComparingUsers ? "Mes a analizar:" : "Comparar:"}
                            </span>
                            {filteredMonths.map((m) => {
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
            </motion.div>

            {/* Error */}
            {error && (
                <motion.div variants={itemVariants} style={{
                    marginBottom: 16, borderRadius: 12, padding: "12px 16px",
                    background: "rgba(239,68,68,.10)", border: "1px solid rgba(239,68,68,.25)",
                    color: "#ef4444", fontSize: 14, fontWeight: 600,
                }}>{error}</motion.div>
            )}

            {/* Removed redundant insight chips row */}

            {/* Loader */}
            {(activeDataLoading || loadingMonths) && (
                <motion.div variants={itemVariants} style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    padding: "60px 20px", gap: 14, color: "var(--muted)",
                    background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 18,
                }}>
                    <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
                    <span style={{ fontSize: 14 }}>Cargando datos...</span>
                </motion.div>
            )}

            {/* ─── Vista Semanal ─── */}
            {viewMode === "weekly" && !loadingMonths && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                    <WeeklyChart
                        selectedMonthKeys={selectedKeys}
                        admin={admin}
                        selectedUserIds={selectedUserIds}
                        currency={currency}
                        chartType={chartType}
                    />
                </motion.div>
            )}

            {admin && viewMode === "support" && !loadingMonths && !loadingData && (
                supportMonths.length > 0 ? (
                    <SupportAnalyticsView months={supportMonths} isMobile={isMobile} />
                ) : (
                    <motion.div variants={itemVariants} style={{
                        padding: 40,
                        border: "1px solid var(--stroke)",
                        borderRadius: 18,
                        background: "var(--card)",
                        color: "var(--muted)",
                        textAlign: "center",
                    }}>
                        No hay datos de soporte para los meses seleccionados.
                    </motion.div>
                )
            )}

            {/* KPI Cards — solo mensual */}
            {admin && viewMode === "platform" && selectedKeys.length > 0 && !loadingMonths && !loadingPlatformProfit && (
                <PlatformProfitView
                    data={platformProfit}
                    isMobile={isMobile}
                    trackingStartLabel={formatTrackingStart(platformProfit?.netProfitTrackingStartAt)}
                />
            )}

            {viewMode === "monthly" && monthsData.length > 0 && !loadingData && (
                <motion.div initial="hidden" animate="show" variants={containerVariants}
                    className="kpi-cards-grid"
                    style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: isMobile ? 10 : 14,
                        marginBottom: 20,
                        minWidth: 0,
                    }}>
                    {monthsData.map((m, idx) => (
                        <KpiCard
                            key={m.label}
                            label={`Historial ${m.label}`}
                            total={m.total}
                            orders={m.orders}
                            topPlatform={m.distribution?.[0]?.name}
                            color={MONTH_COLORS[idx % MONTH_COLORS.length]}
                            averageTicket={getAverageTicket(m.total, m.orders)}
                            projection={monthlyProjections[idx]}
                            fullWidth={isMobile}
                        />
                    ))}
                </motion.div>
            )}

            {viewMode === "monthly" && monthsData.length > 0 && !loadingData && (
                <motion.div
                    variants={itemVariants}
                    style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: 12,
                        marginBottom: 20,
                        minWidth: 0,
                    }}
                >
                    <InsightChip emoji="📅" label="Promedio diario" value={formatCurrency(primaryDailyAverage)} color="#10b981" />
                    <InsightChip
                        emoji="📈"
                        label={selectedProjectionLabel}
                        value={formatCurrency(selectedProjectionTotal)}
                        color="#8b5cf6"
                    />
                </motion.div>
            )}

            {/* Rentabilidad admin */}
            {admin && viewMode === "monthly" && monthsData.length > 0 && !loadingData && (
                <>
                    <motion.div
                        variants={itemVariants}
                        style={{
                            marginBottom: 12,
                            padding: "12px 14px",
                            borderRadius: 8,
                            border: selectedMissingCostCount > 0 ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(16,185,129,0.25)",
                            background: selectedMissingCostCount > 0 ? "rgba(245,158,11,0.08)" : "rgba(16,185,129,0.07)",
                            color: selectedMissingCostCount > 0 ? "#f59e0b" : "#10b981",
                            fontSize: 12,
                            fontWeight: 700,
                            lineHeight: 1.45,
                        }}
                    >
                        {selectedMissingCostCount > 0
                            ? `${balanceScopePrefix} desde ${trackingStartLabel}: ${selectedMissingCostCount} venta${selectedMissingCostCount === 1 ? "" : "s"} actual${selectedMissingCostCount === 1 ? "" : "es"} no tiene${selectedMissingCostCount === 1 ? "" : "n"} costo registrado. Las ventas anteriores no se incluyen ni necesitan corregirse.`
                            : selectedTrackedSalesCount > 0
                                ? `${balanceScopePrefix} activo desde ${trackingStartLabel}. Incluye ${selectedTrackedSalesCount} venta${selectedTrackedSalesCount === 1 ? "" : "s"}; todo lo anterior queda solamente como historial.`
                                : `${balanceScopePrefix} comienza el ${trackingStartLabel}. Las ventas anteriores se conservan como historial y no afectan la utilidad ni el margen.`}
                    </motion.div>
                    <motion.div
                        variants={itemVariants}
                        style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
                            gap: 12,
                            marginBottom: 20,
                            minWidth: 0,
                        }}
                    >
                        <InsightChip emoji="💵" label="Ingresos con seguimiento" value={`$${selectedTrackedRevenue.toLocaleString("es-CO")}`} color="#0da6f2" />
                        <InsightChip emoji="🧾" label="Costo registrado" value={`$${selectedCostTotal.toLocaleString("es-CO")}`} color="#f59e0b" />
                        <InsightChip emoji="💰" label={selectedMissingCostCount > 0 ? "Utilidad provisional" : "Utilidad neta"} value={`$${selectedNetProfit.toLocaleString("es-CO")}`} color={selectedNetProfit >= 0 ? "#10b981" : "#ef4444"} />
                        <InsightChip emoji="📈" label="Margen actual" value={`${selectedMarginPct.toLocaleString("es-CO")} %`} color={selectedMarginPct >= 0 ? "#10b981" : "#ef4444"} />
                    </motion.div>
                </>
            )}

            {/* Charts — solo en modo mensual */}
            {viewMode === "monthly" && monthsData.length > 0 && !loadingData && (
                <motion.div initial="hidden" animate="show" variants={containerVariants}
                    style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                    {/* Sales trend chart */}
                    <motion.div variants={itemVariants} style={{
                        padding: isMobile ? "16px 12px" : "22px 24px", borderRadius: 18,
                        background: "var(--card)", border: "1px solid var(--stroke)",
                        boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
                        minWidth: 0,
                        overflow: "hidden",
                    }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
                            <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text)" }}>
                                Tendencia de Ventas
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
                                {monthsData.map((m, i) => (
                                    <span key={i} style={{
                                        display: "inline-flex", alignItems: "center", gap: 5,
                                        fontSize: 12, fontWeight: 700, color: MONTH_COLORS[i % MONTH_COLORS.length],
                                        background: `${MONTH_COLORS[i % MONTH_COLORS.length]}15`,
                                        border: `1px solid ${MONTH_COLORS[i % MONTH_COLORS.length]}30`,
                                        borderRadius: 8, padding: "3px 8px",
                                    }}>
                                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: MONTH_COLORS[i % MONTH_COLORS.length] }} />
                                        {m.label}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <SalesChart months={monthsData} chartType={chartType} />
                    </motion.div>

                    {/* Bottom row */}
                    <div style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(300px, 1fr))",
                        gap: 16,
                        minWidth: 0,
                    }}>

                        {/* Distribution chart */}
                        {primary?.distribution && Array.isArray(primary.distribution) && primary.distribution.length > 0 && (
                            <motion.div variants={itemVariants} style={{
                                padding: isMobile ? "16px 12px" : "22px 24px", borderRadius: 18,
                                background: "var(--card)", border: "1px solid var(--stroke)",
                                boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
                                minWidth: 0,
                                overflow: "hidden",
                            }}>
                                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text)", marginBottom: 18, lineHeight: 1.25 }}>
                                    Ventas por plataforma · <span style={{ color: "var(--accent)" }}>{primary.label}</span>
                                </div>
                                <DistributionChart data={primary.distribution} />
                            </motion.div>
                        )}

                        {/* Top products */}
                        {primary?.distribution && Array.isArray(primary.distribution) && primary.distribution.length > 0 && (
                            <motion.div variants={itemVariants} style={{
                                padding: isMobile ? "16px 12px" : "22px 24px", borderRadius: 18,
                                background: "var(--card)", border: "1px solid var(--stroke)",
                                boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
                                display: "flex", flexDirection: "column",
                                minWidth: 0,
                                overflow: "hidden",
                            }}>
                                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text)", marginBottom: 18, lineHeight: 1.25 }}>
                                    Top Productos · <span style={{ color: "var(--accent)" }}>{primary.label}</span>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {primary.distribution.slice(0, 5).map((item, idx) => (
                                        <div key={idx} style={{
                                            display: "flex", alignItems: "center", gap: 12,
                                            padding: isMobile ? "10px 9px" : "11px 14px", borderRadius: 12,
                                            background: "var(--bg0)", border: "1px solid var(--stroke2)",
                                            transition: "border-color 0.15s",
                                            minWidth: 0,
                                        }}>
                                            <div style={{
                                                width: 30, height: 30, borderRadius: 10, flexShrink: 0,
                                                background: `linear-gradient(135deg, ${MONTH_COLORS[idx % MONTH_COLORS.length]}, ${MONTH_COLORS[(idx + 1) % MONTH_COLORS.length]})`,
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                color: "#fff", fontWeight: 900, fontSize: 13,
                                                boxShadow: `0 4px 12px ${MONTH_COLORS[idx % MONTH_COLORS.length]}40`,
                                            }}>
                                                {idx + 1}
                                            </div>
                                            <span style={{
                                                fontWeight: 700, fontSize: 12, color: "var(--text)",
                                                flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                                minWidth: 0,
                                            }}>
                                                {item.name}
                                            </span>
                                            <span style={{
                                                fontWeight: 900, fontSize: 12, color: "var(--accent)", flexShrink: 0,
                                                background: "rgba(13,166,242,0.08)", padding: "3px 8px", borderRadius: 8,
                                                marginLeft: 4,
                                                maxWidth: isMobile ? "44%" : undefined,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}>
                                                ${Number(item.value).toLocaleString("es-CO")}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* Sin meses seleccionados */}
            {selectedKeys.length === 0 && !loadingMonths && (
                <motion.div variants={itemVariants} style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    textAlign: "center", padding: "70px 20px", color: "var(--muted)",
                    border: "1px dashed var(--stroke)", borderRadius: 18, gap: 10,
                    fontSize: 14,
                }}>
                    <span style={{ fontSize: 36 }}>📅</span>
                    <span style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>Sin período seleccionado</span>
                    <span>Selecciona al menos un mes arriba para ver los gráficos.</span>
                </motion.div>
            )}
        </motion.div>
    );
}

export default function UserAnalytics({ admin = false }) {
    return (
        <ErrorBoundary>
            <UserAnalyticsContent admin={admin} />
        </ErrorBoundary>
    );
}
