import { useEffect, useState } from "react";
import { formatDateOnlyDisplay } from "../../utils/datetime";

export default function AccountGroup({ group, getDaysLeft, renderDaysBadge, toggleAttended, navigate, allCollapsed, attendedFilter, savingIds }) {
    const [collapsed, setCollapsed] = useState(allCollapsed);

    useEffect(() => {
        setCollapsed(allCollapsed);
    }, [allCollapsed]);

    const [pwVisible, setPwVisible] = useState(false);
    const [copiedPw, setCopiedPw] = useState(false);

    const allAttended = group.rows.every(r => r.is_attended);
    const hasPassword = !!group.account_password;

    async function copyPassword(e) {
        e.stopPropagation();
        if (!group.account_password) return;
        try {
            await navigator.clipboard.writeText(group.account_password);
            setCopiedPw(true);
            window.setTimeout(() => setCopiedPw(false), 1400);
        } catch {
            setCopiedPw(false);
        }
    }

    return (
        <>
            {/* ── Fila de encabezado del grupo (cuenta) ── */}
            <tr
                style={{
                    background: "rgba(13,166,242,0.08)",
                    borderTop: "2px solid rgba(13,166,242,0.25)",
                    borderBottom: "1px solid rgba(13,166,242,0.15)",
                    cursor: "pointer",
                }}
                onClick={() => setCollapsed(c => !c)}
            >
                <td colSpan={7} style={{ padding: "10px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        {/* Toggle icon */}
                        <span style={{ fontSize: 13, color: "var(--accent)", transition: "transform 0.2s", display: "inline-block", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</span>

                        {/* Icono cuenta */}
                        <div style={{
                            width: 28, height: 28, borderRadius: 8,
                            background: "rgba(13,166,242,0.2)",
                            border: "1px solid rgba(13,166,242,0.4)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 13, flexShrink: 0
                        }}>🔑</div>

                        {/* Email o Identificador de la cuenta */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 800, fontSize: 13, color: "var(--text)", fontFamily: "monospace" }}>
                                {group.is_chatgpt
                                    ? (group.account_password || "ChatGPT Sin Clave")
                                    : (group.account_email || <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Sin cuenta asignada</span>)
                                }
                            </span>
                            {group.rows[0]?.platform_name && (
                                <span style={{
                                    background: "rgba(255,255,255,0.08)",
                                    color: "var(--accent)",
                                    padding: "2px 8px",
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    border: "1px solid rgba(13,166,242,0.2)"
                                }}>
                                    {group.rows[0].platform_name}
                                </span>
                            )}
                        </div>

                        {/* Contraseña (solo si no es ChatGPT, donde ya está como título) */}
                        {hasPassword && !group.is_chatgpt && (
                            <button
                                type="button"
                                onClick={copyPassword}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    background: copiedPw ? "rgba(16,185,129,0.12)" : "rgba(0,0,0,0.2)",
                                    borderRadius: 8,
                                    padding: "4px 10px",
                                    border: copiedPw ? "1px solid rgba(16,185,129,0.35)" : "1px solid var(--stroke)",
                                    cursor: "copy",
                                    color: "inherit"
                                }}
                                title="Clic para copiar la clave"
                            >
                                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>Clave:</span>
                                <span style={{ fontSize: 13, fontFamily: "monospace", color: pwVisible ? "#0da6f2" : "var(--muted)", fontWeight: 600, letterSpacing: pwVisible ? 1 : 0 }}>
                                    {pwVisible ? group.account_password : "••••••••"}
                                </span>
                                {copiedPw && (
                                    <span style={{ fontSize: 11, color: "#10b981", fontWeight: 800 }}>
                                        Copiada
                                    </span>
                                )}
                                <button
                                    onClick={e => { e.stopPropagation(); setPwVisible(v => !v); }}
                                    style={{
                                        background: "transparent", border: "none", cursor: "pointer",
                                        color: "var(--muted)", fontSize: 14, padding: "0 2px",
                                        lineHeight: 1, display: "flex", alignItems: "center"
                                    }}
                                    title={pwVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
                                >
                                    {pwVisible ? "🙈" : "👁️"}
                                </button>
                            </button>
                        )}

                        {/* Badge perfiles */}
                        <span style={{
                            background: "rgba(139,92,246,0.15)",
                            color: "#a78bfa",
                            border: "1px solid rgba(139,92,246,0.3)",
                            borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700
                        }}>
                            {group.rows.length} {group.rows.length === 1 ? "perfil" : "perfiles"}
                        </span>

                        {/* Badge estado general */}
                        {allAttended && (
                            <span style={{
                                background: "rgba(16,185,129,0.12)",
                                color: "#10b981",
                                border: "1px solid rgba(16,185,129,0.3)",
                                borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700
                            }}>✔ Todos atendidos</span>
                        )}
                    </div>
                </td>
            </tr>

            {/* ── Filas de perfiles de esta cuenta ── */}
            {!collapsed && group.rows.map((item, idx) => {
                const daysLeft = getDaysLeft(item);
                const isSaving = savingIds.includes(item.id);
                const isOutsideFilter =
                    attendedFilter === "0" ? !!item.is_attended :
                    attendedFilter === "1" ? !item.is_attended :
                    false;

                return (
                    <tr
                        key={item.id}
                        style={{
                            borderBottom: "1px solid var(--stroke2)",
                            background: isOutsideFilter
                                ? "rgba(16,185,129,0.06)"
                                : (idx % 2 === 0 ? "rgba(0,0,0,0.0)" : "rgba(255,255,255,0.012)"),
                            transition: "background 0.15s ease, opacity 0.15s ease",
                            opacity: isSaving ? 0.65 : 1,
                        }}
                        onMouseEnter={e => {
                            if (!isOutsideFilter) e.currentTarget.style.background = "rgba(13,166,242,0.04)";
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = isOutsideFilter
                                ? "rgba(16,185,129,0.06)"
                                : (idx % 2 === 0 ? "rgba(0,0,0,0)" : "rgba(255,255,255,0.012)");
                        }}
                    >
                        <td style={{ padding: "12px 16px 12px 40px", fontFamily: "monospace", fontSize: 12, color: "var(--muted)", fontWeight: 600 }} title={item.order_code || undefined}>
                            #{item.id} {item.is_attended ? "✔️" : ""}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--text)", fontWeight: 800 }}>
                                    {item.platform_name.charAt(0)}
                                </div>
                                <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{item.platform_name}</span>
                            </div>
                        </td>
                        <td style={{ padding: "12px 16px", color: "var(--text)", fontWeight: 500, fontSize: 12, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.user_email}>
                            {item.user_email}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                            {item.profile_number
                                ? <span style={{ background: "rgba(139,92,246,0.12)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>Perfil {item.profile_number}</span>
                                : <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>
                            }
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
                            {formatDateOnlyDisplay(item.expires_date || item.expires_at)}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                {renderDaysBadge(daysLeft)}
                                {isOutsideFilter && (
                                    <span style={{
                                        background: "rgba(16,185,129,0.12)",
                                        color: "#10b981",
                                        border: "1px solid rgba(16,185,129,0.28)",
                                        borderRadius: 20,
                                        padding: "2px 10px",
                                        fontSize: 11,
                                        fontWeight: 700
                                    }}>
                                        Actualizada
                                    </span>
                                )}
                            </div>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                            <button
                                className="btn-ghost"
                                style={{
                                    padding: "5px 10px", fontSize: 11, fontWeight: 700, borderRadius: 8,
                                    color: item.is_attended ? "#f59e0b" : "#10b981",
                                    background: item.is_attended ? "rgba(245,158,11,0.1)" : "rgba(16,185,129,0.1)",
                                    border: `1px solid ${item.is_attended ? "rgba(245,158,11,0.3)" : "rgba(16,185,129,0.3)"}`,
                                    marginRight: 6, cursor: isSaving ? "wait" : "pointer",
                                    opacity: isSaving ? 0.7 : 1
                                }}
                                disabled={isSaving}
                                onClick={() => toggleAttended(item.id, item.is_attended)}
                            >
                                {isSaving ? "Guardando..." : (item.is_attended ? "Desmarcar ⟲" : "Atendido ✓")}
                            </button>
                            <button
                                className="btn"
                                style={{
                                    padding: "6px 12px", fontSize: 11, fontWeight: 700, borderRadius: 8,
                                    background: "linear-gradient(135deg, #0da6f2 0%, #8b5cf6 100%)",
                                    border: "none", color: "#fff",
                                    boxShadow: "0 4px 14px rgba(13,166,242,0.3)", cursor: isSaving ? "not-allowed" : "pointer",
                                    opacity: isSaving ? 0.7 : 1
                                }}
                                disabled={isSaving}
                                onClick={() => navigate(`/admin/renewals`, { state: { orderId: item.id } })}
                            >
                                Renovar →
                            </button>
                        </td>
                    </tr>
                );
            })}
        </>
    );
}
// ─────────────────────────────────────────────────────────────────────────────
