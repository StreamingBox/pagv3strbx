import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer
} from "recharts";

const COLORS = [
    "#0da6f2", "#8b5cf6", "#10b981", "#f59e0b",
    "#f43f5e", "#ec4899", "#3b82f6", "#06b6d4",
];

/** Tooltip custom para modo claro/oscuro */
function CustomTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    const { name, value } = payload[0].payload;
    return (
        <div style={{
            background: "var(--card)",
            border: "1px solid var(--stroke)",
            borderRadius: 10,
            padding: "10px 14px",
            boxShadow: "0 8px 24px rgba(0,0,0,.15)",
        }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", marginBottom: 4 }}>{name}</div>
            <div style={{ fontWeight: 900, fontSize: 16, color: "var(--accent)" }}>
                ${Number(value).toLocaleString("es-CO")}
            </div>
        </div>
    );
}

export default function DistributionChart({ data }) {
    if (!data || data.length === 0) {
        return (
            <div style={{
                minHeight: 260, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                color: "var(--muted)", gap: 12, textAlign: "center",
                border: "1px dashed var(--stroke)", borderRadius: 12, padding: 40,
            }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ opacity: 0.35 }}>
                    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                    <path d="M22 12A10 10 0 0 0 12 2v10z" />
                </svg>
                <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
                        Sin datos todavía
                    </div>
                    <div style={{ fontSize: 13 }}>No hay ventas suficientes en este período.</div>
                </div>
            </div>
        );
    }

    const total = data.reduce((sum, d) => sum + Number(d.value), 0);

    return (
        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            {/* Donut chart */}
            <div style={{ flex: "0 0 200px", height: 200, position: "relative" }}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={4}
                            stroke="none"
                            cornerRadius={4}
                        >
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={COLORS[index % COLORS.length]}
                                />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                </ResponsiveContainer>
                {/* Texto central del donut */}
                <div style={{
                    position: "absolute",
                    top: "50%", left: "50%",
                    transform: "translate(-50%, -50%)",
                    textAlign: "center", pointerEvents: "none",
                }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                        Total
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: "var(--text)" }}>
                        ${(total / 1000).toFixed(0)}k
                    </div>
                </div>
            </div>

            {/* Leyenda lateral */}
            <div style={{ flex: 1, minWidth: 120, display: "flex", flexDirection: "column", gap: 8 }}>
                {data.slice(0, 8).map((entry, index) => {
                    const pct = total > 0 ? ((Number(entry.value) / total) * 100).toFixed(1) : "0";
                    return (
                        <div key={index} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{
                                width: 10, height: 10, borderRadius: 3, flexShrink: 0,
                                background: COLORS[index % COLORS.length],
                            }} />
                            <span style={{
                                fontSize: 12, color: "var(--text)", fontWeight: 600,
                                flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                                {entry.name}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", flexShrink: 0 }}>
                                {pct}%
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
