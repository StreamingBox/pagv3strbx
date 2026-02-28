import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchUsers } from "../api/adminUsersApi";
import SalesChart from "../components/analytics/SalesChart";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
function buildUrl(path) {
    const base = String(API_BASE).replace(/\/+$/, "");
    if (base.endsWith("/api") && path.startsWith("/api/")) path = path.slice(4);
    return `${base}${path}`;
}

const MONTH_NAMES = [
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

async function fetchAdminSalesAnalytics({ userId, year, month } = {}) {
    const params = new URLSearchParams();
    if (userId) params.set("userId", userId);
    if (year) params.set("year", year);
    if (month) params.set("month", month);
    const res = await fetch(buildUrl(`/admin/analytics/sales?${params.toString()}`), { credentials: "include" });
    return res.json();
}

export default function AdminAnalytics() {
    const navigate = useNavigate();
    const now = new Date();

    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState("");
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [chartType, setChartType] = useState("area");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        fetchUsers({ page: 1, limit: 1000 })
            .then(d => setUsers(d.items || []))
            .catch(() => { });
    }, []);

    useEffect(() => {
        load();
    }, [selectedUser, year, month]);

    async function load() {
        setLoading(true);
        setError("");
        try {
            const raw = await fetchAdminSalesAnalytics({
                userId: selectedUser || undefined,
                year,
                month
            });
            const payload = raw?.ok !== undefined ? raw.data : raw;
            setData(payload);
        } catch (e) {
            setError(e.message || "Error al cargar datos.");
        } finally {
            setLoading(false);
        }
    }

    const pct = data
        ? data.previous.total > 0
            ? (((data.current.total - data.previous.total) / data.previous.total) * 100).toFixed(1)
            : data.current.total > 0 ? "+100" : "0"
        : null;

    const pctColor = pct === null ? "#aaa" : Number(pct) >= 0 ? "#10b981" : "#ef4444";

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                <aside className="sidebar">
                    <div className="nav-title">Admin</div>
                    <p className="nav-sub">Analíticas de Ventas</p>
                    <div className="nav-item" onClick={() => navigate("/admin")}>
                        <span>Volver al panel</span>
                        <span style={{ opacity: 0.7 }}>→</span>
                    </div>
                </aside>

                <main className="main">
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                        <div>
                            <h1 style={{ margin: 0 }}>Analíticas de Ventas</h1>
                            <p style={{ marginTop: 6, color: "rgba(234,241,255,.65)" }}>
                                Comparación mensual · {MONTH_NAMES[month]} {year}
                            </p>
                        </div>

                        {/* Filters */}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                            <select className="input" style={{ padding: "6px 10px", width: "auto" }}
                                value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
                                <option value="">Todos los usuarios</option>
                                {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
                            </select>

                            <select className="input" style={{ padding: "6px 10px", width: "auto" }}
                                value={month} onChange={e => setMonth(Number(e.target.value))}>
                                {MONTH_NAMES.slice(1).map((m, i) => (
                                    <option key={i + 1} value={i + 1}>{m}</option>
                                ))}
                            </select>

                            <select className="input" style={{ padding: "6px 10px", width: "auto" }}
                                value={year} onChange={e => setYear(Number(e.target.value))}>
                                {[now.getFullYear() - 1, now.getFullYear()].map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>

                            <select className="input" style={{ padding: "6px 10px", width: "auto" }}
                                value={chartType} onChange={e => setChartType(e.target.value)}>
                                <option value="area">Gráfica de Área</option>
                                <option value="bar">Gráfica de Barras</option>
                            </select>
                        </div>
                    </div>

                    {/* KPI summary row */}
                    {data && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
                            <div className="kpi" style={{ padding: 16 }}>
                                <div style={{ color: "rgba(234,241,255,.6)", fontSize: 12 }}>Ventas {MONTH_NAMES[data.current.month]}</div>
                                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
                                    {Number(data.current.total).toLocaleString("es-CO")}
                                </div>
                                <div style={{ fontSize: 12, color: "rgba(234,241,255,.5)" }}>{data.current.orders} órdenes</div>
                            </div>
                            <div className="kpi" style={{ padding: 16 }}>
                                <div style={{ color: "rgba(234,241,255,.6)", fontSize: 12 }}>Ventas {MONTH_NAMES[data.previous.month]}</div>
                                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
                                    {Number(data.previous.total).toLocaleString("es-CO")}
                                </div>
                                <div style={{ fontSize: 12, color: "rgba(234,241,255,.5)" }}>{data.previous.orders} órdenes</div>
                            </div>
                            <div className="kpi" style={{ padding: 16 }}>
                                <div style={{ color: "rgba(234,241,255,.6)", fontSize: 12 }}>Variación</div>
                                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4, color: pctColor }}>
                                    {pct !== null ? `${Number(pct) >= 0 ? "+" : ""}${pct}%` : "—"}
                                </div>
                                <div style={{ fontSize: 12, color: "rgba(234,241,255,.5)" }}>vs mes anterior</div>
                            </div>
                        </div>
                    )}

                    {/* Chart */}
                    <div className="kpi" style={{ padding: 20 }}>
                        <div style={{ fontWeight: 900, marginBottom: 16 }}>
                            Ventas diarias — {MONTH_NAMES[month]} vs {MONTH_NAMES[data?.previous?.month ?? (month === 1 ? 12 : month - 1)]}  {year}
                        </div>
                        {error && <div className="error">{error}</div>}
                        {loading
                            ? <div style={{ color: "rgba(234,241,255,.65)", padding: 40, textAlign: "center" }}>Cargando datos...</div>
                            : <SalesChart data={data} chartType={chartType} />
                        }
                    </div>
                </main>
            </div>
        </div>
    );
}
