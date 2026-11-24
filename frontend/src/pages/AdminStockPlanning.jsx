import { useEffect, useMemo, useState } from "react";
import { Boxes, CalendarDays, Clock3, Info, PackageCheck, RefreshCcw, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import { apiGet } from "../api/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import useAppLogout from "../hooks/useAppLogout.js";
import { currentBogotaDateOnly } from "../utils/datetime.js";
import "../styles/admin-stock-planning.css";

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

function formatCop(value) {
    return Number(value || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

function formatDate(dateOnly) {
    const [year, month, day] = dateOnly.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString("es-CO", {
        day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    });
}

function formatChange(value) {
    if (value === null || value === undefined) return "Sin base previa";
    const change = Number(value);
    return `${change > 0 ? "+" : ""}${change.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;
}

function formatSalesDelta(current, previous) {
    if (current === null || current === undefined || previous === null || previous === undefined) return "Sin base comparable";
    const difference = Number(current) - Number(previous);
    if (!Number.isFinite(difference)) return "Sin base comparable";
    if (difference === 0) return "Sin cambio";
    return `${formatCount(Math.abs(difference))} ${difference < 0 ? "menos" : "más"}`;
}

function changeTone(value) {
    if (value === null || value === undefined || Number(value) === 0) return "is-neutral";
    return Number(value) > 0 ? "is-positive" : "is-negative";
}

function formatReplenishment(value) {
    if (value === null || value === undefined) return "—";
    return value ? formatCount(value) : "Cubierto";
}

function heatTier(value, maximum) {
    const ratio = maximum > 0 ? Math.abs(Number(value || 0)) / maximum : 0;
    if (!ratio) return "is-empty";
    if (ratio >= 0.75) return "is-high";
    if (ratio >= 0.4) return "is-medium";
    return "is-low";
}

function heatWidth(value, maximum) {
    return `${maximum > 0 ? Math.min(100, Math.round(Math.abs(Number(value || 0)) / maximum * 100)) : 0}%`;
}

function combinePlatformProfit(platformIds, profitsById) {
    return platformIds.split("+").map(Number).map((id) => profitsById.get(id)).filter(Boolean).reduce((sum, row) => ({
        salesCount: sum.salesCount + row.salesCount,
        trackedSalesCount: sum.trackedSalesCount + row.trackedSalesCount,
        untrackedSalesCount: sum.untrackedSalesCount + row.untrackedSalesCount,
        revenueTotal: sum.revenueTotal + row.revenueTotal,
        trackedRevenue: sum.trackedRevenue + row.trackedRevenue,
        netProfit: sum.netProfit + row.netProfit,
    }), { salesCount: 0, trackedSalesCount: 0, untrackedSalesCount: 0, revenueTotal: 0, trackedRevenue: 0, netProfit: 0 });
}

function commercialAction(row, { profitReady, profitError }) {
    if (!profitReady) return { label: profitError ? "Utilidad no disponible" : "Calculando utilidad", tone: "neutral" };
    if (!row.finance.trackedSalesCount && row.finance.salesCount) return { label: "Completar costos", tone: "pending" };
    if (row.finance.trackedSalesCount && row.finance.netProfit < 0) return { label: "Revisar margen", tone: "risk" };
    if (row.suggestedToReplenish > 0) return { label: row.availableStock > 0 ? "Vender y reponer" : "Reponer", tone: "replenish" };
    if (row.finance.netProfit > 0 && row.availableStock > 0) return { label: "Priorizar venta", tone: "profit" };
    if (!row.finance.salesCount && row.salesTrend?.monthToDateSales > 0) return { label: "Validar moneda", tone: "pending" };
    return { label: "Observar", tone: "neutral" };
}

export default function AdminStockPlanning() {
    const navigate = useNavigate();
    const logout = useAppLogout();
    const { user } = useAuth();
    const today = currentBogotaDateOnly();
    const [targetDate, setTargetDate] = useState(() => shiftDate(today, 7));
    const [historyDays, setHistoryDays] = useState("300");
    const [activeView, setActiveView] = useState("sales");
    const [platformFilter, setPlatformFilter] = useState("all");
    const [reloadKey, setReloadKey] = useState(0);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [profitData, setProfitData] = useState(null);
    const [profitLoading, setProfitLoading] = useState(true);
    const [profitError, setProfitError] = useState("");

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

    const currentMonth = today.slice(0, 7);
    useEffect(() => {
        let cancelled = false;
        async function loadProfit() {
            setProfitLoading(true);
            setProfitError("");
            try {
                const query = new URLSearchParams({ months: currentMonth, currency: "COP", global: "true" });
                const response = await apiGet(`/admin/analytics/platform-profit?${query}`);
                if (!response.ok) throw new Error(response.data?.error || "No se pudo cargar la utilidad.");
                if (!cancelled) setProfitData(response.data);
            } catch (loadError) {
                if (!cancelled) {
                    setProfitData(null);
                    setProfitError(loadError.message || "No se pudo cargar la utilidad.");
                }
            } finally {
                if (!cancelled) setProfitLoading(false);
            }
        }
        void loadProfit();
        return () => { cancelled = true; };
    }, [currentMonth, reloadKey]);

    const visibleRows = useMemo(() => (data?.rows || []).filter((row) => (
        platformFilter === "all" || String(row.platformId) === platformFilter
    )), [data, platformFilter]);

    const totals = useMemo(() => visibleRows.reduce((sum, row) => ({
        estimatedDemand: sum.estimatedDemand + Number(row.estimatedDemand || 0),
        availableStock: sum.availableStock + Number(row.availableStock || 0),
        suggestedToReplenish: sum.suggestedToReplenish + Number(row.suggestedToReplenish || 0),
        todaySales: sum.todaySales + Number(row.salesTrend?.todaySales || 0),
    }), { estimatedDemand: 0, availableStock: 0, suggestedToReplenish: 0, todaySales: 0 }), [visibleRows]);

    const profitsById = useMemo(() => new Map((profitData?.platforms || []).map((row) => [Number(row.platformId), {
        salesCount: Number(row.salesCount || 0),
        trackedSalesCount: Number(row.trackedSalesCount || 0),
        untrackedSalesCount: Number(row.untrackedSalesCount || 0),
        revenueTotal: Number(row.revenueTotal || 0),
        trackedRevenue: Number(row.trackedRevenue || 0),
        netProfit: Number(row.netProfit || 0),
    }])), [profitData]);

    const commercialRows = useMemo(() => visibleRows.map((row) => {
        const finance = combinePlatformProfit(String(row.platformId), profitsById);
        return { ...row, finance };
    }).sort((a, b) => b.finance.netProfit - a.finance.netProfit
        || Number(b.salesTrend?.monthToDateSales || 0) - Number(a.salesTrend?.monthToDateSales || 0)
        || a.platformName.localeCompare(b.platformName)), [visibleRows, profitsById]);

    const commercialTotals = useMemo(() => commercialRows.reduce((sum, row) => ({
        netProfit: sum.netProfit + row.finance.netProfit,
        trackedSalesCount: sum.trackedSalesCount + row.finance.trackedSalesCount,
        salesCount: sum.salesCount + row.finance.salesCount,
        untrackedSalesCount: sum.untrackedSalesCount + row.finance.untrackedSalesCount,
    }), { netProfit: 0, trackedSalesCount: 0, salesCount: 0, untrackedSalesCount: 0 }), [commercialRows]);

    const heatMaxima = useMemo(() => ({
        recent7: Math.max(0, ...commercialRows.map((row) => Number(row.salesTrend?.recent7Sales || 0))),
        month: Math.max(0, ...commercialRows.map((row) => Number(row.salesTrend?.monthToDateSales || 0))),
        profit: Math.max(0, ...commercialRows.map((row) => Math.abs(row.finance.netProfit))),
        replenishment: Math.max(0, ...visibleRows.flatMap((row) => Object.values(row.salesTrend?.replenishment || {}).map((value) => Number(value || 0)))),
    }), [commercialRows, visibleRows]);

    const profitLeader = commercialRows.find((row) => row.finance.trackedSalesCount > 0);
    const salesLeader = [...visibleRows]
        .filter((row) => Number(row.salesTrend?.monthToDateSales || 0) > 0)
        .sort((a, b) => Number(b.salesTrend?.monthToDateSales || 0) - Number(a.salesTrend?.monthToDateSales || 0))[0];

    const viewTitle = activeView === "sales" ? "Oportunidad comercial"
        : activeView === "replenishment" ? "Reposición según el ritmo de ventas"
            : "Necesidad por plataforma";

    return <div className="page-shell">
        <div className="page-shell-bg" aria-hidden><div className="bg-grid" /></div>
        <div className="page-inner">
            <AdminSidebar user={user} uploadingLogo={false} onOpenLogoPicker={() => navigate("/admin")} onLogout={logout} />
            <main className="main stock-planning-page">
                <header className="stock-planning-header">
                    <div className="stock-planning-title">
                        <span className="stock-planning-title-icon" aria-hidden="true"><Boxes size={21} /></span>
                        <div>
                            <h1>Planeación de stock</h1>
                            <p>Estima cuántas unidades necesitarás por plataforma.</p>
                        </div>
                    </div>
                    <div className="stock-planning-controls">
                        <label className="stock-planning-field">
                            <span>Fecha objetivo</span>
                            <input aria-label="Fecha objetivo" type="date" min={today} max={shiftDate(today, 365)} value={targetDate} onChange={(event) => setTargetDate(event.target.value || today)} />
                        </label>
                        <label className="stock-planning-field">
                            <span>Historial de ventas</span>
                            <select aria-label="Ventana de historial" value={historyDays} onChange={(event) => setHistoryDays(event.target.value)}>
                                <option value="30">30 días</option>
                                <option value="60">60 días</option>
                                <option value="90">90 días</option>
                                <option value="180">180 días</option>
                                <option value="270">270 días</option>
                                <option value="300">Máximo · 300 días</option>
                            </select>
                        </label>
                        <button className="stock-planning-refresh" type="button" title="Actualizar planeación" aria-label="Actualizar planeación" disabled={loading} onClick={() => setReloadKey((value) => value + 1)}>
                            <RefreshCcw size={17} className={loading ? "availability-spin" : ""} />
                        </button>
                    </div>
                </header>

                <p className="stock-planning-explainer">
                    <Info size={16} aria-hidden="true" />
                    <span>Proyección ponderada: 15% últimos 7 días, 35% últimos 30, 30% últimos 90 y 20% del historial elegido. Ventas reales de hoy aparte; renovaciones excluidas. Las equivalencias activas comparten stock en la dirección configurada.</span>
                </p>

                {error && <div className="stock-planning-error" role="alert">{error}</div>}

                <section className="stock-planning-metrics" aria-label="Resumen de planeación">
                    <article className="stock-planning-metric stock-planning-metric--demand">
                        <div className="stock-planning-metric-label"><span><TrendingUp size={17} /></span>Demanda prevista</div>
                        <strong>{data ? formatCount(totals.estimatedDemand) : "—"}</strong>
                        <small>Ventas estimadas hasta {data ? formatDate(data.targetDate) : "la fecha elegida"}</small>
                    </article>
                    <article className="stock-planning-metric stock-planning-metric--stock">
                        <div className="stock-planning-metric-label"><span><PackageCheck size={17} /></span>Stock con vigencia</div>
                        <strong>{data ? formatCount(totals.availableStock) : "—"}</strong>
                        <small>Disponible en la fecha objetivo</small>
                    </article>
                    <article className={`stock-planning-metric stock-planning-metric--replenish${totals.suggestedToReplenish ? " is-needed" : " is-covered"}`}>
                        <div className="stock-planning-metric-label"><span><Boxes size={17} /></span>Faltante estimado</div>
                        <strong>{data ? formatCount(totals.suggestedToReplenish) : "—"}</strong>
                        <small>{totals.suggestedToReplenish ? "Demanda prevista menos stock vigente" : "El stock cubre la proyección"}</small>
                    </article>
                    <article className="stock-planning-metric stock-planning-metric--today">
                        <div className="stock-planning-metric-label"><span><Clock3 size={17} /></span>Ventas de hoy</div>
                        <strong>{data ? formatCount(totals.todaySales) : "—"}</strong>
                        <small>Unidades reales vendidas hoy</small>
                    </article>
                </section>

                <section className="stock-planning-workspace" aria-label="Detalle de planeación">
                    <div className="stock-planning-workspace-controls">
                        <div className="stock-planning-view-switch" role="group" aria-label="Sección de planeación">
                            <button type="button" aria-pressed={activeView === "need"} onClick={() => setActiveView("need")}><PackageCheck size={16} aria-hidden="true" />Necesidad</button>
                            <button type="button" aria-pressed={activeView === "sales"} onClick={() => setActiveView("sales")}><TrendingUp size={16} aria-hidden="true" />Ventas</button>
                            <button type="button" aria-pressed={activeView === "replenishment"} onClick={() => setActiveView("replenishment")}><Boxes size={16} aria-hidden="true" />Reposición</button>
                        </div>
                        <label className="stock-planning-platform-filter">
                            <span>Filtrar por plataforma</span>
                            <select aria-label="Filtrar por plataforma" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)} disabled={!data?.rows?.length}>
                                <option value="all">Todas las plataformas</option>
                                {(data?.rows || []).map((row) => <option key={row.platformId} value={String(row.platformId)}>{row.platformName}</option>)}
                            </select>
                        </label>
                    </div>

                    <section className="stock-planning-table-section" aria-label={viewTitle}>
                        <div className="stock-planning-section-heading">
                            <div>
                                <h2>{viewTitle}</h2>
                                {data && <p>{platformFilter === "all" ? `${visibleRows.length} grupos de plataformas` : `${visibleRows.length} de ${data.rows.length} grupos`}</p>}
                            </div>
                            {data && <span className="stock-planning-target"><CalendarDays size={15} aria-hidden="true" />{data.daysAhead === 0 ? "Hoy" : `En ${data.daysAhead} días`} <b>{formatDate(data.targetDate)}</b></span>}
                        </div>
                        {loading && !data ? <p className="stock-planning-state" role="status">Calculando con el historial…</p>
                            : !visibleRows.length ? <p className="stock-planning-state">{data?.rows?.length ? "No hay resultados para esta plataforma." : "No hay plataformas activas que requieran inventario."}</p>
                                : <div className="stock-planning-view-content">
                                    {activeView === "need" && <div className="stock-planning-table-wrap"><table className="stock-planning-table stock-planning-need-table">
                                        <thead><tr>
                                            <th scope="col">Plataforma</th>
                                            <th scope="col" className="is-numeric">Ventas hoy</th>
                                            <th scope="col" className="is-numeric">Ventas nuevas · {historyDays} días</th>
                                            <th scope="col" className="is-numeric">Promedio histórico / día</th>
                                            <th scope="col" className="is-numeric">Ritmo previsto / día</th>
                                            <th scope="col" className="is-numeric">Vencen en el periodo</th>
                                            <th scope="col" className="is-numeric">Demanda hasta fecha</th>
                                            <th scope="col" className="is-numeric">Stock vigente</th>
                                            <th scope="col" className="is-numeric">Faltante</th>
                                        </tr></thead>
                                        <tbody>{visibleRows.map((row) => <tr key={row.platformId}>
                                            <th scope="row">{row.platformName}</th>
                                            <td className="is-numeric">{formatCount(row.salesTrend?.todaySales)}</td>
                                            <td className="is-numeric">{formatCount(row.historicalSales)}</td>
                                            <td className="is-numeric">{formatAverage(row.averageDailySales)}</td>
                                            <td className="is-numeric is-emphasized">{formatAverage(row.forecastDailySales)}</td>
                                            <td className="is-numeric">{formatCount(row.expiringSubscriptions)}</td>
                                            <td className="is-numeric is-emphasized">{formatCount(row.estimatedDemand)}</td>
                                            <td className="is-numeric">{formatCount(row.availableStock)}</td>
                                            <td className="is-numeric"><span className={`stock-planning-gap${row.suggestedToReplenish ? " is-needed" : " is-covered"}`}>{row.suggestedToReplenish ? formatCount(row.suggestedToReplenish) : "Cubierto"}</span></td>
                                        </tr>)}</tbody>
                                    </table></div>}

                                    {activeView === "sales" && <>
                                        <p className="stock-planning-view-note">Compara ventas reales, ritmo previsto, cambio frente al mismo tramo del mes pasado, utilidad y stock vigente.</p>
                                        {profitError && <p className="stock-planning-view-warning" role="status">No se pudo cargar la utilidad; se mantienen visibles las ventas y el stock. Actualiza para reintentar.</p>}
                                        <section className="stock-planning-commercial-summary" aria-label="Resumen comercial del mes actual">
                                            <div>
                                                <span>Utilidad registrada · COP</span>
                                                <strong>{profitLoading ? "…" : formatCop(commercialTotals.netProfit)}</strong>
                                                <small>Ventas con costo comparable</small>
                                            </div>
                                            <div>
                                                <span>Mayor utilidad</span>
                                                <strong>{profitLoading ? "Cargando" : profitLeader?.platformName || "Sin datos"}</strong>
                                                <small>{profitLeader ? formatCop(profitLeader.finance.netProfit) : "Mes actual"}</small>
                                            </div>
                                            <div>
                                                <span>Mayor movimiento</span>
                                                <strong>{salesLeader?.platformName || "Sin ventas"}</strong>
                                                <small>{salesLeader ? `${formatCount(salesLeader.salesTrend.monthToDateSales)} ventas este mes` : "Sin ventas este mes"}</small>
                                            </div>
                                            <div>
                                                <span>Cobertura de costos · COP</span>
                                                <strong>{profitLoading ? "…" : `${formatCount(commercialTotals.trackedSalesCount)} / ${formatCount(commercialTotals.salesCount)}`}</strong>
                                                <small>{formatCount(commercialTotals.untrackedSalesCount)} ventas sin costo registrado</small>
                                            </div>
                                        </section>
                                        <div className="stock-planning-heat-legend" aria-label="Leyenda del mapa de calor">
                                            <span><i className="is-volume" aria-hidden="true" />Más azul: más ventas</span>
                                            <span><i className="is-profit" aria-hidden="true" />Verde: utilidad positiva</span>
                                            <span><i className="is-loss" aria-hidden="true" />Rojo: utilidad negativa</span>
                                            <span><i className="is-pending" aria-hidden="true" />Costo pendiente: utilidad parcial</span>
                                        </div>
                                        <details className="stock-planning-glossary">
                                            <summary>Glosario: cómo leer estas cifras</summary>
                                            <dl>
                                                <div><dt>Venta · 7 días</dt><dd>Unidades vendidas en los últimos siete días; debajo se compara con los siete días anteriores.</dd></div>
                                                <div><dt>Ventas hoy</dt><dd>Ventas nuevas registradas desde la medianoche de hoy en Bogotá. No es una proyección.</dd></div>
                                                <div><dt>Ritmo previsto / día</dt><dd>Estimación diaria que combina 15% de los últimos 7 días, 35% de los últimos 30, 30% de los últimos 90 y 20% del historial elegido. La semana influye, pero no determina sola el resultado.</dd></div>
                                                <div><dt>Demanda prevista</dt><dd>Ritmo previsto por los días que faltan hasta la fecha elegida; es una estimación de ventas, no una garantía.</dd></div>
                                                <div><dt>Venta · mes actual</dt><dd>Unidades vendidas desde el inicio de este mes. El texto inferior muestra el mismo tramo del mes pasado.</dd></div>
                                                <div><dt>Periodo comparable</dt><dd>La misma cantidad de días transcurridos del mes anterior; no es el total de ese mes.</dd></div>
                                                <div><dt>Diferencia de ventas</dt><dd>Cuántas unidades subieron o bajaron y qué porcentaje representa frente al periodo comparable.</dd></div>
                                                <div><dt>Utilidad neta · COP</dt><dd>Ganancia registrada en ventas con costo comparable; puede ser parcial si faltan costos.</dd></div>
                                                <div><dt>Stock vigente</dt><dd>Cuentas disponibles que seguirán vigentes en la fecha objetivo seleccionada.</dd></div>
                                                <div><dt>Faltante</dt><dd>Demanda prevista hasta la fecha menos stock vigente allí. Si sale “Cubierto”, el stock actual cubre la proyección.</dd></div>
                                                <div><dt>Sugerencia</dt><dd>Orientación basada en ventas, utilidad y stock disponible.</dd></div>
                                            </dl>
                                        </details>
                                        <div className="stock-planning-table-wrap"><table className="stock-planning-table stock-planning-commercial-table">
                                            <thead><tr>
                                                <th scope="col">Plataforma / equivalencia</th>
                                                <th scope="col" className="is-numeric">Ventas hoy</th>
                                                <th scope="col" className="is-numeric">Ritmo previsto / día</th>
                                                <th scope="col" className="is-numeric">Venta · 7 días</th>
                                                <th scope="col" className="is-numeric">Venta · mes actual</th>
                                                <th scope="col" className="is-numeric">Diferencia de ventas</th>
                                                <th scope="col" className="is-numeric">Utilidad neta · COP</th>
                                                <th scope="col" className="is-numeric">Stock en fecha objetivo</th>
                                                <th scope="col" className="is-numeric">Faltante al objetivo</th>
                                                <th scope="col">Sugerencia</th>
                                            </tr></thead>
                                            <tbody>{commercialRows.map((row) => {
                                                const trend = row.salesTrend || {};
                                                const action = commercialAction(row, { profitReady: Boolean(profitData), profitError });
                                                const weeklySales = Number(trend.recent7Sales || 0);
                                                const monthlySales = Number(trend.monthToDateSales || 0);
                                                const profit = row.finance.netProfit;
                                                return <tr key={row.platformId}>
                                                    <th scope="row">{row.platformName}</th>
                                                    <td className="is-numeric">{formatCount(trend.todaySales)}</td>
                                                    <td className="is-numeric is-emphasized">{formatAverage(row.forecastDailySales)}</td>
                                                    <td className={`is-numeric stock-planning-heat-cell is-volume ${heatTier(weeklySales, heatMaxima.recent7)}`} title={`${formatCount(weeklySales)} ventas; semana anterior: ${formatCount(trend.previous7Sales)}`}>
                                                        <span>{formatCount(weeklySales)}</span><i style={{ width: heatWidth(weeklySales, heatMaxima.recent7) }} aria-hidden="true" />
                                                        <small>{formatChange(trend.weeklyChangePercent)} vs. semana anterior</small>
                                                    </td>
                                                    <td className={`is-numeric stock-planning-heat-cell is-volume ${heatTier(monthlySales, heatMaxima.month)}`} title={`${formatCount(monthlySales)} ventas este mes; ${trend.previousMonthSales === null || trend.previousMonthSales === undefined ? "sin periodo comparable" : `${formatCount(trend.previousMonthSales)} ventas en el mismo tramo del mes pasado`}`}>
                                                        <span>{formatCount(monthlySales)}</span><i style={{ width: heatWidth(monthlySales, heatMaxima.month) }} aria-hidden="true" />
                                                        <small>{trend.previousMonthSales === null || trend.previousMonthSales === undefined ? "Sin base comparable" : `${formatCount(trend.previousMonthSales)} mismo tramo del mes pasado`}</small>
                                                    </td>
                                                    <td className={`is-numeric stock-planning-change ${changeTone(trend.monthlyChangePercent)}`} title="Diferencia frente al mismo tramo del mes pasado">
                                                        <span>{formatSalesDelta(trend.monthToDateSales, trend.previousMonthSales)}</span>
                                                        <small>{formatChange(trend.monthlyChangePercent)} vs. periodo comparable</small>
                                                    </td>
                                                    <td className={`is-numeric stock-planning-heat-cell ${row.finance.trackedSalesCount ? profit < 0 ? "is-loss" : `is-profit ${heatTier(profit, heatMaxima.profit)}` : row.finance.untrackedSalesCount ? "is-cost-pending" : "is-empty"}`} title="Utilidad neta de ventas COP con costo comparable registrado">
                                                        <span>{row.finance.trackedSalesCount ? formatCop(profit) : row.finance.untrackedSalesCount ? "Costo pendiente" : "—"}</span>
                                                        {row.finance.trackedSalesCount > 0 && <i style={{ width: heatWidth(profit, heatMaxima.profit) }} aria-hidden="true" />}
                                                        {row.finance.untrackedSalesCount > 0 && <small>{formatCount(row.finance.untrackedSalesCount)} venta(s) sin costo</small>}
                                                    </td>
                                                    <td className="is-numeric">{formatCount(row.availableStock)}</td>
                                                    <td className={`is-numeric stock-planning-heat-cell ${row.suggestedToReplenish ? `is-replenish ${heatTier(row.suggestedToReplenish, heatMaxima.replenishment)}` : "is-covered"}`}>
                                                        <span>{row.suggestedToReplenish ? formatCount(row.suggestedToReplenish) : "Cubierto"}</span>
                                                        {row.suggestedToReplenish > 0 && <i style={{ width: heatWidth(row.suggestedToReplenish, heatMaxima.replenishment) }} aria-hidden="true" />}
                                                    </td>
                                                    <td><span className={`stock-planning-action is-${action.tone}`}>{action.label}</span></td>
                                                </tr>;
                                            })}</tbody>
                                        </table></div>
                                    </>}

                                    {activeView === "replenishment" && <>
                                        <p className="stock-planning-view-note">Escenarios de faltante para {formatDate(data.targetDate)}. La proyección ponderada es la referencia; los demás escenarios sirven para comparar y no son órdenes de compra.</p>
                                        <div className="stock-planning-table-wrap"><table className="stock-planning-table stock-planning-replenishment-table">
                                            <thead><tr>
                                                <th scope="col">Plataforma / equivalencia</th>
                                                <th scope="col" className="is-numeric is-recommended">Proyección ponderada</th>
                                                <th scope="col" className="is-numeric">Ritmo últimos 7 días</th>
                                                <th scope="col" className="is-numeric">Ritmo últimos 30 días</th>
                                                <th scope="col" className="is-numeric">Ritmo últimos 90 días</th>
                                                <th scope="col" className="is-numeric">Ritmo últimos 14 días</th>
                                                <th scope="col" className="is-numeric">Ritmo mes actual</th>
                                                <th scope="col" className="is-numeric">Historial · {historyDays} días</th>
                                            </tr></thead>
                                            <tbody>{visibleRows.map((row) => {
                                                const replenishment = row.salesTrend?.replenishment || {};
                                                const values = [replenishment.weighted, replenishment.recent7, replenishment.recent30, replenishment.recent90, replenishment.recent14, replenishment.monthToDate, replenishment.selectedHistory];
                                                return <tr key={row.platformId}>
                                                    <th scope="row">{row.platformName}</th>
                                                    {values.map((value, index) => (
                                                        <td key={index} className={`is-numeric stock-planning-heat-cell ${index === 0 ? "is-recommended" : ""} ${value === 0 ? "is-covered" : `is-replenish ${heatTier(value, heatMaxima.replenishment)}`}`}>
                                                            <span>{formatReplenishment(value)}</span>
                                                            {value > 0 && <i style={{ width: heatWidth(value, heatMaxima.replenishment) }} aria-hidden="true" />}
                                                        </td>
                                                    ))}
                                                </tr>;
                                            })}</tbody>
                                        </table></div>
                                    </>}
                                </div>}
                    </section>
                </section>

                <p className="stock-planning-footnote"><Info size={15} aria-hidden="true" />Estimación orientativa, no una orden de compra. El stock refleja las cuentas vigentes en la fecha seleccionada.</p>
            </main>
        </div>
    </div>;
}
