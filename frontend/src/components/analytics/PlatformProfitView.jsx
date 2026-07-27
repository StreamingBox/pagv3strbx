import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, CircleAlert, ReceiptText, Search, TrendingUp, WalletCards } from "lucide-react";
import { formatCurrency } from "../../utils/analyticsForecast.js";

function toNumber(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatPercent(value) {
    return `${toNumber(value).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;
}

function marginColor(value) {
    const margin = toNumber(value);
    if (margin < 0) return "#fb7185";
    if (margin < 25) return "#f59e0b";
    if (margin < 50) return "#22d3ee";
    return "#34d399";
}

function summaryTone(value) {
    return value < 0 ? "#fb7185" : "#34d399";
}

function normalizeRow(row) {
    const trackedRevenue = toNumber(row?.trackedRevenue);
    const netProfit = toNumber(row?.netProfit);
    return {
        platformId: row?.platformId,
        platformName: row?.platformName || "Sin plataforma",
        salesCount: toNumber(row?.salesCount),
        revenueTotal: toNumber(row?.revenueTotal),
        trackedSalesCount: toNumber(row?.trackedSalesCount),
        trackedRevenue,
        costTotal: toNumber(row?.costTotal),
        netProfit,
        untrackedSalesCount: toNumber(row?.untrackedSalesCount),
        untrackedRevenue: toNumber(row?.untrackedRevenue),
        marginPct: trackedRevenue > 0 ? toNumber(row?.marginPct) : 0,
    };
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
                {React.createElement(Icon, { size: 16, strokeWidth: 2.4 })}
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

function Coverage({ row }) {
    const complete = row.untrackedSalesCount === 0;
    const color = complete ? "#34d399" : "#fbbf24";
    return (
        <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                <span style={{ color, fontWeight: 900, fontSize: 11 }}>
                    {complete ? "Costo completo" : "Falta costo"}
                </span>
                <span style={{ color: "var(--muted)", fontSize: 10, whiteSpace: "nowrap" }}>
                    {row.trackedSalesCount}/{row.salesCount}
                </span>
            </div>
            <div style={{ height: 5, borderRadius: 999, background: "rgba(148,163,184,.16)", overflow: "hidden" }}>
                <div style={{
                    width: `${row.salesCount > 0 ? Math.min(100, (row.trackedSalesCount / row.salesCount) * 100) : 0}%`,
                    height: "100%",
                    borderRadius: "inherit",
                    background: color,
                }} />
            </div>
        </div>
    );
}

function DesktopRow({ row, rank }) {
    const isTracked = row.trackedSalesCount > 0;
    const isComplete = row.untrackedSalesCount === 0;
    const marginTone = marginColor(row.marginPct);
    return (
        <tr style={{ borderTop: "1px solid var(--stroke2)" }}>
            <td style={{ padding: "14px 12px 14px 16px", color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>{rank}</td>
            <td style={{ padding: "14px 12px", minWidth: 185 }}>
                <div style={{ color: "var(--text)", fontWeight: 850, fontSize: 13 }}>{row.platformName}</div>
                <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 3 }}>{row.salesCount} venta{row.salesCount === 1 ? "" : "s"}</div>
            </td>
            <td style={{ padding: "14px 12px", color: "var(--text)", fontWeight: 800, fontSize: 13, whiteSpace: "nowrap" }}>{formatCurrency(row.revenueTotal)}</td>
            <td style={{ padding: "14px 12px", color: isTracked ? "#fbbf24" : "var(--muted)", fontWeight: 850, fontSize: 13, whiteSpace: "nowrap" }}>
                {isTracked ? formatCurrency(row.costTotal) : "Pendiente"}
            </td>
            <td style={{ padding: "14px 12px", color: isTracked ? summaryTone(row.netProfit) : "var(--muted)", fontWeight: 950, fontSize: 13, whiteSpace: "nowrap" }}>
                {isTracked ? formatCurrency(row.netProfit) : "Pendiente"}
            </td>
            <td style={{ padding: "14px 12px", whiteSpace: "nowrap" }}>
                <span style={{
                    color: isTracked ? marginTone : "#fbbf24",
                    fontWeight: 950,
                    fontSize: 13,
                    background: isTracked ? `${marginTone}14` : "rgba(251,191,36,.12)",
                    border: `1px solid ${isTracked ? `${marginTone}45` : "rgba(251,191,36,.35)"}`,
                    padding: "4px 8px",
                    borderRadius: 999,
                }}>{isTracked ? formatPercent(row.marginPct) : "Sin costo"}</span>
            </td>
            <td style={{ padding: "14px 16px 14px 12px", minWidth: 130 }}>
                <Coverage row={row} />
                {!isComplete && <div style={{ color: "#fbbf24", fontSize: 10, marginTop: 5, lineHeight: 1.25 }}>
                    {row.untrackedSalesCount} venta{row.untrackedSalesCount === 1 ? "" : "s"} sin costo compatible
                </div>}
            </td>
        </tr>
    );
}

function MobileRow({ row, rank }) {
    const isTracked = row.trackedSalesCount > 0;
    const marginTone = marginColor(row.marginPct);
    return (
        <article style={{
            padding: 14,
            borderRadius: 13,
            background: "rgba(7,16,43,.30)",
            border: "1px solid var(--stroke2)",
            minWidth: 0,
        }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ color: "var(--text)", fontWeight: 900, fontSize: 14, lineHeight: 1.25 }}>{rank}. {row.platformName}</div>
                    <div style={{ marginTop: 3, color: "var(--muted)", fontSize: 11 }}>{row.salesCount} venta{row.salesCount === 1 ? "" : "s"} en el periodo</div>
                </div>
                <span style={{ color: isTracked ? marginTone : "#fbbf24", fontWeight: 950, fontSize: 13, whiteSpace: "nowrap" }}>
                    {isTracked ? formatPercent(row.marginPct) : "Sin costo"}
                </span>
            </div>
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 8,
                margin: "13px 0",
            }}>
                {[
                    ["Ingreso", formatCurrency(row.revenueTotal), "var(--text)"],
                    ["Costo", isTracked ? formatCurrency(row.costTotal) : "Pendiente", isTracked ? "#fbbf24" : "#fbbf24"],
                    ["Ganancia", isTracked ? formatCurrency(row.netProfit) : "Pendiente", isTracked ? summaryTone(row.netProfit) : "var(--muted)"],
                ].map(([label, value, color]) => (
                    <div key={label} style={{ minWidth: 0 }}>
                        <div style={{ color: "var(--muted)", fontSize: 9, fontWeight: 900, letterSpacing: ".45px", textTransform: "uppercase" }}>{label}</div>
                        <div style={{ color, fontWeight: 900, fontSize: 12, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
                    </div>
                ))}
            </div>
            <Coverage row={row} />
        </article>
    );
}

export default function PlatformProfitView({ data, isMobile, trackingStartLabel }) {
    const [search, setSearch] = useState("");
    const [sortBy, setSortBy] = useState("profit");
    const rows = useMemo(() => (Array.isArray(data?.platforms) ? data.platforms : []).map(normalizeRow), [data]);
    const totals = data?.totals || {};
    const filteredRows = useMemo(() => {
        const term = search.trim().toLocaleLowerCase("es-CO");
        const rowsToSort = term
            ? rows.filter((row) => row.platformName.toLocaleLowerCase("es-CO").includes(term))
            : rows;
        const compare = {
            profit: (a, b) => b.netProfit - a.netProfit || b.trackedRevenue - a.trackedRevenue,
            margin: (a, b) => b.marginPct - a.marginPct || b.netProfit - a.netProfit,
            revenue: (a, b) => b.revenueTotal - a.revenueTotal,
            cost: (a, b) => b.costTotal - a.costTotal,
        }[sortBy];
        return [...rowsToSort].sort(compare || (() => 0));
    }, [rows, search, sortBy]);

    const trackedRevenue = toNumber(totals.trackedRevenue);
    const netProfit = toNumber(totals.netProfit);
    const trackedSalesCount = toNumber(totals.trackedSalesCount);
    const salesCount = toNumber(totals.salesCount);
    const untrackedSalesCount = toNumber(totals.untrackedSalesCount);
    const strongestMargin = [...rows].filter((row) => row.trackedRevenue > 0).sort((a, b) => b.marginPct - a.marginPct)[0];
    const weakestMargin = [...rows].filter((row) => row.trackedRevenue > 0).sort((a, b) => a.marginPct - b.marginPct)[0];

    return (
        <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            style={{ display: "grid", gap: 14, minWidth: 0 }}
        >
            <div style={{
                padding: isMobile ? "16px 13px" : "19px 20px",
                borderRadius: 16,
                border: "1px solid rgba(34,211,238,.24)",
                background: "linear-gradient(135deg, rgba(14,33,68,.92), rgba(17,29,66,.86))",
                boxShadow: "0 14px 36px rgba(0,0,0,.14)",
            }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#22d3ee", fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".9px" }}>
                            <BarChart3 size={15} strokeWidth={2.5} /> Rentabilidad por plataforma
                        </div>
                        <h2 style={{ margin: "7px 0 0", color: "var(--text)", fontSize: isMobile ? 19 : 22, letterSpacing: 0 }}>
                            Dónde está la utilidad de cada producto
                        </h2>
                        <p style={{ margin: "6px 0 0", maxWidth: 720, color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>
                            Se cuentan las ventas desde {trackingStartLabel || "el inicio del control de costos"}. Los importes sin costo compatible se señalan como pendientes y no inflan la ganancia.
                        </p>
                    </div>
                    <span style={{
                        padding: "7px 10px",
                        borderRadius: 999,
                        background: "rgba(34,211,238,.10)",
                        border: "1px solid rgba(34,211,238,.22)",
                        color: "#67e8f9",
                        fontWeight: 900,
                        fontSize: 12,
                        whiteSpace: "nowrap",
                    }}>{data?.currency || "COP"}</span>
                </div>

                <div style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))",
                    gap: 10,
                    marginTop: 16,
                }}>
                    <Metric icon={ReceiptText} label="Ingresos" value={formatCurrency(totals.revenueTotal)} helper={`${salesCount} ventas`} color="#e2e8f0" />
                    <Metric icon={WalletCards} label="Costo registrado" value={formatCurrency(totals.costTotal)} helper={`${trackedSalesCount}/${salesCount} con costo`} color="#fbbf24" />
                    <Metric icon={TrendingUp} label="Ganancia neta" value={formatCurrency(netProfit)} helper={`Sobre ${formatCurrency(trackedRevenue)}`} color={summaryTone(netProfit)} />
                    <Metric icon={BarChart3} label="Margen neto" value={trackedRevenue > 0 ? formatPercent(totals.marginPct) : "Pendiente"} helper="Solo ventas con costo" color={trackedRevenue > 0 ? marginColor(totals.marginPct) : "#fbbf24"} />
                </div>
            </div>

            <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                gap: 10,
            }}>
                <div style={{ padding: "12px 14px", borderRadius: 12, border: `1px solid ${untrackedSalesCount ? "rgba(251,191,36,.30)" : "rgba(52,211,153,.25)"}`, background: untrackedSalesCount ? "rgba(245,158,11,.07)" : "rgba(16,185,129,.07)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, color: untrackedSalesCount ? "#fbbf24" : "#34d399", fontWeight: 900, fontSize: 12 }}><CircleAlert size={15} /> Control de costos</div>
                    <div style={{ marginTop: 5, color: "var(--text)", fontSize: 12, lineHeight: 1.4 }}>
                        {untrackedSalesCount
                            ? `${untrackedSalesCount} venta${untrackedSalesCount === 1 ? "" : "s"} necesita${untrackedSalesCount === 1 ? "" : "n"} costo o moneda compatible.`
                            : "Todas las ventas seleccionadas tienen un costo compatible."}
                    </div>
                </div>
                <div style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(52,211,153,.24)", background: "rgba(16,185,129,.07)" }}>
                    <div style={{ color: "#34d399", fontWeight: 900, fontSize: 11, textTransform: "uppercase", letterSpacing: ".55px" }}>Mejor margen</div>
                    <div style={{ marginTop: 5, color: "var(--text)", fontSize: 13, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{strongestMargin ? `${strongestMargin.platformName} · ${formatPercent(strongestMargin.marginPct)}` : "Sin ventas con costo"}</div>
                </div>
                <div style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(251,146,60,.25)", background: "rgba(251,146,60,.06)" }}>
                    <div style={{ color: "#fb923c", fontWeight: 900, fontSize: 11, textTransform: "uppercase", letterSpacing: ".55px" }}>Margen a revisar</div>
                    <div style={{ marginTop: 5, color: "var(--text)", fontSize: 13, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{weakestMargin ? `${weakestMargin.platformName} · ${formatPercent(weakestMargin.marginPct)}` : "Sin ventas con costo"}</div>
                </div>
            </div>

            <div style={{
                padding: isMobile ? 12 : 16,
                borderRadius: 16,
                border: "1px solid var(--stroke)",
                background: "var(--card)",
                minWidth: 0,
            }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                    <div>
                        <h3 style={{ margin: 0, color: "var(--text)", fontSize: 16 }}>Detalle por plataforma</h3>
                        <div style={{ marginTop: 3, color: "var(--muted)", fontSize: 11 }}>{filteredRows.length} plataforma{filteredRows.length === 1 ? "" : "s"} visible{filteredRows.length === 1 ? "" : "s"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
                        <label style={{
                            height: 36,
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            padding: "0 10px",
                            borderRadius: 10,
                            border: "1px solid var(--stroke2)",
                            background: "var(--bg0)",
                            minWidth: isMobile ? 0 : 220,
                            flex: isMobile ? "1 1 160px" : undefined,
                        }}>
                            <Search size={15} color="var(--muted)" />
                            <input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Buscar plataforma"
                                aria-label="Buscar plataforma"
                                style={{ width: "100%", minWidth: 0, border: 0, outline: 0, background: "transparent", color: "var(--text)", font: "inherit", fontSize: 12 }}
                            />
                        </label>
                        <select
                            value={sortBy}
                            onChange={(event) => setSortBy(event.target.value)}
                            aria-label="Ordenar plataformas"
                            style={{
                                height: 36,
                                padding: "0 28px 0 10px",
                                borderRadius: 10,
                                border: "1px solid var(--stroke2)",
                                background: "var(--bg0)",
                                color: "var(--text)",
                                fontFamily: "var(--font)",
                                fontSize: 12,
                                fontWeight: 750,
                                cursor: "pointer",
                                flex: isMobile ? "1 1 135px" : undefined,
                            }}
                        >
                            <option value="profit">Mayor ganancia</option>
                            <option value="margin">Mayor margen</option>
                            <option value="revenue">Mayor ingreso</option>
                            <option value="cost">Mayor costo</option>
                        </select>
                    </div>
                </div>

                {filteredRows.length === 0 ? (
                    <div style={{ padding: "42px 16px", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--stroke2)", borderRadius: 12, fontSize: 13 }}>
                        No hay plataformas con ventas y costos rastreables en los meses seleccionados.
                    </div>
                ) : isMobile ? (
                    <div style={{ display: "grid", gap: 9 }}>
                        {filteredRows.map((row, index) => <MobileRow key={row.platformId || row.platformName} row={row} rank={index + 1} />)}
                    </div>
                ) : (
                    <div style={{ overflowX: "auto", border: "1px solid var(--stroke2)", borderRadius: 12 }}>
                        <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ background: "rgba(7,16,43,.44)" }}>
                                    {["#", "Plataforma", "Ingreso", "Costo", "Ganancia", "Margen", "Cobertura"].map((label) => (
                                        <th key={label} style={{ padding: "11px 12px", color: "var(--muted)", fontSize: 10, fontWeight: 900, letterSpacing: ".6px", textTransform: "uppercase", textAlign: label === "#" ? "center" : "left", whiteSpace: "nowrap" }}>{label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.map((row, index) => <DesktopRow key={row.platformId || row.platformName} row={row} rank={index + 1} />)}
                            </tbody>
                        </table>
                    </div>
                )}
                <p style={{ margin: "12px 0 0", color: "var(--muted)", fontSize: 11, lineHeight: 1.45 }}>
                    Los ajustes manuales de ventas no se reparten entre plataformas, por eso no aparecen en este detalle.
                </p>
            </div>
        </motion.section>
    );
}
