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

function replenishmentTone(value) {
    if (value === null || value === undefined) return "is-neutral";
    return value ? "is-needed" : "is-covered";
}

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

                <section className="stock-planning-table-section" aria-label="Planeación por plataforma">
                    <div className="stock-planning-section-heading">
                        <div>
                            <h2>Necesidad por plataforma</h2>
                            {data && <p>{data.rows.length} plataformas incluidas</p>}
                        </div>
                        {data && <span className="stock-planning-target"><CalendarDays size={15} aria-hidden="true" />{data.daysAhead === 0 ? "Hoy" : `En ${data.daysAhead} días`} <b>{formatDate(data.targetDate)}</b></span>}
                    </div>
                    {loading && !data ? <p className="stock-planning-state" role="status">Calculando con el historial…</p> : !data?.rows?.length ? <p className="stock-planning-state">No hay plataformas activas que requieran inventario.</p> : (
                        <div className="stock-planning-table-wrap">
                            <table className="stock-planning-table">
                                <thead><tr>
                                    <th scope="col">Plataforma</th>
                                    <th scope="col" className="is-numeric">Ventas nuevas · {historyDays} días</th>
                                    <th scope="col" className="is-numeric">Promedio / día</th>
                                    <th scope="col" className="is-numeric">Vencen en el periodo</th>
                                    <th scope="col" className="is-numeric">Demanda estimada</th>
                                    <th scope="col" className="is-numeric">Stock vigente</th>
                                    <th scope="col" className="is-numeric">Reponer</th>
                                </tr></thead>
                                <tbody>{data.rows.map((row) => (
                                    <tr key={row.platformId}>
                                        <th scope="row">{row.platformName}</th>
                                        <td className="is-numeric">{formatCount(row.historicalSales)}</td>
                                        <td className="is-numeric">{formatAverage(row.averageDailySales)}</td>
                                        <td className="is-numeric">{formatCount(row.expiringSubscriptions)}</td>
                                        <td className="is-numeric is-emphasized">{formatCount(row.estimatedDemand)}</td>
                                        <td className="is-numeric">{formatCount(row.availableStock)}</td>
                                        <td className="is-numeric"><span className={`stock-planning-gap${row.suggestedToReplenish ? " is-needed" : " is-covered"}`}>{row.suggestedToReplenish ? formatCount(row.suggestedToReplenish) : "Cubierto"}</span></td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}
                </section>

                {data?.rows?.length > 0 && <>
                    <section className="stock-planning-table-section stock-planning-comparison" aria-label="Comparativo de ventas">
                        <div className="stock-planning-section-heading">
                            <div>
                                <h2>Comparativo de ventas</h2>
                                <p>Ventas nuevas; semanas completas y mes actual hasta ayer.</p>
                            </div>
                        </div>
                        <div className="stock-planning-table-wrap">
                            <table className="stock-planning-table stock-planning-trend-table">
                                <thead><tr>
                                    <th scope="col">Plataforma / equivalencia</th>
                                    <th scope="col" className="is-numeric">Últimos 7 días</th>
                                    <th scope="col" className="is-numeric">7 días anteriores</th>
                                    <th scope="col" className="is-numeric">Cambio semanal</th>
                                    <th scope="col" className="is-numeric">Mes actual · {data.salesPeriods?.monthToDateDays || 0} días</th>
                                    <th scope="col" className="is-numeric">Mes anterior · {data.salesPeriods?.previousMonthDays || 0} días</th>
                                    <th scope="col" className="is-numeric">Cambio mensual</th>
                                </tr></thead>
                                <tbody>{data.rows.map((row) => {
                                    const trend = row.salesTrend || {};
                                    return <tr key={row.platformId}>
                                        <th scope="row">{row.platformName}</th>
                                        <td className="is-numeric">{formatCount(trend.recent7Sales)}</td>
                                        <td className="is-numeric">{formatCount(trend.previous7Sales)}</td>
                                        <td className={`is-numeric stock-planning-change ${changeTone(trend.weeklyChangePercent)}`}>{formatChange(trend.weeklyChangePercent)}</td>
                                        <td className="is-numeric">{formatCount(trend.monthToDateSales)}</td>
                                        <td className="is-numeric">{formatCount(trend.previousMonthSales)}</td>
                                        <td className={`is-numeric stock-planning-change ${changeTone(trend.monthlyChangePercent)}`}>{formatChange(trend.monthlyChangePercent)}</td>
                                    </tr>;
                                })}</tbody>
                            </table>
                        </div>
                    </section>

                    <section className="stock-planning-table-section stock-planning-comparison" aria-label="Reposición por ritmo de ventas">
                        <div className="stock-planning-section-heading">
                            <div>
                                <h2>Reposición según el ritmo de ventas</h2>
                                <p>Unidades que faltarían para cubrir la demanda hasta {formatDate(data.targetDate)} si se mantiene cada ritmo.</p>
                            </div>
                        </div>
                        <div className="stock-planning-table-wrap">
                            <table className="stock-planning-table stock-planning-replenishment-table">
                                <thead><tr>
                                    <th scope="col">Plataforma / equivalencia</th>
                                    <th scope="col" className="is-numeric">Ritmo últimos 7 días</th>
                                    <th scope="col" className="is-numeric">Ritmo últimos 14 días</th>
                                    <th scope="col" className="is-numeric">Ritmo mes actual</th>
                                    <th scope="col" className="is-numeric">Historial · {historyDays} días</th>
                                </tr></thead>
                                <tbody>{data.rows.map((row) => {
                                    const replenishment = row.salesTrend?.replenishment || {};
                                    return <tr key={row.platformId}>
                                        <th scope="row">{row.platformName}</th>
                                        {[replenishment.recent7, replenishment.recent14, replenishment.monthToDate, replenishment.selectedHistory].map((value, index) => (
                                            <td key={index} className="is-numeric"><span className={`stock-planning-gap ${replenishmentTone(value)}`}>{formatReplenishment(value)}</span></td>
                                        ))}
                                    </tr>;
                                })}</tbody>
                            </table>
                        </div>
                    </section>
                </>}

                <p className="stock-planning-footnote"><Info size={15} aria-hidden="true" />Estimación orientativa, no una orden de compra. El stock refleja las cuentas vigentes en la fecha seleccionada.</p>
            </main>
        </div>
    </div>;
}
