import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

const fmtCOP = (n) => new Intl.NumberFormat("es-CO").format(Number(n || 0));
const fmtPlain = (n) => { const v = Number(n); return Number.isFinite(v) && v > 0 ? String(v) : "—"; };

const numInput = {
    height: 34, padding: "0 10px", width: 100,
    background: "var(--bg0)", color: "var(--text)",
    border: "1px solid #0da6f2", borderRadius: 8,
    fontSize: 13, fontWeight: 600, outline: "none",
    fontFamily: "var(--font)", boxShadow: "0 0 0 2px rgba(13,166,242,0.15)"
};

export default function PriceRow({ r, idx, saving, onToggleAll, onSaveMulti }) {
    const [editing, setEditing] = useState(false);
    const [cop, setCop] = useState(r.price_cop ?? "");
    const [mxn, setMxn] = useState(r.price_mxn ?? "");
    const [usd, setUsd] = useState(r.price_usd ?? "");
    const [isRenewable, setIsRenewable] = useState(!!r.is_renewable);

    useEffect(() => {
        setCop(r.price_cop ?? ""); setMxn(r.price_mxn ?? ""); setUsd(r.price_usd ?? "");
        setIsRenewable(!!r.is_renewable);
    }, [r.price_cop, r.price_mxn, r.price_usd, r.is_renewable]);

    const anyActive = useMemo(() => Boolean(r.active_cop || r.active_mxn || r.active_usd), [r.active_cop, r.active_mxn, r.active_usd]);

    const reset = () => { setCop(r.price_cop ?? ""); setMxn(r.price_mxn ?? ""); setUsd(r.price_usd ?? ""); setIsRenewable(!!r.is_renewable); setEditing(false); };

    const onSave = async () => {
        const payload = {};
        if (cop !== "" && Number.isFinite(Number(cop))) payload.COP = Number(cop);
        if (mxn !== "" && Number.isFinite(Number(mxn))) payload.MXN = Number(mxn);
        if (usd !== "" && Number.isFinite(Number(usd))) payload.USD = Number(usd);
        if (!Object.keys(payload).length) { reset(); return; }
        await onSaveMulti(payload, isRenewable);
        setEditing(false);
    };

    const base = idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)";
    const hoverBg = "rgba(13,166,242,0.05)";

    return (
        <motion.tr
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(idx * 0.02, 0.3) }}
            style={{ borderBottom: "1px solid var(--stroke2)", background: base }}
            onMouseEnter={e => { if (!editing) e.currentTarget.style.background = hoverBg; }}
            onMouseLeave={e => e.currentTarget.style.background = editing ? "rgba(13,166,242,0.04)" : base}
        >
            {/* Plataforma */}
            <td style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <img src={`/platform-logos/${r.platform_slug}.png`} alt={r.platform_name}
                        style={{ width: 26, height: 26, borderRadius: 6, objectFit: "cover", background: "rgba(255,255,255,0.05)", border: "1px solid var(--stroke2)", flexShrink: 0 }}
                        onError={e => e.target.style.display = "none"}
                    />
                    <span style={{ fontWeight: 700, color: "var(--text)", fontSize: 13 }}>{r.platform_name}</span>
                </div>
            </td>

            {/* Duración */}
            <td style={{ padding: "12px 16px", color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap" }}>
                {r.duration_name} <span style={{ opacity: 0.5 }}>({r.days}d)</span>
            </td>

            {/* COP */}
            <td style={{ padding: "12px 16px", fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                {editing ? <input style={numInput} type="number" value={cop} onChange={e => setCop(e.target.value)} /> : fmtCOP(r.price_cop || 0)}
            </td>

            {/* MXN */}
            <td style={{ padding: "12px 16px", color: "var(--muted)" }}>
                {editing ? <input style={numInput} type="number" value={mxn} onChange={e => setMxn(e.target.value)} /> : fmtPlain(r.price_mxn)}
            </td>

            {/* USD */}
            <td style={{ padding: "12px 16px", color: "var(--muted)" }}>
                {editing ? <input style={numInput} type="number" value={usd} onChange={e => setUsd(e.target.value)} /> : fmtPlain(r.price_usd)}
            </td>

            {/* Renovable */}
            <td style={{ padding: "12px 16px" }}>
                {editing ? (
                    <input type="checkbox" checked={isRenewable} onChange={e => setIsRenewable(e.target.checked)}
                        style={{ width: 16, height: 16, cursor: "pointer" }} />
                ) : r.is_renewable ? (
                    <span style={{ background: "rgba(13,166,242,0.1)", color: "#0da6f2", border: "1px solid rgba(13,166,242,0.3)", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, boxShadow: "0 0 6px rgba(13,166,242,0.2)" }}>Sí</span>
                ) : (
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>No</span>
                )}
            </td>

            {/* Activo */}
            <td style={{ padding: "12px 16px" }}>
                {anyActive ? (
                    <span style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, boxShadow: "0 0 6px rgba(16,185,129,0.2)" }}>● Sí</span>
                ) : (
                    <span style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800 }}>○ No</span>
                )}
            </td>

            {/* Acciones */}
            <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                {!editing ? (
                    <div style={{ display: "flex", gap: 6 }}>
                        <button disabled={saving} onClick={() => setEditing(true)}
                            style={{ background: "rgba(13,166,242,0.08)", color: "#0da6f2", border: "1px solid rgba(13,166,242,0.25)", borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font)" }}>
                            Editar
                        </button>
                        <button disabled={saving} onClick={onToggleAll}
                            style={{ background: anyActive ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)", color: anyActive ? "#ef4444" : "#10b981", border: `1px solid ${anyActive ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}`, borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font)" }}>
                            {anyActive ? "Desactivar" : "Activar"}
                        </button>
                    </div>
                ) : (
                    <div style={{ display: "flex", gap: 6 }}>
                        <button disabled={saving} onClick={onSave}
                            style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font)" }}>
                            💾 Guardar
                        </button>
                        <button disabled={saving} onClick={reset}
                            style={{ background: "rgba(255,255,255,0.05)", color: "var(--muted)", border: "1px solid var(--stroke)", borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font)" }}>
                            Cancelar
                        </button>
                    </div>
                )}
            </td>
        </motion.tr>
    );
}
