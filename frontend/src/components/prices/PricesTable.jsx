import { motion } from "framer-motion";
import PriceRow from "./PriceRow";

const selStyle = {
    appearance: "none", height: 32, padding: "0 24px 0 10px",
    background: "var(--bg0)", color: "var(--text)",
    border: "1px solid var(--stroke2)", borderRadius: 8,
    fontSize: 12, fontWeight: 500, cursor: "pointer",
    fontFamily: "var(--font)", outline: "none", transition: "border-color 0.2s",
};

const inputStyle = {
    appearance: "none", height: 44, padding: "0 14px 0 40px",
    background: "var(--bg0)", color: "var(--text)",
    border: "1px solid var(--stroke)", borderRadius: 10,
    fontSize: 14, fontWeight: 700, outline: "none", width: "100%",
    fontFamily: "var(--font)", transition: "border-color 0.2s",
};

export default function PricesTable({ prices, loading, saving, page, limit, total, totalPages, q, setQ, onToggleAll, onSaveMulti, loadAll }) {
    const query = q.trim();
    const hasQuery = query.length > 0;
    const applySearch = () => loadAll(1, limit, query);
    const clearSearch = () => {
        setQ("");
        loadAll(1, limit, "");
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}
        >
            {/* Table header */}
            <div style={{ display: "grid", gap: 14, padding: "16px 20px", borderBottom: "1px solid var(--stroke)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 16 }}>📋</span>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Listado de Precios</h3>
                        <span style={{ background: "rgba(99,51,255,0.12)", border: "1px solid rgba(99,51,255,0.25)", color: "#8b5cf6", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 800 }}>
                            {total}
                        </span>
                    </div>
                    {hasQuery ? (
                        <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>
                            Filtro activo: <b style={{ color: "var(--accent)" }}>{query}</b>
                        </span>
                    ) : null}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ position: "relative", flex: "1 1 420px", minWidth: 260 }}>
                        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 15, opacity: 0.45, pointerEvents: "none" }}>🔎</span>
                        <input style={inputStyle} placeholder="Buscar por plataforma o duracion..."
                            value={q}
                            onChange={e => {
                                setQ(e.target.value);
                                if (e.target.value === "") {
                                    loadAll(1, limit, "");
                                }
                            }}
                            onKeyDown={e => {
                                if (e.key === "Enter") {
                                    applySearch();
                                }
                            }}
                            onFocus={e => e.target.style.borderColor = "#0da6f2"}
                            onBlur={e => e.target.style.borderColor = "var(--stroke)"}
                        />
                    </div>
                    <button
                        type="button"
                        className="btn"
                        disabled={loading}
                        onClick={applySearch}
                        style={{ width: "auto", minWidth: 120, height: 44, padding: "0 18px", borderRadius: 10 }}
                    >
                        Buscar
                    </button>
                    <button
                        type="button"
                        className="btn-ghost"
                        disabled={loading || !hasQuery}
                        onClick={clearSearch}
                        style={{ width: "auto", minWidth: 110, height: 44, padding: "0 16px", borderRadius: 10, opacity: hasQuery ? 1 : 0.45 }}
                    >
                        Limpiar
                    </button>
                </div>
            </div>

            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: "rgba(0,0,0,0.25)", textAlign: "left" }}>
                            {["Plataforma", "Duración", "🇨🇴 COP", "🇲🇽 MXN", "🇺🇸 USD", "Lite COP", "Renovable", "Activo", "Acciones"].map(h => (
                                <th key={h} style={{ padding: "12px 16px", fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.7px", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={9} style={{ padding: "60px 20px", textAlign: "center" }}>
                                <div style={{ width: 32, height: 32, border: "3px solid var(--stroke)", borderTopColor: "#0da6f2", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
                            </td></tr>
                        ) : prices.length === 0 ? (
                            <tr><td colSpan={9} style={{ padding: "60px 20px", textAlign: "center", color: "var(--muted)" }}>
                                <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                                No hay planes aún.
                            </td></tr>
                        ) : prices.map((r, idx) => (
                            <PriceRow
                                key={`${r.platform_id}-${r.duration_id}`}
                                r={r}
                                idx={idx}
                                saving={saving}
                                onToggleAll={() => onToggleAll(r)}
                                onSaveMulti={(pricesObj, isRenewable, liteConfig = {}) =>
                                    onSaveMulti({
                                        platform_id: r.platform_id,
                                        duration_id: r.duration_id,
                                        prices: pricesObj,
                                        is_renewable: isRenewable,
                                        ...liteConfig,
                                    })
                                }
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {!loading && prices.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderTop: "1px solid var(--stroke)", background: "rgba(0,0,0,0.15)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 12 }}>
                        <span>Filas:</span>
                        <div style={{ position: "relative" }}>
                            <select style={selStyle} value={limit} onChange={e => loadAll(1, Number(e.target.value), query)}>
                                {[5, 10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                            <span style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", fontSize: 8, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                        </div>
                        <span>· Mostrando {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} de {total}</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button className="btn-ghost" disabled={page <= 1 || loading} onClick={() => loadAll(page - 1, limit, query)}
                            style={{ width: "auto", padding: "6px 14px", fontSize: 13, borderRadius: 8, opacity: page <= 1 ? 0.35 : 1 }}>
                            ← Anterior
                        </button>
                        <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>
                            Página <b style={{ color: "var(--accent)" }}>{page}</b> de {totalPages || 1}
                        </span>
                        <button className="btn-ghost" disabled={page >= totalPages || loading} onClick={() => loadAll(page + 1, limit, query)}
                            style={{ width: "auto", padding: "6px 14px", fontSize: 13, borderRadius: 8, opacity: page >= totalPages ? 0.35 : 1 }}>
                            Siguiente →
                        </button>
                    </div>
                </div>
            )}
        </motion.div>
    );
}
