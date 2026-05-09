import { motion } from "framer-motion";
import { useState } from "react";
import { getPlatformLogo, getInitials } from "../../utils/platform.js";
import { displayCurrency } from "../../utils/currency.js";

const MotionArticle = motion.article;
const MotionButton = motion.button;

function formatDuration(item) {
    const raw = String(item?.durationName || "").trim();
    const lower = raw.toLowerCase();
    if (lower.includes("30") && (lower.includes("dia") || lower.includes("día"))) return "1 mes";
    if (raw && !lower.includes("por defecto")) return raw;

    const days = Number(item?.days || 0);
    if (days >= 28 && days <= 31) return "1 mes";
    if (days > 31 && days % 30 === 0) return `${Math.round(days / 30)} meses`;
    if (days > 0) return `${days} dias`;
    return "Duracion incluida";
}

function getComboDuration(combo) {
    const values = [...new Set((combo.items || []).map((item) => formatDuration(item)).filter(Boolean))];
    if (!values.length) return "";
    return values.length === 1 ? values[0] : "Varias duraciones";
}

function ComboPlatformLogo({ item }) {
    const logoSrc = getPlatformLogo(item.platformSlug, item.platformName);
    const [failed, setFailed] = useState(!logoSrc);

    return failed ? (
        <span style={{ color: "#fff", fontSize: 10, fontWeight: 900 }}>{getInitials(item.platformName)}</span>
    ) : (
        <img
            src={logoSrc}
            alt={item.platformName}
            onError={() => setFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "contain", padding: 5 }}
        />
    );
}

export default function ComboGrid({ combos, onAddCombo, cartCountByComboId }) {
    if (!Array.isArray(combos) || !combos.length) return null;

    return (
        <section style={{ margin: "8px 0 18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "var(--text)" }}>Combos disponibles</h2>
                    <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: 12 }}>
                        Paquetes con cuentas independientes y entrega en una sola compra.
                    </p>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(238px, 1fr))", gap: 12 }}>
                {combos.map((combo, index) => {
                    const stock = Number(combo.stock || 0);
                    const inCartCount = cartCountByComboId?.get(combo.id) || 0;
                    const outOfStock = stock <= 0;
                    const stockReached = !outOfStock && inCartCount >= stock;
                    const savings = Number(combo.savings || 0);
                    const compareAt = Number(combo.compare_at_price || combo.regular_total || 0);
                    const duration = getComboDuration(combo);

                    return (
                        <MotionArticle
                            key={combo.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(index * 0.04, 0.4) }}
                            whileHover={!outOfStock ? { y: -4, boxShadow: "0 18px 44px rgba(16,185,129,.18), 0 0 0 1px rgba(16,185,129,.22)" } : undefined}
                            style={{
                                background: "var(--card)",
                                border: "1px solid var(--stroke)",
                                borderRadius: 12,
                                padding: 12,
                                opacity: outOfStock ? 0.55 : 1,
                                display: "flex",
                                flexDirection: "column",
                                gap: 9,
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
                                        <span style={{ color: "#10b981", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 }}>
                                            {combo.badge || "Combo"}
                                        </span>
                                        {savings > 0 ? (
                                            <span style={{ fontSize: 10, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.25)", borderRadius: 999, padding: "2px 7px" }}>
                                                Ahorras {Number(savings).toLocaleString("es-CO")}
                                            </span>
                                        ) : null}
                                    </div>
                                    <div style={{ fontSize: 15, fontWeight: 900, color: "var(--text)", lineHeight: 1.18 }}>{combo.name}</div>
                                    {duration ? (
                                        <div style={{ color: "#b8c4da", fontSize: 12, fontWeight: 800, marginTop: 3 }}>{duration}</div>
                                    ) : null}
                                    {combo.description ? (
                                        <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 2, lineHeight: 1.25 }}>{combo.description}</div>
                                    ) : null}
                                </div>
                                <span style={{ color: outOfStock ? "#ef4444" : "#10b981", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>
                                    {outOfStock ? "Sin stock" : `Stock: ${Math.max(stock - inCartCount, 0)}`}
                                </span>
                            </div>

                            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                                {(combo.items || []).map((item, itemIndex) => {
                                    return (
                                        <div
                                            key={`${item.platformId}-${item.durationId}-${itemIndex}`}
                                            title={`${item.platformName} - ${item.durationName}`}
                                            style={{
                                                width: 36,
                                                height: 36,
                                                borderRadius: 9,
                                                background: "#050505",
                                                border: "1px solid rgba(255,255,255,.1)",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                overflow: "hidden",
                                            }}
                                        >
                                            <ComboPlatformLogo item={item} />
                                        </div>
                                    );
                                })}
                            </div>

                            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginTop: "auto" }}>
                                <div>
                                    {compareAt > Number(combo.price || 0) ? (
                                        <div style={{ color: "var(--muted)", textDecoration: "line-through", fontSize: 11 }}>
                                            {compareAt.toLocaleString("es-CO")} {displayCurrency(combo.currency, "COP")}
                                        </div>
                                    ) : null}
                                    <div style={{ color: "var(--text)", fontSize: 20, fontWeight: 950, lineHeight: 1 }}>
                                        {Number(combo.price || 0).toLocaleString("es-CO")}
                                        <span style={{ color: "var(--muted)", fontSize: 11, marginLeft: 5 }}>{displayCurrency(combo.currency, "COP")}</span>
                                    </div>
                                </div>

                                <MotionButton
                                    className="btn"
                                    disabled={outOfStock || stockReached}
                                    onClick={() => onAddCombo(combo)}
                                    whileHover={outOfStock || stockReached ? undefined : { scale: 1.04 }}
                                    whileTap={outOfStock || stockReached ? undefined : { scale: 0.96 }}
                                    style={{ minHeight: 34, width: "auto", padding: "0 12px", whiteSpace: "nowrap", fontSize: 13, borderRadius: 10 }}
                                >
                                    {stockReached ? "Limite" : "Agregar"}
                                </MotionButton>
                            </div>
                        </MotionArticle>
                    );
                })}
            </div>
        </section>
    );
}
