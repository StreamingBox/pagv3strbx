import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/codes.css";
import { apiPost } from "../api/api";

const PLATFORMS = [
    { slug: "chatgpt", label: "ChatGPT", icon: "🤖" },
    { slug: "spotify", label: "Spotify", icon: "🎵" },
    { slug: "netflix", label: "Netflix", icon: "🎬" },
    { slug: "prime", label: "Prime Video", icon: "📦" },
];

export default function Codes() {
    const navigate = useNavigate();

    const [orderNumber, setOrderNumber] = useState("");
    const [loadingSlug, setLoadingSlug] = useState(null);
    const [error, setError] = useState("");
    const [data, setData] = useState(null);
    const [copied, setCopied] = useState(false);

    const canSend = useMemo(() => {
        return orderNumber.trim().length > 0 && !loadingSlug;
    }, [orderNumber, loadingSlug]);

    async function requestCode(slug) {
        setError("");
        setData(null);
        setCopied(false);
        setLoadingSlug(slug);

        try {
            const r = await apiPost(`/api/codes/${slug}/request`, {
                orderNumber: orderNumber.trim(),
            });


            // Si no hay sesión / cookie expirada (y refresh no pudo)
            if (r.status === 401) {
                localStorage.removeItem("user");
                navigate("/login");
                return;
            }

            // ✅ No hacemos throw para poder renderizar status (expired/blocked/no_account, etc.)
            if (!r.ok) {
                setData({
                    ok: false,
                    status: r.data?.status || "error",
                    message: r.data?.message || "Error solicitando código",
                });
                return;
            }

            setData(r.data);
        } catch (e) {
            setError(e?.message || "Error");
        } finally {
            setLoadingSlug(null);
        }
    }

    async function copyCode() {
        if (!data?.code) return;
        await navigator.clipboard.writeText(String(data.code));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }

    function renderStatusCard(d) {
        if (!d || d.ok !== false) return null;

        const status = String(d.status || "").toLowerCase();

        const title =
            status === "expired"
                ? "⏱️ Vencido"
                : status === "blocked"
                    ? "🚫 Límite alcanzado"
                    : status === "no_account"
                        ? "🧾 Sin cuenta asignada"
                        : "⚠️ Aviso";

        const variant =
            status === "expired"
                ? "warn"
                : status === "blocked"
                    ? "danger"
                    : status === "no_account"
                        ? "info"
                        : "warn";

        return (
            <div className={`codesStatusCard ${variant}`}>
                <div className="codesStatusTitle">{title}</div>
                <div className="codesStatusText">{d.message || "Ocurrió un problema"}</div>
            </div>
        );
    }

    return (
        <div className="page-shell codesPage">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner codesInner">
                <main className="main codesMain">
                    <div className="codesCard">
                        {/* Header */}
                        <div className="codesHeader">
                            <button className="btn-ghost codesBack" onClick={() => navigate(-1)}>
                                ← Regresar
                            </button>

                            <div className="codesHeaderText">
                                <h1 className="codesTitle">🔐 Códigos</h1>
                                <p className="codesSub">
                                    Ingresa el número de pedido y selecciona la plataforma para obtener el código.
                                </p>
                            </div>
                        </div>

                        {/* Form */}
                        <div className="codesBody">
                            <div className="codesField">
                                <label className="codesLabel">Número de pedido</label>
                                <input
                                    value={orderNumber}
                                    onChange={(e) => setOrderNumber(e.target.value)}
                                    placeholder="Ej: 12345"
                                    className="codesInput"
                                    inputMode="numeric"
                                />
                            </div>

                            <div className="codesPlatforms">
                                {PLATFORMS.map((p) => (
                                    <button
                                        key={p.slug}
                                        className={`codesPlatformBtn ${loadingSlug === p.slug ? "isLoading" : ""}`}
                                        disabled={!canSend}
                                        onClick={() => requestCode(p.slug)}
                                        type="button"
                                        title={p.label}
                                    >
                                        <span className="codesPlatformIcon">{p.icon}</span>
                                        <span className="codesPlatformText">
                      {loadingSlug === p.slug ? "Buscando..." : p.label}
                    </span>
                                        {loadingSlug === p.slug ? <span className="codesSpinner" /> : null}
                                    </button>
                                ))}
                            </div>

                            {/* Aviso fijo */}
                            <div className="codesNotice">
                                <b>Aviso:</b> Solo se puede solicitar <b>1 código por pedido</b>. Si se realiza un{" "}
                                <b>cambio de clave/pin</b> en la cuenta, podrás solicitar nuevamente el código desde esta página.
                            </div>

                            {error ? <div className="error codesError">❌ {error}</div> : null}

                            {/* Respuestas del backend con status */}
                            {renderStatusCard(data)}

                            {/* Respuesta OK */}
                            {data?.ok ? (
                                <div className="codesResultCard">
                                    <div className="codesResultTop">
                                        <div className="codesResultCol">
                                            <div className="codesMetaLabel">Correo</div>
                                            <div className="codesMetaValue">{data.email}</div>
                                        </div>

                                        <div className="codesResultCol">
                                            <div className="codesMetaLabel">Código</div>
                                            <div className="codesCode">{data.code}</div>
                                        </div>

                                        <div className="codesResultCol codesResultActions">
                                            <button className="btn codesCopy" onClick={copyCode} type="button">
                                                {copied ? "✅ Copiado" : "📋 Copiar"}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="codesResultFooter">
                                        Plataforma: <b>{data.platform}</b> · Pedido: <b>{data.orderNumber}</b>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
