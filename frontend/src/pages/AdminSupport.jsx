import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { apiFetch, apiLogout } from "../api/api.js";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";

function useIsMobile() {
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 800);
    useEffect(() => {
        const h = () => setIsMobile(window.innerWidth <= 800);
        window.addEventListener("resize", h);
        return () => window.removeEventListener("resize", h);
    }, []);
    return isMobile;
}

const PUBLIC_BASE =
    import.meta.env.VITE_PUBLIC_BASE_URL ||
    (import.meta.env.VITE_API_BASE
        ? String(import.meta.env.VITE_API_BASE).replace(/\/api\/?$/, "")
        : "https://strbx.com.co");

/* ─── Estilos inline ─── */
const S = {
    shell: {
        display: "flex", minHeight: "100vh",
        background: "var(--bg, #0a0f1e)",
        fontFamily: "var(--font, 'Inter', system-ui, sans-serif)",
        color: "var(--text, #eaf1ff)",
        position: "relative", overflow: "hidden",
    },
    orb1: {
        position: "fixed", top: -200, left: -200, width: 600, height: 600,
        borderRadius: "50%", background: "radial-gradient(circle, rgba(13,166,242,0.08) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
    },
    orb2: {
        position: "fixed", bottom: -200, right: -100, width: 700, height: 700,
        borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
    },
    main: {
        flex: 1, padding: "36px 40px", position: "relative", zIndex: 1,
        overflowY: "auto", maxWidth: "100%",
    },
    headerRow: {
        display: "flex", alignItems: "center", gap: 16, marginBottom: 24,
        paddingBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.06)",
    },
    iconBadge: {
        width: 52, height: 52, borderRadius: 16, flexShrink: 0,
        background: "rgba(13,166,242,0.1)", border: "1px solid rgba(13,166,242,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 26, boxShadow: "0 4px 16px rgba(13,166,242,0.2)",
    },
    title: { margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px" },
    subtitle: { margin: "4px 0 0", fontSize: 13, color: "rgba(234,241,255,0.5)" },
    card: {
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16, padding: "22px 24px",
        marginBottom: 16, backdropFilter: "blur(20px)",
        boxShadow: "0 4px 40px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)",
    },
    cardTitle: {
        fontSize: 13, fontWeight: 700, color: "rgba(234,241,255,0.5)",
        textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 14,
        display: "flex", alignItems: "center", gap: 7,
    },
    searchRow: {
        display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center",
    },
    input: {
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12, padding: "11px 16px", color: "#eaf1ff", fontSize: 14,
        outline: "none", transition: "border-color 0.2s, box-shadow 0.2s",
        fontFamily: "inherit", width: "100%", boxSizing: "border-box",
    },
    btnBlue: {
        display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
        background: "rgba(13,166,242,0.15)", border: "1px solid rgba(13,166,242,0.35)",
        color: "#0da6f2", borderRadius: 12, padding: "11px 20px",
        fontWeight: 700, fontSize: 14, cursor: "pointer", transition: "all 0.2s",
    },
    btnGreen: {
        display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
        background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)",
        color: "#10b981", borderRadius: 12, padding: "11px 20px",
        fontWeight: 700, fontSize: 14, cursor: "pointer", transition: "all 0.2s",
    },
    btnGhost: {
        display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
        color: "rgba(234,241,255,0.7)", borderRadius: 10, padding: "8px 14px",
        fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.15s",
        textDecoration: "none",
    },
    errorBox: {
        background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
        color: "#ef4444", borderRadius: 10, padding: "12px 16px", fontSize: 13, marginTop: 12,
    },
    emptyIcon: {
        width: 50, height: 50, borderRadius: 16, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
        fontSize: 24,
    },
    summaryRow: {
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        gap: 12, flexWrap: "wrap",
    },
    chip: {
        display: "inline-flex", alignItems: "center", gap: 5,
        background: "rgba(13,166,242,0.1)", border: "1px solid rgba(13,166,242,0.2)",
        color: "#0da6f2", borderRadius: 20, padding: "4px 12px",
        fontSize: 12, fontWeight: 700,
    },
    twoCol: {
        display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 16, marginTop: 0,
    },
    fieldGrid: {
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14,
    },
    fieldTile: {
        padding: "12px 14px", borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(255,255,255,0.03)",
    },
    fieldLabel: { fontSize: 11, color: "rgba(234,241,255,0.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px" },
    fieldValue: {
        marginTop: 5, fontWeight: 700, color: "#eaf1ff", wordBreak: "break-all",
        fontFamily: 'ui-monospace, "Courier New", monospace', fontSize: 13,
    },
    warnBox: {
        marginTop: 14, padding: "10px 14px", borderRadius: 10,
        background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
        color: "#f59e0b", fontSize: 12,
    },
    textarea: {
        width: "100%", marginTop: 12, minHeight: 380, resize: "vertical",
        background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12, padding: "14px 16px", color: "#eaf1ff", fontSize: 13,
        fontFamily: 'ui-monospace, "Courier New", monospace', lineHeight: 1.5,
        outline: "none", boxSizing: "border-box",
    },
};

/* ─── Field tile ─── */
function Field({ label, value, mono = false }) {
    return (
        <div style={S.fieldTile}>
            <div style={S.fieldLabel}>{label}</div>
            <div style={{ ...S.fieldValue, fontFamily: mono ? S.fieldValue.fontFamily : "inherit" }}>
                {value ?? "—"}
            </div>
        </div>
    );
}

function shortDate(d) { return d ? String(d).slice(0, 10) : "—"; }

/* ─── Componente principal ─── */
export default function AdminSupport() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();
    const isMobile = useIsMobile();

    const [subscriptionId, setSubscriptionId] = useState("");
    const [loading, setLoading] = useState(false);
    const [info, setInfo] = useState(null);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState("");

    const canReplace = useMemo(() => !!info?.subscriptionId && !loading, [info, loading]);
    const fullLink = info?.token ? `${PUBLIC_BASE}/s/${info.token}` : "";

    async function logout() {
        try { await apiLogout(); } catch { }
        setUser(null);
        navigate("/", { replace: true });
    }

    async function onSearch(e) {
        e?.preventDefault?.();
        setError(""); setInfo("");
        const id = Number(subscriptionId);
        if (!Number.isFinite(id) || id <= 0) {
            setError("Ingresa un ID de subscription válido (ej: 148).");
            return;
        }
        setLoading(true);
        try {
            const { ok, data, status } = await apiFetch(`/admin/support/subscription/${id}`, { method: "GET" });
            if (!ok) { setError(data?.message || `Error (${status})`); return; }
            setInfo(data);
        } finally { setLoading(false); }
    }

    async function onReplace() {
        if (!info?.subscriptionId) return;
        setError(""); setLoading(true);
        try {
            const { ok, data, status } = await apiFetch("/admin/support/replace-account", {
                method: "POST",
                body: JSON.stringify({ subscriptionId: info.subscriptionId }),
            });
            if (!ok) { setError(data?.message || `Error (${status})`); return; }
            setInfo(data.info);
        } finally { setLoading(false); }
    }

    async function copy(text, label = "") {
        try {
            await navigator.clipboard.writeText(text || "");
            setCopied(label);
            setTimeout(() => setCopied(""), 2000);
        } catch { }
    }

    return (
        <div style={S.shell}>
            <div style={S.orb1} />
            <div style={S.orb2} />

            <AdminSidebar
                user={user}
                logoSrc="/api/branding/logo"
                logoOk={true}
                setLogoOk={() => { }}
                uploadingLogo={false}
                onOpenLogoPicker={() => navigate("/admin")}
                onLogout={logout}
            />

            <main style={S.main}>
                {/* Header */}
                <div style={S.headerRow}>
                    <div style={S.iconBadge}>🎧</div>
                    <div>
                        <h1 style={S.title}>Soporte Técnico</h1>
                        <p style={S.subtitle}>Reemplaza cuentas caídas por disponibles, manteniendo el mismo pedido.</p>
                    </div>
                </div>

                {/* Buscador */}
                <div style={S.card}>
                    <div style={S.cardTitle}>🔍 Buscar Subscription</div>
                    <form onSubmit={onSearch}>
                        <div style={{
                            ...S.searchRow,
                            gridTemplateColumns: isMobile ? "1fr" : "1fr auto auto",
                            gap: 12
                        }}>
                            <input
                                style={S.input}
                                placeholder="ID de subscription (ej: 148)"
                                value={subscriptionId}
                                onChange={e => setSubscriptionId(e.target.value)}
                                inputMode="numeric"
                                onFocus={e => { e.target.style.borderColor = "rgba(13,166,242,0.5)"; e.target.style.boxShadow = "0 0 0 3px rgba(13,166,242,0.1)"; }}
                                onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; e.target.style.boxShadow = "none"; }}
                            />
                            <div style={{ display: "flex", gap: 10, width: "100%" }}>
                                <button
                                    type="submit"
                                    style={{ ...S.btnBlue, opacity: loading ? 0.6 : 1, flex: 1, justifyContent: "center" }}
                                    disabled={loading}
                                    onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = "rgba(13,166,242,0.25)"; e.currentTarget.style.boxShadow = "0 0 14px rgba(13,166,242,0.3)"; } }}
                                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(13,166,242,0.15)"; e.currentTarget.style.boxShadow = "none"; }}
                                >
                                    {loading ? "⏳..." : "🔍 Buscar"}
                                </button>
                                <button
                                    type="button"
                                    style={{ ...S.btnGreen, opacity: canReplace ? 1 : 0.4, cursor: canReplace ? "pointer" : "not-allowed", flex: 1, justifyContent: "center" }}
                                    onClick={onReplace}
                                    disabled={!canReplace}
                                    onMouseEnter={e => { if (canReplace) { e.currentTarget.style.background = "rgba(16,185,129,0.25)"; e.currentTarget.style.boxShadow = "0 0 14px rgba(16,185,129,0.3)"; } }}
                                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(16,185,129,0.15)"; e.currentTarget.style.boxShadow = "none"; }}
                                >
                                    🔄 Reemplazar
                                </button>
                            </div>
                        </div>
                    </form>

                    {error && <div style={S.errorBox}>⚠️ {error}</div>}
                    {copied && (
                        <div style={{ ...S.errorBox, background: "rgba(16,185,129,0.1)", borderColor: "rgba(16,185,129,0.25)", color: "#10b981", marginTop: 10 }}>
                            ✅ {copied} copiado al portapapeles
                        </div>
                    )}
                </div>

                {/* Estado vacío */}
                {!info ? (
                    <div style={S.card}>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                            <div style={S.emptyIcon}>🛠️</div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 15 }}>
                                    Busca una subscription para ver sus credenciales
                                </div>
                                <div style={{ color: "rgba(234,241,255,0.4)", marginTop: 6, fontSize: 13 }}>
                                    Ingresa el ID y presiona <b style={{ color: "#0da6f2" }}>Buscar</b>. Luego puedes usar <b style={{ color: "#10b981" }}>Reemplazar cuenta</b> si hay stock disponible.
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Resumen */}
                        <div style={S.card}>
                            <div style={S.summaryRow}>
                                <div>
                                    <div style={{ fontSize: 12, color: "rgba(234,241,255,0.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                                        Resumen
                                    </div>
                                    <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
                                        {info.platformName} &nbsp;
                                        <span style={{ color: "#0da6f2" }}>#{info.subscriptionId}</span>
                                    </div>
                                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                        <span style={S.chip}>📅 {shortDate(info.expiresAt)}</span>
                                        <span style={{ ...S.chip, background: "rgba(139,92,246,0.1)", borderColor: "rgba(139,92,246,0.2)", color: "#8b5cf6" }}>
                                            📦 {info.orderCode || info.orderId || "—"}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                    {[
                                        { label: "📋 Copiar mensaje", action: () => copy(info.message || "", "Mensaje") },
                                        { label: "🔗 Copiar link", action: () => copy(fullLink, "Link") },
                                    ].map(btn => (
                                        <button key={btn.label} style={S.btnGhost} onClick={btn.action}
                                            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                                            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                                        >
                                            {btn.label}
                                        </button>
                                    ))}
                                    {info?.token && (
                                        <a style={S.btnGhost} href={`/s/${info.token}`} target="_blank" rel="noreferrer"
                                            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                                            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                                        >
                                            🔓 Abrir /s/ ↗
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Grid: credenciales + mensaje */}
                        <div style={{
                            ...S.twoCol,
                            gridTemplateColumns: isMobile ? "1fr" : "1.1fr 0.9fr"
                        }}>
                            {/* Credenciales */}
                            <div style={S.card}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                                    <div style={{ fontWeight: 700, fontSize: 15 }}>🔐 Credenciales</div>
                                    <button style={{ ...S.btnGhost, padding: "5px 10px", fontSize: 11 }} onClick={() => copy(info.account?.email || "", "Correo")}
                                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                                        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                                    >
                                        Copiar correo
                                    </button>
                                </div>
                                <div style={S.fieldGrid}>
                                    <Field label="Correo" value={info.account?.email || "—"} mono />
                                    <Field label="Contraseña" value={info.account?.password || "—"} mono />
                                    <Field label="Perfil" value={String(info.account?.profile_number ?? "").trim() ? info.account?.profile_number : "—"} />
                                    <Field label="Pin" value={String(info.account?.pin ?? "").trim() ? info.account?.pin : "—"} />
                                    <Field label="Expira" value={shortDate(info.expiresAt)} />
                                    <Field label="Link" value={fullLink || "—"} mono />
                                </div>
                                <div style={S.warnBox}>
                                    ⚠️ Si no hay stock, el sistema dirá: <b>"Sin stock"</b>.
                                </div>
                            </div>

                            {/* Mensaje WhatsApp */}
                            <div style={S.card}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                    <div style={{ fontWeight: 700, fontSize: 15 }}>💬 Mensaje WhatsApp</div>
                                    <button style={{ ...S.btnGhost, padding: "5px 10px", fontSize: 11 }} onClick={() => copy(info.message || "", "Mensaje WhatsApp")}
                                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                                        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                                    >
                                        Copiar
                                    </button>
                                </div>
                                <textarea
                                    style={{ ...S.textarea, minHeight: isMobile ? 300 : 380 }}
                                    value={info.message || ""}
                                    readOnly
                                    rows={isMobile ? 12 : 22}
                                />
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
