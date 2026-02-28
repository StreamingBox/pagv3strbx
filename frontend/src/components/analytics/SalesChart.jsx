import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    BarChart,
    Bar,
} from "recharts";

const MONTH_NAMES = [
    "", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
];

export default function SalesChart({ data, chartType = "area" }) {
    if (!data) return <div style={{ color: "rgba(234,241,255,.65)", padding: 20 }}>Cargando datos...</div>;

    const { current, previous } = data;

    // Build unified day array 1..31 with data from both months
    const daysMax = Math.max(
        ...current.daily.map(r => r.day),
        ...previous.daily.map(r => r.day),
        current.daily.length > 0 ? 1 : 0,
        previous.daily.length > 0 ? 1 : 0,
    );

    const curMap = {};
    current.daily.forEach(r => { curMap[r.day] = Number(r.revenue || 0); });
    const prevMap = {};
    previous.daily.forEach(r => { prevMap[r.day] = Number(r.revenue || 0); });

    const chartData = [];
    for (let d = 1; d <= (daysMax || 31); d++) {
        if (curMap[d] !== undefined || prevMap[d] !== undefined) {
            chartData.push({
                day: d,
                "Mes actual": curMap[d] ?? null,
                "Mes anterior": prevMap[d] ?? null,
            });
        }
    }

    const curLabel = `${MONTH_NAMES[current.month]} ${current.year}`;
    const prevLabel = `${MONTH_NAMES[previous.month]} ${previous.year}`;

    const tickFormatter = (val) => {
        if (val === null || val === undefined) return "";
        if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
        if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
        return String(val);
    };

    const tooltipFormatter = (val, name) => {
        if (val === null || val === undefined) return ["—", name];
        return [Number(val).toLocaleString("es-CO"), name === "Mes actual" ? curLabel : prevLabel];
    };

    const commonProps = {
        data: chartData,
        margin: { top: 8, right: 20, left: 10, bottom: 0 },
    };

    const xAxis = <XAxis dataKey="day" tick={{ fill: "rgba(234,241,255,.6)", fontSize: 11 }} />;
    const yAxis = <YAxis tickFormatter={tickFormatter} tick={{ fill: "rgba(234,241,255,.6)", fontSize: 11 }} />;
    const grid = <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />;
    const tooltip = (
        <Tooltip
            formatter={tooltipFormatter}
            contentStyle={{ background: "rgba(12,22,50,0.95)", border: "1px solid rgba(46,123,255,0.3)", borderRadius: 8 }}
            labelFormatter={(l) => `Día ${l}`}
        />
    );
    const legend = <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />;

    return (
        <div style={{ width: "100%", height: 300 }}>
            {chartType === "bar" ? (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart {...commonProps}>
                        {grid}{xAxis}{yAxis}{tooltip}{legend}
                        <Bar dataKey="Mes actual" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Mes anterior" fill="rgba(255,255,255,0.2)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            ) : (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart {...commonProps}>
                        <defs>
                            <linearGradient id="gradCur" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradPrev" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        {grid}{xAxis}{yAxis}{tooltip}{legend}
                        <Area type="monotone" dataKey="Mes actual" stroke="#3b82f6" fill="url(#gradCur)" strokeWidth={2} connectNulls />
                        <Area type="monotone" dataKey="Mes anterior" stroke="#94a3b8" fill="url(#gradPrev)" strokeWidth={2} connectNulls />
                    </AreaChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
