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
        marginPct: 0,
    }), { salesCount: 0, trackedSalesCount: 0, untrackedSalesCount: 0, revenueTotal: 0, trackedRevenue: 0, netProfit: 0, marginPct: 0 });
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
    const [historyDays, setHistoryDays] = useState("30");
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
        expiringSubscriptions: sum.expiringSubscriptions + Number(row.expiringSubscriptions || 0),
    }), { estimatedDemand: 0, availableStock: 0, suggestedToReplenish: 0, expiringSubscriptions: 0 }), [visibleRows]);

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
        finance.marginPct = finance.trackedRevenue > 0 ? (finance.netProfit / finance.trackedRevenue) * 100 : 0;
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
                            </select>
                        </label>
                        <button className="stock-planning-refresh" type="button" title="Actualizar planeación" aria-label="Actualizar planeación" disabled={loading} onClick={() => setReloadKey((value) => value + 1)}>
                            <RefreshCcw size={17} className={loading ? "availability-spin" : ""} />
                        </button>
                    </div>
                </header>

                <p className="stock-planning-explainer">
                    <Info size={16} aria-hidden="true" />
                    <span>Promedio de ventas nuevas de los últimos {historyDays} días completos. Las renovaciones van aparte; la reposición compartida respeta la dirección de cada equivalencia activa.</span>
                </p>

                {error && <div className="stock-planning-error" role="alert">{error}</div>}

                <section className="stock-planning-metrics" aria-label="Resumen de planeación">
                    <article className="stock-planning-metric stock-planning-metric--demand">
                        <div className="stock-planning-metric-label"><span><TrendingUp size={17} /></span>Demanda estimada</div>
                        <strong>{data ? formatCount(totals.estimatedDemand) : "—"}</strong>
                        <small>Unidades hasta la fecha objetivo</small>
                    </article>
                    <article className="stock-planning-metric stock-planning-metric--stock">
                        <div className="stock-planning-metric-label"><span><PackageCheck size={17} /></span>Stock con vigencia</div>
                        <strong>{data ? formatCount(totals.availableStock) : "—"}</strong>
                        <small>Disponible en la fecha objetivo</small>
                    </article>
                    <article className={`stock-planning-metric stock-planning-metric--replenish${totals.suggestedToReplenish ? " is-needed" : " is-covered"}`}>
                        <div className="stock-planning-metric-label"><span><Boxes size={17} /></span>Unidades por reponer</div>
                        <strong>{data ? formatCount(totals.suggestedToReplenish) : "—"}</strong>
                        <small>{totals.suggestedToReplenish ? "Brecha entre demanda y stock" : "Stock suficiente para la demanda"}</small>
                    </article>
                    <article className="stock-planning-metric stock-planning-metric--expiring">
                        <div className="stock-planning-metric-label"><span><Clock3 size={17} /></span>Vencimientos</div>
                        <strong>{data ? formatCount(totals.expiringSubscriptions) : "—"}</strong>
                        <small>Suscripciones durante el periodo</small>
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
                                    {activeView === "need" && <div className="stock-planning-table-wrap"><table className="stock-planning-table">
                                        <thead><tr>
                                            <th scope="col">Plataforma</th>
                                            <th scope="col" className="is-numeric">Ventas nuevas · {historyDays} días</th>
                                            <th scope="col" className="is-numeric">Promedio / día</th>
                                            <th scope="col" className="is-numeric">Vencen en el periodo</th>
                                            <th scope="col" className="is-numeric">Demanda estimada</th>
                                            <th scope="col" className="is-numeric">Stock vigente</th>
                                            <th scope="col" className="is-numeric">Reponer</th>
                                        </tr></thead>
                                        <tbody>{visibleRows.map((row) => <tr key={row.platformId}>
                                            <th scope="row">{row.platformName}</th>
                                            <td className="is-numeric">{formatCount(row.historicalSales)}</td>
                                            <td className="is-numeric">{formatAverage(row.averageDailySales)}</td>
                                            <td className="is-numeric">{formatCount(row.expiringSubscriptions)}</td>
                                            <td className="is-numeric is-emphasized">{formatCount(row.estimatedDemand)}</td>
                                            <td className="is-numeric">{formatCount(row.availableStock)}</td>
                                            <td className="is-numeric"><span className={`stock-planning-gap${row.suggestedToReplenish ? " is-needed" : " is-covered"}`}>{row.suggestedToReplenish ? formatCount(row.suggestedToReplenish) : "Cubierto"}</span></td>
                                        </tr>)}</tbody>
                                    </table></div>}

                                    {activeView === "sales" && <>
                                        <p className="stock-planning-view-note">Mapa ordenado por utilidad registrada en COP. Cruza movimiento, margen y stock para decidir qué vender o reponer.</p>
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
                                        <div className="stock-planning-table-wrap"><table className="stock-planning-table stock-planning-commercial-table">
                                            <thead><tr>
                                                <th scope="col">Plataforma / equivalencia</th>
                                                <th scope="col" className="is-numeric">Venta · 7 días</th>
                                                <th scope="col" className="is-numeric">Venta · mes actual</th>
                                                <th scope="col" className="is-numeric">Cambio mensual</th>
                                                <th scope="col" className="is-numeric">Utilidad neta · COP</th>
                                                <th scope="col" className="is-numeric">Margen registrado</th>
                                                <th scope="col" className="is-numeric">Stock</th>
                                                <th scope="col" className="is-numeric">Reponer</th>
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
                                                    <td className={`is-numeric stock-planning-heat-cell is-volume ${heatTier(weeklySales, heatMaxima.recent7)}`} title={`${formatCount(weeklySales)} ventas; semana anterior: ${formatCount(trend.previous7Sales)}`}>
                                                        <span>{formatCount(weeklySales)}</span><i style={{ width: heatWidth(weeklySales, heatMaxima.recent7) }} aria-hidden="true" />
                                                        <small>{formatChange(trend.weeklyChangePercent)} vs. semana anterior</small>
                                                    </td>
                                                    <td className={`is-numeric stock-planning-heat-cell is-volume ${heatTier(monthlySales, heatMaxima.month)}`} title={`${formatCount(monthlySales)} ventas; periodo equivalente anterior: ${formatCount(trend.previousMonthSales)}`}>
                                                        <span>{formatCount(monthlySales)}</span><i style={{ width: heatWidth(monthlySales, heatMaxima.month) }} aria-hidden="true" />
                                                        <small>{formatCount(trend.previousMonthSales)} periodo anterior</small>
                                                    </td>
                                                    <td className={`is-numeric stock-planning-change ${changeTone(trend.monthlyChangePercent)}`}>{formatChange(trend.monthlyChangePercent)}</td>
                                                    <td className={`is-numeric stock-planning-heat-cell ${row.finance.trackedSalesCount ? profit < 0 ? "is-loss" : `is-profit ${heatTier(profit, heatMaxima.profit)}` : row.finance.untrackedSalesCount ? "is-cost-pending" : "is-empty"}`} title="Utilidad neta de ventas COP con costo comparable registrado">
                                                        <span>{row.finance.trackedSalesCount ? formatCop(profit) : row.finance.untrackedSalesCount ? "Costo pendiente" : "—"}</span>
                                                        {row.finance.trackedSalesCount > 0 && <i style={{ width: heatWidth(profit, heatMaxima.profit) }} aria-hidden="true" />}
                                                        {row.finance.untrackedSalesCount > 0 && <small>{formatCount(row.finance.untrackedSalesCount)} venta(s) sin costo</small>}
                                                    </td>
                                                    <td className={`is-numeric stock-planning-change ${row.finance.trackedSalesCount ? changeTone(row.finance.marginPct) : "is-neutral"}`}>{row.finance.trackedSalesCount ? `${formatAverage(row.finance.marginPct)}%` : "—"}</td>
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
                                        <p className="stock-planning-view-note">Unidades que faltarían para cubrir la demanda hasta {formatDate(data.targetDate)} si se mantiene cada ritmo.</p>
                                        <div className="stock-planning-table-wrap"><table className="stock-planning-table stock-planning-replenishment-table">
                                            <thead><tr>
                                                <th scope="col">Plataforma / equivalencia</th>
                                                <th scope="col" className="is-numeric">Ritmo últimos 7 días</th>
                                                <th scope="col" className="is-numeric">Ritmo últimos 14 días</th>
                                                <th scope="col" className="is-numeric">Ritmo mes actual</th>
                                                <th scope="col" className="is-numeric">Historial · {historyDays} días</th>
                                            </tr></thead>
                                            <tbody>{visibleRows.map((row) => {
                                                const replenishment = row.salesTrend?.replenishment || {};
                                                const values = [replenishment.recent7, replenishment.recent14, replenishment.monthToDate, replenishment.selectedHistory];
                                                return <tr key={row.platformId}>
                                                    <th scope="row">{row.platformName}</th>
                                                    {values.map((value, index) => (
                                                        <td key={index} className={`is-numeric stock-planning-heat-cell ${value === 0 ? "is-covered" : `is-replenish ${heatTier(value, heatMaxima.replenishment)}`}`}>
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
