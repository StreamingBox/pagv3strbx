import { useEffect, useMemo, useState } from "react";

const fmtCOP = (n) => new Intl.NumberFormat("es-CO").format(Number(n || 0));
const fmtPlain = (n) => {
    const v = Number(n);
    return Number.isFinite(v) ? String(v) : "-";
};

export default function PriceRow({ r, saving, onToggleAll, onSaveMulti }) {
    const [editing, setEditing] = useState(false);

    const [cop, setCop] = useState(r.price_cop ?? "");
    const [mxn, setMxn] = useState(r.price_mxn ?? "");
    const [usd, setUsd] = useState(r.price_usd ?? "");
    const [isRenewable, setIsRenewable] = useState(!!r.is_renewable);

    useEffect(() => {
        setCop(r.price_cop ?? "");
        setMxn(r.price_mxn ?? "");
        setUsd(r.price_usd ?? "");
        setIsRenewable(!!r.is_renewable);
    }, [r.price_cop, r.price_mxn, r.price_usd, r.is_renewable]);

    const anyActive = useMemo(
        () => Boolean(r.active_cop || r.active_mxn || r.active_usd),
        [r.active_cop, r.active_mxn, r.active_usd]
    );

    const reset = () => {
        setCop(r.price_cop ?? "");
        setMxn(r.price_mxn ?? "");
        setUsd(r.price_usd ?? "");
        setIsRenewable(!!r.is_renewable);
        setEditing(false);
    };

    const onSave = async () => {
        const payload = {};
        if (cop !== "" && Number.isFinite(Number(cop))) payload.COP = Number(cop);
        if (mxn !== "" && Number.isFinite(Number(mxn))) payload.MXN = Number(mxn);
        if (usd !== "" && Number.isFinite(Number(usd))) payload.USD = Number(usd);

        // evita guardar vacío
        if (!Object.keys(payload).length) {
            reset();
            return;
        }

        await onSaveMulti(payload, isRenewable);
        setEditing(false);
    };

    return (
        <tr style={{ borderTop: "1px solid rgba(46,123,255,.12)" }}>
            <td style={{ padding: "10px 8px" }}>{r.platform_name}</td>

            <td style={{ padding: "10px 8px" }}>
                {r.duration_name} ({r.days}d)
            </td>

            <td style={{ padding: "10px 8px" }}>
                {editing ? (
                    <input
                        className="input"
                        style={{ maxWidth: 120 }}
                        type="number"
                        value={cop}
                        onChange={(e) => setCop(e.target.value)}
                    />
                ) : (
                    fmtCOP(r.price_cop || 0)
                )}
            </td>

            <td style={{ padding: "10px 8px" }}>
                {editing ? (
                    <input
                        className="input"
                        style={{ maxWidth: 120 }}
                        type="number"
                        value={mxn}
                        onChange={(e) => setMxn(e.target.value)}
                    />
                ) : (
                    fmtPlain(r.price_mxn)
                )}
            </td>

            <td style={{ padding: "10px 8px" }}>
                {editing ? (
                    <input
                        className="input"
                        style={{ maxWidth: 120 }}
                        type="number"
                        value={usd}
                        onChange={(e) => setUsd(e.target.value)}
                    />
                ) : (
                    fmtPlain(r.price_usd)
                )}
            </td>

            <td style={{ padding: "10px 8px" }}>
                {editing ? (
                    <input type="checkbox" checked={isRenewable} onChange={e => setIsRenewable(e.target.checked)} />
                ) : (
                    r.is_renewable ? <span style={{ color: '#10b981', fontWeight: 800 }}>SÍ</span> : "No"
                )}
            </td>

            <td style={{ padding: "10px 8px" }}>{anyActive ? "Sí" : "No"}</td>

            <td style={{ padding: "10px 8px" }}>
                <button className="btn-ghost" disabled={saving} onClick={onToggleAll}>
                    {anyActive ? "Desactivar" : "Activar"}
                </button>{" "}
                {!editing ? (
                    <button className="btn-ghost" disabled={saving} onClick={() => setEditing(true)}>
                        Editar
                    </button>
                ) : (
                    <>
                        <button className="btn-ghost" disabled={saving} onClick={onSave}>
                            Guardar
                        </button>{" "}
                        <button className="btn-ghost" disabled={saving} onClick={reset}>
                            Cancelar
                        </button>
                    </>
                )}
            </td>
        </tr>
    );
}
