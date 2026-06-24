import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatBogotaDate } from "../../utils/datetime.js";

function DetailStat({ label, value, mono = false, tone = "default" }) {
    const toneColor = tone === "accent" ? "#0da6f2" : tone === "success" ? "#10b981" : tone === "warning" ? "#f59e0b" : "var(--text)";
    return (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--stroke2)", borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>{label}</div>
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: toneColor, fontFamily: mono ? "monospace" : "inherit", wordBreak: "break-word" }}>
                {value || "—"}
            </div>
        </div>
    );
}

function MiniPill({ label, tone = "default" }) {
    const styles = tone === "accent"
        ? { color: "#0da6f2", background: "rgba(13,166,242,0.12)", border: "1px solid rgba(13,166,242,0.28)" }
        : tone === "warning"
            ? { color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.28)" }
            : { color: "var(--text)", background: "rgba(255,255,255,0.05)", border: "1px solid var(--stroke2)" };

    return (
        <span style={{ ...styles, display: "inline-flex", alignItems: "center", padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {label}
        </span>
    );
}

function InventoryTimelineItem({ entry }) {
    const titleColor = entry.type === "replacement_in" ? "#10b981" : entry.type === "replacement_out" ? "#f59e0b" : "#0da6f2";
    return (
        <div style={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "center" }}>
                <div style={{ width: 10, height: 10, borderRadius: 999, marginTop: 6, background: titleColor, boxShadow: `0 0 0 4px ${titleColor}22` }} />
            </div>
            <div style={{ paddingBottom: 12, borderBottom: "1px solid var(--stroke2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: titleColor }}>{entry.title}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{formatBogotaDate(entry.created_at)}</div>
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: "var(--text)", fontWeight: 600 }}>{entry.subtitle || "—"}</div>
                {!!entry.meta && <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)" }}>{entry.meta}</div>}
                {!!entry.expires_at && <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)" }}>Expira: {formatBogotaDate(entry.expires_at)}</div>}
                {!!entry.admin_email && <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)" }}>Admin: {entry.admin_email}</div>}
            </div>
        </div>
    );
}

export default function InventoryRow({ it, detail, detailLoading, detailError, idx, saving, onOpenDetail, onUpdate, onEdit, onSell, onSupport }) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (show) onOpenDetail?.();
    }, [show, onOpenDetail]);

    let badgeBg, badgeColor, badgeText;
    if (it.is_replacement) {
        badgeBg = "rgba(245,158,11,0.16)";
        badgeColor = "#f59e0b";
        badgeText = "Cuenta reemplazada";
    } else {
        switch (it.status) {
            case "available":
                badgeBg = "rgba(16,185,129,0.15)"; badgeColor = "#10b981"; badgeText = "Disponible"; break;
            case "assigned":
                badgeBg = "rgba(13,166,242,0.15)"; badgeColor = "#0da6f2"; badgeText = "Asignada"; break;
            case "sold":
                badgeBg = "rgba(139,92,246,0.15)"; badgeColor = "#8b5cf6"; badgeText = "Vendida"; break;
            case "inactive":
                badgeBg = "rgba(107,114,128,0.15)"; badgeColor = "#9ca3af"; badgeText = "Inactiva"; break;
            case "down":
                badgeBg = "rgba(239,68,68,0.15)"; badgeColor = "#ef4444"; badgeText = "Caída"; break;
            default:
                badgeBg = "rgba(255,255,255,0.05)"; badgeColor = "var(--muted)"; badgeText = String(it.status); break;
        }
    }

    const rowBtnStyle = { padding: "4px 10px", fontSize: 11, height: "auto", borderRadius: 6, minWidth: 0, whiteSpace: "nowrap" };

    return (
        <>
            <motion.tr
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.02 }}
                style={{ borderBottom: "1px solid var(--stroke2)", background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(13,166,242,0.05)"}
                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)"}
            >
                <td style={{ padding: "14px 16px", fontFamily: "monospace", fontSize: 12, color: "var(--muted)" }}>#{it.id}</td>
                <td style={{ padding: "14px 16px", fontWeight: 600 }}>{it.platform_name}</td>
                <td style={{ padding: "14px 16px", fontWeight: 500 }}>{it.email}</td>
                <td style={{ padding: "14px 16px" }}>
                    <span style={{ background: badgeBg, color: badgeColor, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, border: `1px solid ${badgeColor}40`, display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>
                        {badgeText}
                    </span>
                </td>
                <td style={{ padding: "14px 16px", fontFamily: "monospace", fontSize: 12, color: "var(--text)" }}>
                    {it.sale_id ? `#${it.sale_id}` : ""}
                </td>
                <td style={{ padding: "14px 16px", color: "var(--muted)", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.assigned_user_email}>
                    {it.assigned_user_email || "—"}
                </td>
                <td style={{ padding: "14px 16px", fontSize: 12, color: "var(--muted)" }}>
                    {formatBogotaDate(it.display_expires_at || it.expires_at)}
                </td>
                <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 220 }}>
                        <button className="btn-ghost" disabled={saving} onClick={onSell} style={{ ...rowBtnStyle, background: "#10b981", color: "white", border: "none", fontWeight: 700 }}>💰 Vender</button>
                        <button className="btn-ghost" disabled={saving || !it.sale_id} onClick={onSupport} style={{ ...rowBtnStyle, background: "rgba(13,166,242,0.14)", color: "#0da6f2", border: "1px solid rgba(13,166,242,0.35)", fontWeight: 700 }} title={it.sale_id ? "Generar soporte" : "Sin venta activa"}>
                            Soporte
                        </button>
                        <button className="btn-ghost" disabled={saving} onClick={() => setShow((s) => !s)} style={{ ...rowBtnStyle, border: show ? "1px solid #10b981" : "1px solid var(--stroke)", color: show ? "#10b981" : "var(--text)", background: show ? "rgba(16,185,129,0.1)" : "var(--input-bg)" }}>
                            {show ? "Ocultar" : "Credenciales"}
                        </button>
                        <button className="btn-ghost" disabled={saving} onClick={onEdit} style={{ ...rowBtnStyle, background: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.35)", fontWeight: 700 }}>
                            Editar
                        </button>
                        <button className="btn-ghost" disabled={saving} onClick={() => onUpdate({ status: "available" })} style={{ ...rowBtnStyle, background: "var(--input-bg)" }} title="Marcar disponible">🟢</button>
                        <button className="btn-ghost" disabled={saving} onClick={() => onUpdate({ status: "inactive" })} style={{ ...rowBtnStyle, background: "var(--input-bg)" }} title="Marcar inactiva">⚪</button>
                        <button className="btn-ghost" disabled={saving} onClick={() => onUpdate({ status: "down" })} style={{ ...rowBtnStyle, background: "var(--input-bg)" }} title="Marcar caída">🔴</button>
                        <button className="btn-ghost" disabled={saving} onClick={() => onUpdate({ reset_assign: true })} style={{ ...rowBtnStyle, background: "var(--input-bg)" }} title="Reset asignación">🔄</button>
                    </div>
                </td>
            </motion.tr>
            <AnimatePresence>
                {show && (
                    <motion.tr initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                        <td colSpan={8} style={{ padding: 0 }}>
                            <div style={{ padding: "18px 20px 0", background: "linear-gradient(180deg, rgba(13,166,242,0.07), rgba(13,166,242,0.03))" }}>
                                <div style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.025))", border: "1px solid var(--stroke2)", borderRadius: 20, overflow: "hidden" }}>
                                    <div style={{ padding: "18px 18px 16px", borderBottom: "1px solid var(--stroke2)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                                        <div>
                                            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 800 }}>Tarjeta de cuenta</div>
                                            <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900, color: "var(--text)" }}>#{it.id} · {it.platform_name}</div>
                                            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                                <MiniPill label={`Venta ${it.sale_id ? `#${it.sale_id}` : "sin ID"}`} tone="accent" />
                                                <MiniPill label={`Expira ${formatBogotaDate(it.display_expires_at || it.expires_at)}`} tone="warning" />
                                                <MiniPill label={it.assigned_user_email || "Sin asignar"} />
                                            </div>
                                        </div>
                                        <span style={{ background: badgeBg, color: badgeColor, padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800, border: `1px solid ${badgeColor}40`, whiteSpace: "nowrap" }}>
                                            {badgeText}
                                        </span>
                                    </div>

                                    <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700, marginBottom: 14 }}>Datos de la cuenta</div>
                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 10 }}>
                                                <DetailStat label="Correo" value={it.email} />
                                                <DetailStat label="Contraseña" value={it.password} mono />
                                                <DetailStat label="Pin" value={it.pin} mono />
                                                <DetailStat label="Perfil" value={it.profile_number ?? "—"} />
                                                <DetailStat label="Costo unitario" value={Number(it.unit_cost || 0) > 0 ? `$${Number(it.unit_cost).toLocaleString("es-CO", { maximumFractionDigits: 2 })} COP` : "Sin costo"} tone="warning" />
                                                <DetailStat label="ID venta" value={it.sale_id ? `#${it.sale_id}` : "—"} mono tone="accent" />
                                                <DetailStat label="Asignada a" value={it.assigned_user_email || "—"} />
                                                <DetailStat label="Expiración" value={formatBogotaDate(it.display_expires_at || it.expires_at)} tone="warning" />
                                                <DetailStat label="Orden actual" value={detail?.account?.current_order_code || (detail?.account?.current_order_id ? `#${detail.account.current_order_id}` : "—")} />
                                                <DetailStat label="Creada" value={formatBogotaDate(detail?.account?.created_at || it.created_at)} />
                                                <DetailStat label="Actualizada" value={formatBogotaDate(detail?.account?.updated_at || it.updated_at)} />
                                                <DetailStat label="Asignada desde" value={formatBogotaDate(detail?.account?.assigned_at || it.assigned_at)} />
                                                <DetailStat label="Estado técnico" value={detail?.account?.status || it.status || "—"} />
                                            </div>

                                            {(it.is_replacement || it.replaced_from_account_id || it.replaced_from_account_email) && (
                                                <div style={{ marginTop: 14, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.22)", borderRadius: 14, padding: "12px 14px" }}>
                                                    <div style={{ fontSize: 11, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 800 }}>Origen del reemplazo</div>
                                                    <div style={{ marginTop: 6, fontSize: 14, color: "var(--text)", fontWeight: 700 }}>
                                                        {it.replaced_from_account_id ? `Cuenta #${it.replaced_from_account_id}` : "Cuenta anterior"}
                                                    </div>
                                                    <div style={{ marginTop: 4, fontSize: 13, color: "var(--muted)", wordBreak: "break-word" }}>
                                                        {it.replaced_from_account_email || "Sin correo anterior registrado"}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700, marginBottom: 14 }}>Historial y trazabilidad</div>
                                            {detailLoading ? (
                                                <div style={{ padding: "24px 0", textAlign: "center", color: "var(--muted)" }}>Cargando historial...</div>
                                            ) : detailError ? (
                                                <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 14, padding: "14px 16px" }}>
                                                    {detailError}
                                                </div>
                                            ) : (
                                                <>
                                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
                                                        <DetailStat label="Última orden" value={detail?.lastSubscription?.order_code || (detail?.lastSubscription?.order_id ? `#${detail.lastSubscription.order_id}` : "—")} tone="accent" />
                                                        <DetailStat label="Último comprador" value={detail?.lastSubscription?.buyer_email || detail?.lastSubscription?.buyer_name || "—"} />
                                                        <DetailStat label="Suscripciones" value={detail?.subscriptions?.length ? String(detail.subscriptions.length) : "0"} />
                                                        <DetailStat label="Reemplazos" value={detail?.replacements?.length ? String(detail.replacements.length) : "0"} />
                                                    </div>

                                                    {!!detail?.replacements?.[0] && (
                                                        <div style={{ marginBottom: 16, background: "rgba(13,166,242,0.08)", border: "1px solid rgba(13,166,242,0.22)", borderRadius: 14, padding: "12px 14px" }}>
                                                            <div style={{ fontSize: 11, color: "#0da6f2", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 800 }}>Último reemplazo</div>
                                                            <div style={{ marginTop: 6, fontSize: 14, color: "var(--text)", fontWeight: 700 }}>
                                                                {detail.replacements[0].direction === "incoming" ? "Esta cuenta entró como reemplazo" : "Esta cuenta fue reemplazada por otra"}
                                                            </div>
                                                            <div style={{ marginTop: 4, fontSize: 13, color: "var(--muted)", wordBreak: "break-word" }}>
                                                                {detail.replacements[0].direction === "incoming"
                                                                    ? `${detail.replacements[0].old_account_id ? `Cuenta #${detail.replacements[0].old_account_id}` : "Cuenta anterior"}${detail.replacements[0].old_account_email ? ` · ${detail.replacements[0].old_account_email}` : ""}`
                                                                    : `${detail.replacements[0].new_account_id ? `Cuenta #${detail.replacements[0].new_account_id}` : "Cuenta nueva"}${detail.replacements[0].new_account_email ? ` · ${detail.replacements[0].new_account_email}` : ""}`}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
                                                        {(detail?.timeline?.length ? detail.timeline : [{
                                                            type: "empty",
                                                            created_at: null,
                                                            title: "Sin historial registrado",
                                                            subtitle: "Esta cuenta no tiene movimientos auditados todavía.",
                                                            meta: "",
                                                        }]).map((entry, index) => (
                                                            <InventoryTimelineItem key={`${entry.type}-${entry.created_at || index}-${index}`} entry={entry} />
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: "none" }}>
                                <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                                    <span style={{ textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>Email</span>
                                    <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 13, background: "var(--bg0)", padding: "4px 8px", borderRadius: 6, userSelect: "all" }}>{it.email}</span>
                                </div>
                                <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                                    <span style={{ textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>Contraseña</span>
                                    <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 13, background: "var(--bg0)", padding: "4px 8px", borderRadius: 6, userSelect: "all", fontFamily: "monospace" }}>{it.password || "—"}</span>
                                </div>
                                <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                                    <span style={{ textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>Perfil / Pantalla</span>
                                    <span style={{ color: "var(--text)", fontWeight: 800, fontSize: 13, background: "var(--bg0)", padding: "4px 12px", borderRadius: 6, textAlign: "center" }}>{it.profile_number ?? "—"}</span>
                                </div>
                                <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                                    <span style={{ textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>Pin Control</span>
                                    <span style={{ color: "var(--text)", fontWeight: 800, fontSize: 13, background: "var(--bg0)", padding: "4px 12px", borderRadius: 6, textAlign: "center", fontFamily: "monospace" }}>{it.pin ?? "—"}</span>
                                </div>
                                {it.is_replacement && (
                                    <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                                        <span style={{ textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>Viene de reemplazo</span>
                                        <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 13, background: "var(--bg0)", padding: "4px 8px", borderRadius: 6 }}>
                                            {it.replaced_from_account_id ? `Cuenta #${it.replaced_from_account_id}` : "Cuenta anterior"}
                                            {it.replaced_from_account_email ? ` · ${it.replaced_from_account_email}` : ""}
                                        </span>
                                    </div>
                                )}
                                {it.access_url && (
                                    <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                                        <span style={{ textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>URL Acceso</span>
                                        <div
                                            title={it.access_url}
                                            style={{
                                                color: "var(--text)",
                                                fontWeight: 600,
                                                fontSize: 13,
                                                background: "var(--bg0)",
                                                padding: "8px 10px",
                                                borderRadius: 8,
                                                border: "1px solid var(--stroke2)",
                                                userSelect: "all",
                                                overflowWrap: "anywhere",
                                                wordBreak: "break-all",
                                                lineHeight: 1.45,
                                            }}
                                        >
                                            {it.access_url}
                                        </div>
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                            <a
                                                href={it.access_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                style={{
                                                    color: "var(--accent)",
                                                    fontWeight: 700,
                                                    fontSize: 13,
                                                    background: "rgba(13,166,242,0.12)",
                                                    border: "1px solid rgba(13,166,242,0.25)",
                                                    padding: "6px 10px",
                                                    borderRadius: 8,
                                                    textDecoration: "none",
                                                }}
                                            >
                                                Abrir enlace 🔗
                                            </a>
                                            <button
                                                type="button"
                                                onClick={() => navigator.clipboard.writeText(it.access_url)}
                                                style={{
                                                    color: "var(--text)",
                                                    fontWeight: 700,
                                                    fontSize: 13,
                                                    background: "var(--bg0)",
                                                    border: "1px solid var(--stroke2)",
                                                    padding: "6px 10px",
                                                    borderRadius: 8,
                                                    cursor: "pointer",
                                                }}
                                            >
                                                Copiar link
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div style={{ display: "none" }}>
                                <div style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025))", border: "1px solid var(--stroke2)", borderRadius: 18, padding: 18 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap" }}>
                                        <div>
                                            <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Tarjeta de cuenta</div>
                                            <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900, color: "var(--text)" }}>#{it.id} · {it.platform_name}</div>
                                        </div>
                                        <span style={{ background: badgeBg, color: badgeColor, padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 800, border: `1px solid ${badgeColor}40` }}>{badgeText}</span>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                                        <DetailStat label="Correo" value={it.email} />
                                        <DetailStat label="Contraseña" value={it.password} mono />
                                        <DetailStat label="Pin" value={it.pin} mono />
                                        <DetailStat label="Perfil" value={it.profile_number ?? "—"} />
                                        <DetailStat label="Costo unitario" value={Number(it.unit_cost || 0) > 0 ? `$${Number(it.unit_cost).toLocaleString("es-CO", { maximumFractionDigits: 2 })} COP` : "Sin costo"} tone="warning" />
                                        <DetailStat label="ID venta" value={it.sale_id ? `#${it.sale_id}` : "—"} mono tone="accent" />
                                        <DetailStat label="Asignada a" value={it.assigned_user_email || "—"} />
                                        <DetailStat label="Expiración" value={formatBogotaDate(it.display_expires_at || it.expires_at)} tone="warning" />
                                        <DetailStat label="Creada" value={formatBogotaDate(detail?.account?.created_at || it.created_at)} />
                                        <DetailStat label="Actualizada" value={formatBogotaDate(detail?.account?.updated_at || it.updated_at)} />
                                    </div>
                                </div>
                                <div style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025))", border: "1px solid var(--stroke2)", borderRadius: 18, padding: 18 }}>
                                    <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700, marginBottom: 14 }}>Historial y trazabilidad</div>
                                    {detailLoading ? (
                                        <div style={{ padding: "24px 0", textAlign: "center", color: "var(--muted)" }}>Cargando historial...</div>
                                    ) : detailError ? (
                                        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 14, padding: "14px 16px" }}>
                                            {detailError}
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
                                                <DetailStat label="Última orden" value={detail?.lastSubscription?.order_code || (detail?.lastSubscription?.order_id ? `#${detail.lastSubscription.order_id}` : "—")} tone="accent" />
                                                <DetailStat label="Último comprador" value={detail?.lastSubscription?.buyer_email || detail?.lastSubscription?.buyer_name || "—"} />
                                                <DetailStat label="Suscripciones" value={detail?.subscriptions?.length ? String(detail.subscriptions.length) : "0"} />
                                                <DetailStat label="Reemplazos" value={detail?.replacements?.length ? String(detail.replacements.length) : "0"} />
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                                {(detail?.timeline?.length ? detail.timeline : [{
                                                    type: "empty",
                                                    created_at: null,
                                                    title: "Sin historial registrado",
                                                    subtitle: "Esta cuenta no tiene movimientos auditados todavía.",
                                                    meta: "",
                                                }]).map((entry, index) => (
                                                    <InventoryTimelineItem key={`${entry.type}-${entry.created_at || index}-${index}`} entry={entry} />
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </td>
                    </motion.tr>
                )}
            </AnimatePresence>
        </>
    );
}
