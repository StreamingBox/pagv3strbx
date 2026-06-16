import { useState, useEffect } from "react";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ComposedChart,
    Bar,
    Line,
} from "recharts";
import { MONTH_COLORS } from "./chartPalette.js";
import useMediaQuery from "../../hooks/useMediaQuery.js";
import { getMonthProjection } from "../../utils/analyticsForecast.js";

function useIsLight() {
    const [light, setLight] = useState(
        () => document.documentElement.getAttribute("data-theme") === "light"
    );
    useEffect(() => {
        const observer = new MutationObserver(() => {
            setLight(document.documentElement.getAttribute("data-theme") === "light");
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);
    return light;
}

/** Tooltip custom multi-mes */
function CustomTooltip({ active, payload, label, light }) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: light ? "rgba(255,255,255,0.97)" : "rgba(10,15,30,0.96)",
            border: `1px solid ${light ? "rgba(13,166,242,0.25)" : "rgba(0,240,255,0.25)"}`,
            borderRadius: 12,
            padding: "10px 14px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            minWidth: 170,
        }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: light ? "#6b7a8d" : "rgba(220,238,255,0.5)", marginBottom: 8 }}>
                Día {label}
            </div>
            {payload.map((p, i) => (
                p.value !== null && p.value !== undefined && (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 14, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: p.color, fontWeight: 600 }}>{p.name}</span>
                        <span style={{ fontSize: 13, fontWeight: 900, color: light ? "#0B1020" : "#EAF4FF" }}>
                            ${Number(p.value).toLocaleString("es-CO")}
                        </span>
                    </div>
                )
            ))}
        </div>
    );
}

/**
 * SalesChart multi-mes.
 * @param {Array} months  - array de { year, month, daily: [{day, revenue}], total, label }
 * @param {string} chartType - "area" | "bar"
 */
export default function SalesChart({ months = [], chartType = "area" }) {
    const light = useIsLight();
    const isMobile = useMediaQuery("(max-width: 640px)");

    if (!months || months.length === 0) {
        return <div style={{ color: "var(--muted)", padding: 20 }}>Cargando datos...</div>;
    }

    const projectionLines = months.map((m, i) => {
        const projection = getMonthProjection(m);
        if (!projection?.isProjection || !projection.totalDays || !projection.dailyAverage) return null;
        return {
            key: `projection_${i}`,
            label: `Proyección ${m.label}`,
            color: MONTH_COLORS[i % MONTH_COLORS.length],
            startDay: projection.elapsedDays,
            totalDays: projection.totalDays,
            value: projection.dailyAverage,
        };
    }).filter(Boolean);

    // Recopilar todos los días con datos o con línea proyectada en cualquier mes
    const allDays = new Set();
    months.forEach(m => m.daily.forEach(r => allDays.add(r.day)));
    projectionLines.forEach((line) => {
        for (let day = line.startDay; day <= line.totalDays; day += 1) {
            allDays.add(day);
        }
    });

    if (allDays.size === 0) {
        return (
            <div style={{
                height: 280, display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--muted)", fontSize: 14,
                border: "1px dashed var(--stroke)", borderRadius: 12,
            }}>
                Sin datos de ventas diarias en este período.
            </div>
        );
    }

    // Construir datos unificados por día
    const dayMaps = months.map(m => {
        const map = {};
        m.daily.forEach(r => { map[r.day] = Number(r.revenue || 0); });
        return map;
    });

    const chartData = [...allDays]
        .sort((a, b) => a - b)
        .map(day => {
            const row = { day };
            months.forEach((m, idx) => {
                row[m.label] = dayMaps[idx][day] !== undefined ? dayMaps[idx][day] : null;
            });
            projectionLines.forEach((line) => {
                row[line.key] = day >= line.startDay && day <= line.totalDays ? line.value : null;
            });
            return row;
        });

    const axisColor = light ? "rgba(11,16,32,0.65)" : "rgba(220,238,255,0.45)";
    const gridColor = light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)";

    const tickFormatter = (val) => {
        if (!val) return "0";
        if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
        if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
        return String(val);
    };

    const xAxis = (
        <XAxis dataKey="day" axisLine={false} tickLine={false}
            interval={isMobile ? "preserveStartEnd" : 0}
            tick={{ fill: axisColor, fontSize: isMobile ? 10 : 12, fontWeight: 500 }} dy={8} />
    );
    const yAxis = (
        <YAxis axisLine={false} tickLine={false} tickFormatter={tickFormatter}
            tick={{ fill: axisColor, fontSize: isMobile ? 10 : 12, fontWeight: 500 }} dx={isMobile ? -10 : -6} width={isMobile ? 34 : 48} />
    );
    const grid = <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />;
    const tooltipEl = (
        <Tooltip
            content={<CustomTooltip light={light} />}
            cursor={{ stroke: light ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.07)", strokeWidth: 1, strokeDasharray: "4 3" }}
        />
    );
    const legendEl = (
        <Legend wrapperStyle={{ fontSize: isMobile ? 11 : 13, fontWeight: 600, paddingTop: isMobile ? 8 : 14, color: axisColor, maxWidth: "100%" }} />
    );

    const commonProps = {
        data: chartData,
        margin: isMobile
            ? { top: 12, right: 0, left: -10, bottom: 0 }
            : { top: 16, right: 16, left: 0, bottom: 0 },
    };

    return (
        <div style={{ width: "100%", height: isMobile ? 260 : 320, minWidth: 0, overflow: "hidden" }}>
            {chartType === "bar" ? (
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart {...commonProps}>
                        <defs>
                            {months.map((m, i) => (
                                <linearGradient key={i} id={`barGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={MONTH_COLORS[i % MONTH_COLORS.length]} stopOpacity={0.9} />
                                    <stop offset="100%" stopColor={MONTH_COLORS[i % MONTH_COLORS.length]} stopOpacity={0.4} />
                                </linearGradient>
                            ))}
                        </defs>
                        {grid}{xAxis}{yAxis}{tooltipEl}{legendEl}
                        {months.map((m, i) => (
                            <Bar key={i} dataKey={m.label}
                                fill={`url(#barGrad${i})`}
                                radius={[4, 4, 0, 0]}
                            />
                        ))}
                        {projectionLines.map((line) => (
                            <Line
                                key={line.key}
                                type="monotone"
                                dataKey={line.key}
                                name={line.label}
                                stroke={line.color}
                                strokeWidth={2.5}
                                strokeDasharray="7 5"
                                dot={false}
                                activeDot={{ r: 4, strokeWidth: 2 }}
                                connectNulls
                            />
                        ))}
                    </ComposedChart>
                </ResponsiveContainer>
            ) : (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart {...commonProps}>
                        <defs>
                            {months.map((m, i) => (
                                <linearGradient key={i} id={`areaGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={MONTH_COLORS[i % MONTH_COLORS.length]} stopOpacity={light ? 0.25 : 0.40} />
                                    <stop offset="95%" stopColor={MONTH_COLORS[i % MONTH_COLORS.length]} stopOpacity={0} />
                                </linearGradient>
                            ))}
                        </defs>
                        {grid}{xAxis}{yAxis}{tooltipEl}{legendEl}
                        {months.map((m, i) => (
                            <Area
                                key={i}
                                type="monotone"
                                dataKey={m.label}
                                stroke={MONTH_COLORS[i % MONTH_COLORS.length]}
                                fill={`url(#areaGrad${i})`}
                                strokeWidth={i === 0 ? 3 : 2}
                                strokeDasharray={i === 0 ? undefined : "5 4"}
                                activeDot={{ r: 5, strokeWidth: 2, stroke: MONTH_COLORS[i % MONTH_COLORS.length], fill: light ? "#fff" : "#1a1f3c" }}
                                connectNulls
                            />
                        ))}
                        {projectionLines.map((line) => (
                            <Line
                                key={line.key}
                                type="monotone"
                                dataKey={line.key}
                                name={line.label}
                                stroke={line.color}
                                strokeWidth={2.5}
                                strokeDasharray="7 5"
                                dot={false}
                                activeDot={{ r: 4, strokeWidth: 2 }}
                                connectNulls
                            />
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
