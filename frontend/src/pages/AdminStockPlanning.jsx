import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import { apiGet } from "../api/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import useAppLogout from "../hooks/useAppLogout.js";
import { currentBogotaDateOnly } from "../utils/datetime.js";

function shiftDate(dateOnly, days) {
    const [year, month, day] = dateOnly.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function formatCount(value) {
    return Number(value || 0).toLocaleString("es-CO");
}

function formatAverage(value) {
    return Number(value || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 });
}

const metricStyle = {
    borderLeft: "2px solid var(--stroke)",
    padding: "8px 14px",
    display: "grid",
    gap: 5,
    minWidth: 0,
};

export default function AdminStockPlanning() {
    const navigate = useNavigate();
    const logout = useAppLogout();
    const { user } = useAuth();
    const today = currentBogotaDateOnly();
    const [targetDate, setTargetDate] = useState(() => shiftDate(today, 7));
    const [historyDays, setHistoryDays] = useState("30");
    const [reloadKey, setReloadKey] = useState(0);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError("");
            try {
                const query = new URLSearchParams({ targetDate, historyDays });
                const response = await apiGet(`/admin/stock-planning?${query}`);
                if (!response.ok) throw new Error(response.data?.message || "No se pudo cargar la planeación.");
                if (!cancelled) setData(response.data);
            } catch (loadError) {
                if (!cancelled) setError(loadError.message || "No se pudo cargar la planeación.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [targetDate, historyDays, reloadKey]);

    const totals = useMemo(() => (data?.rows || []).reduce((sum, row) => ({
        estimatedDemand: sum.estimatedDemand + Number(row.estimatedDemand || 0),
        availableStock: sum.availableStock + Number(row.availableStock || 0),
        suggestedToReplenish: sum.suggestedToReplenish + Number(row.suggestedToReplenish || 0),
        expiringSubscriptions: sum.expiringSubscriptions + Number(row.expiringSubscriptions || 0),
    }), { estimatedDemand: 0, availableStock: 0, suggestedToReplenish: 0, expiringSubscriptions: 0 }), [data]);

    return <div className="page-shell">
        <div className="page-shell-bg" aria-hidden><div className="bg-grid" /></div>
        <div className="page-inner">
            <AdminSidebar user={user} uploadingLogo={false} onOpenLogoPicker={() => navigate("/admin")} onLogout={logout} />
            <main className="main" style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
                <header className="dash-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div>
                        <h1 style={{ margin: 0 }}>Planeación de stock</h1>
                        <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>Estimación de unidades por plataforma según ventas y fecha objetivo.</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
                        <label style={{ display: "grid", gap: 5, color: "var(--muted)", fontSize: 12 }}>
                            Fecha objetivo
                            <input aria-label="Fecha objetivo" type="date" min={today} max={shiftDate(today, 365)} value={targetDate} onChange={(event) => setTargetDate(event.target.value || today)} />
                        </label>
                        <label style={{ display: "grid", gap: 5, color: "var(--muted)", fontSize: 12 }}>
                            Historial
                            <select aria-label="Ventana de historial" value={historyDays} onChange={(event) => setHistoryDays(event.target.value)}>
                                <option value="30">30 días</option>
                                <option value="60">60 días</option>
                                <option value="90">90 días</option>
                            </select>
                        </label>
                        <button className="btn-ghost" type="button" title="Actualizar planeación" aria-label="Actualizar planeación" disabled={loading} onClick={() => setReloadKey((value) => value + 1)}>
                            <RefreshCcw size={16} className={loading ? "availability-spin" : ""} />
                        </button>
                    </div>
                </header>

                <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                    Promedio de compras nuevas de los {historyDays} días completos previos; las renovaciones próximas se muestran aparte y no se suman como nuevas pantallas.
                </p>

                {error && <div role="alert" style={{ color: "#fca5a5", background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.35)", borderRadius: 6, padding: 12 }}>{error}</div>}

                <section aria-label="Resumen de planeación" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", borderTop: "1px solid var(--stroke)", borderBottom: "1px solid var(--stroke)", padding: "16px 0", gap: 12 }}>
                    <div style={metricStyle}><span style={{ color: "var(--muted)", fontSize: 12 }}>Unidades estimadas hasta la fecha</span><strong style={{ fontSize: 23 }}>{formatCount(totals.estimatedDemand)}</strong></div>
                    <div style={metricStyle}><span style={{ color: "var(--muted)", fontSize: 12 }}>Stock vigente en la fecha</span><strong style={{ fontSize: 23 }}>{formatCount(totals.availableStock)}</strong></div>
                    <div style={{ ...metricStyle, borderColor: totals.suggestedToReplenish ? "#f59e0b" : "#10b981" }}><span style={{ color: "var(--muted)", fontSize: 12 }}>Unidades sugeridas para reponer</span><strong style={{ fontSize: 23, color: totals.suggestedToReplenish ? "#fbbf24" : "#34d399" }}>{formatCount(totals.suggestedToReplenish)}</strong></div>
                    <div style={metricStyle}><span style={{ color: "var(--muted)", fontSize: 12 }}>Suscripciones que vencen</span><strong style={{ fontSize: 23 }}>{formatCount(totals.expiringSubscriptions)}</strong></div>
                </section>

                <section aria-label="Planeación por plataforma" style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                        <h2 style={{ margin: 0, fontSize: 18 }}>Necesidad por plataforma</h2>
                        {data && <span style={{ color: "var(--muted)", fontSize: 12 }}>{data.daysAhead === 0 ? "Hoy" : `En ${data.daysAhead} días`} · al {data.targetDate}</span>}
                    </div>
                    {loading ? <p role="status" style={{ color: "var(--muted)" }}>Calculando con el historial…</p> : !data?.rows?.length ? <p style={{ color: "var(--muted)" }}>No hay plataformas activas que requieran inventario.</p> : (
                        <div style={{ overflowX: "auto", border: "1px solid var(--stroke)", borderRadius: 6 }}>
                            <table style={{ width: "100%", minWidth: 920, borderCollapse: "collapse", fontSize: 13 }}>
                                <thead><tr style={{ background: "rgba(0,0,0,.18)", textAlign: "left" }}>
                                    {["Plataforma", `Ventas nuevas · ${historyDays}d`, "Promedio / día", "Vencen en el periodo", "Demanda estimada", "Stock vigente", "Reponer"].map((label) => <th key={label} style={{ padding: "12px 14px", color: "var(--muted)", fontSize: 11, textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</th>)}
                                </tr></thead>
                                <tbody>{data.rows.map((row) => (
                                    <tr key={row.platformId} style={{ borderTop: "1px solid var(--stroke)" }}>
                                        <td style={{ padding: "13px 14px", fontWeight: 700 }}>{row.platformName}</td>
                                        <td style={{ padding: "13px 14px" }}>{formatCount(row.historicalSales)}</td>
                                        <td style={{ padding: "13px 14px" }}>{formatAverage(row.averageDailySales)}</td>
                                        <td style={{ padding: "13px 14px" }}>{formatCount(row.expiringSubscriptions)}</td>
                                        <td style={{ padding: "13px 14px", fontWeight: 700 }}>{formatCount(row.estimatedDemand)}</td>
                                        <td style={{ padding: "13px 14px" }}>{formatCount(row.availableStock)}</td>
                                        <td style={{ padding: "13px 14px", fontWeight: 800, color: row.suggestedToReplenish ? "#fbbf24" : "#34d399" }}>{row.suggestedToReplenish ? formatCount(row.suggestedToReplenish) : "Cubierto"}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}
                </section>

                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 12 }}>
                    <TrendingUp size={15} aria-hidden /><span>Estimación aproximada, no una orden de compra; usa el stock directo vigente en la fecha seleccionada.</span>
                </div>
            </main>
        </div>
    </div>;
}
