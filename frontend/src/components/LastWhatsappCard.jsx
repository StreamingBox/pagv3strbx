import {useEffect, useMemo, useState} from "react";
import {copyText} from "../utils/platform.js";

function formatBogota(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";

    return new Intl.DateTimeFormat("es-CO", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    })
        .format(d)
        .replace(",", "");
}

export default function LastWhatsappCard({onGoOrders}) {
    const [payload, setPayload] = useState(null);

    function readPayload() {
        try {
            const raw = localStorage.getItem("lastWhatsappPayload");
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed?.message) return null;
            return parsed;
        } catch {
            return null;
        }
    }

    useEffect(() => {
        const refresh = () => setPayload(readPayload());

        // inicial
        refresh();

        // ✅ para otras pestañas
        function onStorage(e) {
            if (e.key === "lastWhatsappPayload") refresh();
        }

        // ✅ para esta misma pestaña (cuando compras)
        function onLocalUpdate() {
            refresh();
        }

        window.addEventListener("storage", onStorage);
        window.addEventListener("lastWhatsappPayloadUpdated", onLocalUpdate);

        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener("lastWhatsappPayloadUpdated", onLocalUpdate);
        };
    }, []);


    const metaLine = useMemo(() => {
        if (!payload) return "";
        const parts = [];
        if (payload.orderCode) parts.push(`Orden ${payload.orderCode}`);
        if (payload.createdAt) parts.push(`Fecha ${formatBogota(payload.createdAt)}`);
        if (payload.total != null && payload.currency)
            parts.push(`Total ${Number(payload.total).toLocaleString()} ${payload.currency}`);
        return parts.join(" · ");
    }, [payload]);

    if (!payload) return null;

    return (
        <div className="kpi" style={{marginTop: 12}}>
            <div style={{display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap"}}>
                <div>
                    <div style={{fontWeight: 950, fontSize: 16}}>📌 Último mensaje para WhatsApp</div>
                    <div style={{color: "var(--muted)", fontSize: 13, marginTop: 4}}>{metaLine}</div>
                </div>

                <div style={{display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center"}}>
                    {onGoOrders ? (
                        <button className="btn-ghost" onClick={onGoOrders}>
                            🧾 Ir al historial
                        </button>
                    ) : null}

                    <button className="btn" onClick={() => copyText(payload.message)}>
                        Copiar
                    </button>

                    <button
                        className="btn-ghost"
                        onClick={() => {
                            try {
                                localStorage.removeItem("lastWhatsappPayload");
                                window.dispatchEvent(new Event("lastWhatsappPayloadUpdated"));
                                setPayload(null);


                            } catch {
                                // ignore
                            }

                        }}
                    >
                        Borrar
                    </button>
                </div>
            </div>

            <pre
                style={{
                    marginTop: 12,
                    whiteSpace: "pre-wrap",
                    background: "rgba(0,0,0,.25)",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid rgba(124,92,255,.22)",
                }}
            >
        {payload.message}
      </pre>
        </div>
    );
}
