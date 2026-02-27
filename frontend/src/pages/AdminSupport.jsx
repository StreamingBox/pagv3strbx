import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/api.js";

function shortDate(dateStr) {
    if (!dateStr) return "-";
    return String(dateStr).slice(0, 10);
}

function Field({ label, value, mono = false }) {
    return (
        <div
            style={{
                padding: 12,
                borderRadius: 16,
                border: "1px solid var(--stroke)",
                background: "rgba(255,255,255,.03)",
            }}
        >
            <div style={{ fontSize: 12, color: "var(--muted2)" }}>{label}</div>
            <div
                style={{
                    marginTop: 6,
                    fontWeight: 900,
                    color: "var(--text)",
                    wordBreak: "break-word",
                    fontFamily: mono
                        ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                        : "inherit",
                }}
            >
                {value ?? "-"}
            </div>
        </div>
    );
}

export default function AdminSupport() {
    const navigate = useNavigate();

    const [subscriptionId, setSubscriptionId] = useState("");
    const [loading, setLoading] = useState(false);
    const [info, setInfo] = useState(null);
    const [error, setError] = useState("");

    const canReplace = useMemo(() => !!info?.subscriptionId && !loading, [info, loading]);

    const publicBase =
        import.meta.env.VITE_PUBLIC_BASE_URL ||
        (import.meta.env.VITE_API_BASE ? String(import.meta.env.VITE_API_BASE).replace(/\/api\/?$/, "") : "https://strbx.com.co");

    const fullLink = info?.token ? `${publicBase}/s/${info.token}` : "";

    async function onSearch(e) {
        e?.preventDefault?.();
        setError("");
        setInfo(null);

        const id = Number(subscriptionId);
        if (!Number.isFinite(id) || id <= 0) {
            setError("Ingresa un ID de subscription válido (ej: 148).");
            return;
        }

        setLoading(true);
        try {
            const { ok, data, status } = await apiFetch(`/admin/support/subscription/${id}`, { method: "GET" });
            if (!ok) {
                setError(data?.message || `Error (${status})`);
                return;
            }
            setInfo(data);
        } finally {
            setLoading(false);
        }
    }

    async function onReplace() {
        if (!info?.subscriptionId) return;

        setError("");
        setLoading(true);
        try {
            const { ok, data, status } = await apiFetch("/admin/support/replace-account", {
                method: "POST",
                body: JSON.stringify({ subscriptionId: info.subscriptionId }),
            });

            if (!ok) {
                setError(data?.message || `Error (${status})`);
                return;
            }

            setInfo(data.info);
        } finally {
            setLoading(false);
        }
    }

    async function copy(text) {
        try {
            await navigator.clipboard.writeText(text || "");
        } catch {}
    }

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                {/* SIDEBAR (igual a otros módulos admin) */}
                <aside className="sidebar">
                    <div className="nav-title">Admin</div>
                    <p className="nav-sub">Soporte</p>

                    <button className="btn-ghost" style={{ width: "100%" }} onClick={() => navigate("/admin")}>
                        ⬅ Volver al panel
                    </button>

                    <div style={{ marginTop: 14, color: "var(--muted2)", fontSize: 12, lineHeight: 1.4 }}>
                        Este módulo reemplaza la cuenta asignada por otra <b>available</b> de la misma plataforma.
                        <br />
                        <span style={{ opacity: 0.9 }}>
                            No cambia orden, duración ni expiración.
                        </span>
                    </div>
                </aside>

                {/* MAIN */}
                <main className="main" style={{ textAlign: "left" }}>
                    <h1 style={{ margin: 0 }}>Soporte</h1>
                    <p style={{ marginTop: 6, color: "var(--muted)", marginBottom: 0 }}>
                        Reemplaza una cuenta caída por otra disponible manteniendo el mismo pedido.
                    </p>

                    {/* TOOLBAR */}
                    <div className="kpi" style={{ marginTop: 14 }}>
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr auto auto",
                                gap: 10,
                                alignItems: "end",
                            }}
                        >
                            <label className="label" style={{ margin: 0 }}>
                                ID de subscription
                                <input
                                    className="input"
                                    placeholder="Ej: 148"
                                    value={subscriptionId}
                                    onChange={(e) => setSubscriptionId(e.target.value)}
                                    inputMode="numeric"
                                />
                            </label>

                            <button className="btn" onClick={onSearch} disabled={loading}>
                                {loading ? "Buscando..." : "Buscar"}
                            </button>

                            <button className="btn" onClick={onReplace} disabled={!canReplace}>
                                {loading ? "Procesando..." : "Reemplazar cuenta"}
                            </button>
                        </div>

                        {error ? (
                            <div style={{ marginTop: 12, color: "#ffb4b4", fontWeight: 800 }}>
                                {error}
                            </div>
                        ) : null}
                    </div>

                    {/* EMPTY STATE */}
                    {!info ? (
                        <div className="kpi" style={{ marginTop: 14 }}>
                            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                <div
                                    style={{
                                        width: 46,
                                        height: 46,
                                        borderRadius: 16,
                                        display: "grid",
                                        placeItems: "center",
                                        background: "rgba(255,255,255,.04)",
                                        border: "1px solid var(--stroke)",
                                        fontSize: 22,
                                    }}
                                >
                                    🛠️
                                </div>
                                <div>
                                    <div style={{ fontWeight: 1000 }}>Busca una subscription para ver sus credenciales</div>
                                    <div style={{ color: "var(--muted)", marginTop: 4 }}>
                                        Ingresa el ID y presiona <b>Buscar</b>. Luego puedes usar <b>Reemplazar cuenta</b> si hay stock.
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* SUMMARY */}
                            <div className="kpi" style={{ marginTop: 14 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                    <div>
                                        <div style={{ fontSize: 12, color: "var(--muted2)" }}>Resumen</div>
                                        <div style={{ fontSize: 18, fontWeight: 1000, marginTop: 4 }}>
                                            {info.platformName} • 🆔 {info.subscriptionId}
                                        </div>
                                        <div style={{ color: "var(--muted)", marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                                            <span>📅 Expira: <b>{shortDate(info.expiresAt)}</b></span>
                                            <span>📦 Orden: <b>{info.orderCode || info.orderId || "-"}</b></span>
                                        </div>
                                    </div>

                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                        <button className="btn-ghost" onClick={() => copy(info.message || "")}>
                                            Copiar mensaje
                                        </button>
                                        <button className="btn-ghost" onClick={() => copy(fullLink)}>
                                            Copiar link
                                        </button>
                                        {info?.token ? (
                                            <a className="btn-ghost" href={`/s/${info.token}`} target="_blank" rel="noreferrer">
                                                Abrir /s/
                                            </a>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            {/* GRID: credenciales + mensaje */}
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "1.1fr 0.9fr",
                                    gap: 14,
                                    marginTop: 14,
                                }}
                            >
                                {/* Credenciales */}
                                <div className="kpi">
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                        <div>
                                            <div style={{ fontWeight: 1000 }}>Credenciales actuales</div>
                                            <div style={{ color: "var(--muted2)", fontSize: 12, marginTop: 4 }}>
                                                Estas serán las que muestre el link /s/ luego del reemplazo.
                                            </div>
                                        </div>
                                        <button className="btn-ghost" onClick={() => copy(info.account?.email || "")}>Copiar correo</button>
                                    </div>

                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "1fr 1fr",
                                            gap: 10,
                                            marginTop: 12,
                                        }}
                                    >
                                        <Field label="Correo" value={info.account?.email || "-"} mono />
                                        <Field label="Contraseña" value={info.account?.password || "-"} mono />
                                        <Field label="Perfil" value={String(info.account?.profile_number ?? "").trim() ? info.account?.profile_number : "-"} />
                                        <Field label="Pin" value={String(info.account?.pin ?? "").trim() ? info.account?.pin : "-"} />
                                        <Field label="Expira" value={shortDate(info.expiresAt)} />
                                        <Field label="Link" value={fullLink || (info.token ? `/s/${info.token}` : "-")} mono />
                                    </div>

                                    <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 13 }}>
                                        ⚠️ Si no hay stock disponible, el sistema mostrará: <b>“Sin stock: no podemos completar la acción”</b>.
                                    </div>
                                </div>

                                {/* Mensaje */}
                                <div className="kpi">
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                        <div>
                                            <div style={{ fontWeight: 1000 }}>Mensaje WhatsApp</div>
                                            <div style={{ color: "var(--muted2)", fontSize: 12, marginTop: 4 }}>
                                                Mismo formato que checkout.
                                            </div>
                                        </div>
                                        <button className="btn-ghost" onClick={() => copy(info.message || "")}>Copiar</button>
                                    </div>

                                    <textarea
                                        className="input"
                                        value={info.message || ""}
                                        readOnly
                                        rows={22}
                                        style={{
                                            width: "100%",
                                            marginTop: 12,
                                            minHeight: 420,
                                            resize: "vertical",
                                            fontFamily:
                                                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                            lineHeight: 1.4,
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Responsive */}
                            <style>{`
                                @media (max-width: 980px){
                                    .main > div[style*="grid-template-columns: 1.1fr 0.9fr"]{
                                        grid-template-columns: 1fr !important;
                                    }
                                }
                            `}</style>
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}
