import React from "react";
import { CalendarDays, CircleAlert, ReceiptText, TrendingUp, WalletCards } from "lucide-react";
import { formatCurrency } from "../../utils/analyticsForecast.js";

function number(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatPercent(value) {
    return `${number(value).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;
}

function formatDay(date) {
    if (!date) return "";
    const parsed = new Date(`${date}T12:00:00-05:00`);
    if (Number.isNaN(parsed.getTime())) return date;
    return new Intl.DateTimeFormat("es-CO", {
        timeZone: "America/Bogota",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(parsed);
}

function Metric({ icon: Icon, label, value, helper, color }) {
    return (
        <div style={{
            minWidth: 0,
            padding: "14px 15px",
            borderRadius: 13,
            background: "rgba(7, 16, 43, .32)",
            border: "1px solid var(--stroke2)",
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
        }}>
            <span style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: `${color}1a`,
                color,
                flexShrink: 0,
            }}>
                <Icon size={16} strokeWidth={2.4} />
            </span>
            <div style={{ minWidth: 0 }}>
                <div style={{
                    color: "var(--muted)",
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: ".65px",
                    textTransform: "uppercase",
                }}>{label}</div>
                <div style={{
                    marginTop: 3,
                    color,
                    fontSize: 19,
                    lineHeight: 1.05,
                    fontWeight: 950,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}>{value}</div>
                {helper && <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 11, lineHeight: 1.25 }}>{helper}</div>}
            </div>
        </div>
    );
}

function PlatformDetailRow({ platform, isMobile }) {
    const sales = number(platform?.salesCount);
    const trackedSales = number(platform?.trackedSalesCount);
    const profit = number(platform?.netProfit);
    const margin = number(platform?.marginPct);
    const profitColor = profit >= 0 ? "#34d399" : "#fb7185";
    const coverageLabel = sales > 0 ? `${trackedSales}/${sales}` : "0/0";
    const missingSales = number(platform?.untrackedSalesCount);

    const value = (label, content, color = "var(--text)", helper = "") => (
        <div style={{ minWidth: 0 }}>
            <div style={{ color: "var(--muted)", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".45px" }}>{label}</div>
            <div style={{ marginTop: 4, color, fontSize: 14, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{content}</div>
            {helper && <div style={{ marginTop: 3, color: "var(--muted)", fontSize: 10, lineHeight: 1.2 }}>{helper}</div>}
        </div>
    );

    if (isMobile) {
        return (
            <div style={{ padding: 13, borderRadius: 12, border: "1px solid var(--stroke2)", background: "rgba(7,16,43,.28)", minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ color: "var(--text)", fontSize: 13, fontWeight: 900, overflowWrap: "anywhere" }}>{platform?.platformName || "Sin plataforma"}</div>
                        <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 11, fontWeight: 700 }}>{sales} pantalla{sales === 1 ? "" : "s"} vendida{sales === 1 ? "" : "s"}</div>
                    </div>
                    <span style={{ color: profitColor, fontSize: 13, fontWeight: 950, whiteSpace: "nowrap" }}>{formatCurrency(profit)}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 13 }}>
                    {value("Ingresos", formatCurrency(platform?.revenueTotal))}
                    {value("Costo", formatCurrency(platform?.costTotal), "#fbbf24", missingSales ? `${missingSales} sin costo` : "Costo completo")}
                    {value("Margen", formatPercent(margin), "#22d3ee", "sobre ventas con costo")}
                    {value("Cobertura", coverageLabel, trackedSales === sales ? "#34d399" : "#fbbf24", `${trackedSales} con costo`)}
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(190px, 2.2fr) minmax(80px, .8fr) repeat(3, minmax(105px, 1fr)) minmax(120px, 1.1fr)", gap: 12, alignItems: "center", padding: "13px 14px", borderRadius: 12, border: "1px solid var(--stroke2)", background: "rgba(7,16,43,.24)", minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
                <div style={{ color: "var(--text)", fontSize: 13, fontWeight: 900, overflowWrap: "anywhere" }}>{platform?.platformName || "Sin plataforma"}</div>
                <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 11, fontWeight: 700 }}>{sales} pantalla{sales === 1 ? "" : "s"} vendida{sales === 1 ? "" : "s"}</div>
            </div>
            {value("Pantallas", sales)}
            {value("Ingresos", formatCurrency(platform?.revenueTotal))}
            {value("Costo", formatCurrency(platform?.costTotal), "#fbbf24", missingSales ? `${missingSales} sin costo` : "Costo completo")}
            {value("Ganancia", formatCurrency(profit), profitColor)}
            {value("Margen / cobertura", formatPercent(margin), "#22d3ee", `${coverageLabel} con costo`)}
        </div>
    );
}

export default function DailyProfitView({ data, date, onDateChange, isMobile, loading }) {
    const revenue = number(data?.revenueTotal);
    const trackedRevenue = number(data?.trackedRevenue);
    const cost = number(data?.costTotal);
    const profit = number(data?.netProfit);
    const sales = number(data?.salesCount);
    const trackedSales = number(data?.trackedSalesCount);
    const missingCost = number(data?.missingCostCount);
    const margin = number(data?.marginPct);
    const platforms = Array.isArray(data?.platforms) ? data.platforms : [];

    return (
        <section style={{ display: "grid", gap: 14, minWidth: 0 }}>
            <div style={{
                padding: isMobile ? "16px 13px" : "20px",
                borderRadius: 16,
                border: "1px solid rgba(52,211,153,.30)",
                background: "linear-gradient(135deg, rgba(13,55,66,.94), rgba(17,29,66,.90))",
                boxShadow: "0 14px 36px rgba(0,0,0,.14)",
            }}>
                <div style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 14,
                    flexWrap: "wrap",
                }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#34d399", fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".9px" }}>
                            <TrendingUp size={15} strokeWidth={2.5} /> Resultado diario
                        </div>
                        <h2 style={{ margin: "7px 0 0", color: "var(--text)", fontSize: isMobile ? 19 : 22, letterSpacing: 0 }}>
                            Ganancias por dia
                        </h2>
                        <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>
                            Consulta independiente de los meses seleccionados.
                        </p>
                    </div>

                    <label style={{ display: "grid", gap: 5, minWidth: isMobile ? "100%" : 205 }}>
                        <span style={{ color: "var(--muted)", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".55px" }}>
                            Fecha a consultar
                        </span>
                        <span style={{ position: "relative", display: "flex", alignItems: "center" }}>
                            <CalendarDays size={15} style={{ position: "absolute", left: 10, color: "#34d399", pointerEvents: "none" }} />
                            <input
                                type="date"
                                value={date}
                                onChange={(event) => onDateChange(event.target.value)}
                                aria-label="Fecha a consultar"
                                style={{
                                    width: "100%",
                                    height: 36,
                                    padding: "0 10px 0 32px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(52,211,153,.35)",
                                    background: "var(--bg0)",
                                    color: "var(--text)",
                                    font: "inherit",
                                    fontSize: 13,
                                    fontWeight: 800,
                                    colorScheme: "dark",
                                }}
                            />
                        </span>
                    </label>
                </div>

                {loading ? (
                    <div style={{ minHeight: 116, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", gap: 9 }}>
                        <span className="spinner" style={{ width: 20, height: 20 }} /> Cargando resultado...
                    </div>
                ) : (
                    <>
                        <div style={{ marginTop: 18, color: "#a7f3d0", fontSize: 13, fontWeight: 800, textTransform: "capitalize" }}>
                            {formatDay(date)}
                        </div>
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))",
                            gap: 10,
                            marginTop: 10,
                        }}>
                            <Metric icon={ReceiptText} label="Ingresos" value={formatCurrency(revenue)} helper={`${sales} ventas`} color="#e2e8f0" />
                            <Metric icon={WalletCards} label="Costo registrado" value={formatCurrency(cost)} helper={`${trackedSales}/${sales} con costo`} color="#fbbf24" />
                            <Metric icon={TrendingUp} label="Ganancia neta" value={formatCurrency(profit)} helper={`Sobre ${formatCurrency(trackedRevenue)}`} color={profit >= 0 ? "#34d399" : "#fb7185"} />
                            <Metric icon={TrendingUp} label="Margen neto" value={trackedRevenue > 0 ? formatPercent(margin) : "Pendiente"} helper="Solo ventas con costo" color={trackedRevenue > 0 ? "#22d3ee" : "#fbbf24"} />
                        </div>
                    </>
                )}
            </div>

            {!loading && (
                <>
                    <div style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                        gap: 10,
                    }}>
                        <div style={{
                            padding: "12px 14px",
                            borderRadius: 12,
                            border: `1px solid ${missingCost ? "rgba(251,191,36,.30)" : "rgba(52,211,153,.25)"}`,
                            background: missingCost ? "rgba(245,158,11,.07)" : "rgba(16,185,129,.07)",
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, color: missingCost ? "#fbbf24" : "#34d399", fontWeight: 900, fontSize: 12 }}>
                                <CircleAlert size={15} /> Control de costos
                            </div>
                            <div style={{ marginTop: 5, color: "var(--text)", fontSize: 12, lineHeight: 1.4 }}>
                                {missingCost ? `${missingCost} venta${missingCost === 1 ? "" : "s"} del dia sin costo compatible.` : "Todas las ventas del dia tienen un costo compatible."}
                            </div>
                        </div>
                        <div style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(34,211,238,.24)", background: "rgba(34,211,238,.07)" }}>
                            <div style={{ color: "#22d3ee", fontWeight: 900, fontSize: 11, textTransform: "uppercase", letterSpacing: ".55px" }}>Ajustes del dia</div>
                            <div style={{ marginTop: 5, color: "var(--text)", fontSize: 12, lineHeight: 1.4 }}>
                                {number(data?.adjustmentTotal) !== 0
                                    ? `${formatCurrency(data.adjustmentTotal)} aplicados por devoluciones o liberaciones.`
                                    : "Sin devoluciones o liberaciones que ajustar."}
                            </div>
                        </div>
                    </div>

                    <section style={{ marginTop: 2, padding: isMobile ? 13 : 16, borderRadius: 16, border: "1px solid var(--stroke)", background: "var(--card)", minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ color: "#22d3ee", fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".8px" }}>Desglose del día</div>
                                <h3 style={{ margin: "5px 0 0", color: "var(--text)", fontSize: isMobile ? 16 : 18 }}>Detalle por pantallas</h3>
                                <p style={{ margin: "5px 0 0", color: "var(--muted)", fontSize: 12, lineHeight: 1.4 }}>Cada fila agrupa las pantallas vendidas de una plataforma en la fecha seleccionada.</p>
                            </div>
                            <span style={{ color: "var(--muted)", fontSize: 11, fontWeight: 800 }}>{platforms.length} plataforma{platforms.length === 1 ? "" : "s"}</span>
                        </div>

                        {platforms.length === 0 ? (
                            <div style={{ marginTop: 14, padding: 20, borderRadius: 12, background: "rgba(7,16,43,.28)", color: "var(--muted)", textAlign: "center", fontSize: 12, fontWeight: 700 }}>
                                No hay ventas registradas para este día.
                            </div>
                        ) : (
                            <div style={{ marginTop: 14, display: "grid", gap: 8, minWidth: 0 }}>
                                {!isMobile && <div style={{ display: "grid", gridTemplateColumns: "minmax(190px, 2.2fr) minmax(80px, .8fr) repeat(3, minmax(105px, 1fr)) minmax(120px, 1.1fr)", gap: 12, padding: "0 14px", color: "var(--muted)", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".45px" }}>
                                    <span>Plataforma</span><span>Pantallas</span><span>Ingresos</span><span>Costo</span><span>Ganancia</span><span>Margen / cobertura</span>
                                </div>}
                                {platforms.map((platform) => <PlatformDetailRow key={`${platform.platformId || "general"}-${platform.platformName}`} platform={platform} isMobile={isMobile} />)}
                            </div>
                        )}
                    </section>
                </>
            )}
        </section>
    );
}
