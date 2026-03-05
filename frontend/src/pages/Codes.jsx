import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiPost, apiLogout } from "../api/api";
import Sidebar from "../components/dashboard/Sidebar.jsx";
import { slugifyLogo } from "../utils/platform.js";

/* ─── Plataformas con colores de marca y nombres de archivo correctos ─── */
const PLATFORMS = [
    { slug: "chatgpt", logoSlug: "chatgpt", label: "ChatGPT", icon: "🤖", accent: "#10a37f", bg: "rgba(16,163,127,0.12)", border: "rgba(16,163,127,0.3)" },
    { slug: "spotify", logoSlug: "spotify-3-meses", label: "Spotify", icon: "🎵", accent: "#1db954", bg: "rgba(29,185,84,0.12)", border: "rgba(29,185,84,0.3)" },
    { slug: "netflix", logoSlug: "netflix", label: "Netflix", icon: "🎬", accent: "#e50914", bg: "rgba(229,9,20,0.12)", border: "rgba(229,9,20,0.3)" },
    { slug: "prime", logoSlug: "prime-video", label: "Prime Video", icon: "📦", accent: "#00a8e1", bg: "rgba(0,168,225,0.12)", border: "rgba(0,168,225,0.3)" },
];

/* ─── Estilos globales del componente (fuera del render para no recrear en cada update) ─── */
const S = {
    card: {
        background: "linear-gradient(180deg, var(--card), var(--card2))",
        border: "1px solid var(--stroke)",
        borderRadius: 18,
        boxShadow: "var(--shadow)",
        backdropFilter: "blur(14px)",
    },
    sectionTitle: { margin: 0, fontSize: 14, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.2px" },
    sectionIcon: {
        width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 13, flexShrink: 0,
    },
};

/* ─── FAQ con accordion ─── */
function FaqItem({ q, a }) {
    const [open, setOpen] = useState(false);
    return (
        <motion.div
            animate={{ background: open ? "rgba(13,166,242,0.05)" : "transparent" }}
            style={{ border: "1px solid var(--stroke)", borderRadius: 12, overflow: "hidden", cursor: "pointer" }}
            onClick={() => setOpen(o => !o)}
        >
            <div style={{ padding: "13px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{q}</span>
                <motion.span animate={{ rotate: open ? 180 : 0 }} style={{ fontSize: 12, color: "var(--accent)", flexShrink: 0 }}>▾</motion.span>
            </div>
            <AnimatePresence>
                {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
                        <div style={{ padding: "0 16px 13px", fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>{a}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

/* ─── Campo credencial ─── */
function CredField({ label, value, icon, secret = false }) {
    const [revealed, setRevealed] = useState(false);
    const [copied, setCopied] = useState(false);

    async function copy() {
        await navigator.clipboard.writeText(String(value));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    const IB = {
        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
        background: "rgba(13,166,242,0.1)", border: "1px solid rgba(13,166,242,0.2)",
        color: "var(--accent)", fontSize: 12, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s",
    };

    return (
        <div style={{ background: "var(--input-bg)", border: "1px solid var(--stroke)", borderRadius: 10, padding: "11px 13px", display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(13,166,242,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13 }}>{icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", wordBreak: "break-all", fontFamily: secret && !revealed ? "monospace" : "inherit" }}>
                    {secret && !revealed ? "••••••••••••" : value}
                </div>
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {secret && <button onClick={() => setRevealed(v => !v)} style={IB}>{revealed ? "🙈" : "👁️"}</button>}
                <button onClick={copy} style={{ ...IB, background: copied ? "rgba(16,185,129,0.2)" : IB.background, border: copied ? "1px solid rgba(16,185,129,0.4)" : IB.border, color: copied ? "#10b981" : IB.color }}>
                    {copied ? "✓" : "⎘"}
                </button>
            </div>
        </div>
    );
}

/* ─── Status card ─── */
function StatusCard({ d }) {
    if (!d || d.ok !== false) return null;
    const st = String(d.status || "").toLowerCase();
    const cfg = {
        expired: { icon: "⏱️", title: "Vencido", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)" },
        blocked: { icon: "🚫", title: "Límite alcanzado", color: "#ef4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)" },
        no_account: { icon: "🧾", title: "Sin cuenta asignada", color: "var(--accent)", bg: "rgba(13,166,242,0.07)", border: "rgba(13,166,242,0.25)" },
    }[st] || { icon: "⚠️", title: "Aviso", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)" };
    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: cfg.color, marginBottom: 3 }}>{cfg.icon} {cfg.title}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{d.message || "Ocurrió un problema."}</div>
        </motion.div>
    );
}

/* ─── Página ─── */
export default function Codes() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();

    const [orderNumber, setOrderNumber] = useState("");
    const [activePlatform, setActivePlatform] = useState(null);
    const [loadingSlug, setLoadingSlug] = useState(null);
    const [error, setError] = useState("");
    const [data, setData] = useState(null);

    async function logout() {
        try { await apiLogout(); } catch { }
        setUser(null);
        navigate("/", { replace: true });
    }

    const canSearch = orderNumber.trim().length > 0 && !loadingSlug;

    async function requestCode(slug, action = "code") {
        if (!canSearch) return;
        setError(""); setData(null);
        setActivePlatform(slug);
        setLoadingSlug(slug);
        try {
            const body = { orderNumber: orderNumber.trim() };
            if (slug === "netflix") body.action = action;
            const r = await apiPost(`/api/codes/${slug}/request`, body);
            if (r.status === 401) { navigate("/login"); return; }
            if (!r.ok) {
                const fallbackMessage = r.status >= 500 ? "Time-out o error interno. Intenta más tarde." : "Error solicitando código";
                setData({ ok: false, status: r.data?.status || "error", message: r.data?.message || fallbackMessage });
                return;
            }
            setData(r.data);
        } catch (e) {
            setError(e?.message || "Error de conexión");
        } finally {
            setLoadingSlug(null);
        }
    }

    function handlePlatformClick(slug) {
        if (!canSearch) return;
        if (slug !== "netflix") {
            requestCode(slug, "code");
        } else {
            setError("");
            setData(null);
            setActivePlatform(slug);
        }
    }

    const activeMeta = useMemo(() => PLATFORMS.find(p => p.slug === activePlatform), [activePlatform]);

    /* ── Estilos ahora definidos fuera del componente (const S) ── */

    return (
        <div className="page-shell">
            {/* Orbs decorativos nativos */}
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                {/* Sidebar */}
                <Sidebar
                    user={user} wallet={null} cartCount={0}
                    onOpenCart={() => { }}
                    onGoOrders={() => navigate("/orders")}
                    onGoWallet={() => navigate("/wallet")}
                    onGoAnalytics={() => navigate("/analytics")}
                    onGoCodes={() => navigate("/codes")}
                    onGoCodeLogs={() => navigate("/admin/code-logs")}
                    onGoAdmin={() => navigate("/admin")}
                    onGoExpirations={() => navigate("/expirations")}
                    onGoHome={() => navigate("/dashboard")}
                    onLogout={logout}
                />

                {/* ── MAIN: 2 columnas ── */}
                <main className="main" style={{
                    padding: "20px 18px", display: "flex", gap: 16, alignItems: "flex-start",
                    background: "transparent", border: "none", boxShadow: "none", backdropFilter: "none"
                }}>

                    {/* ════ IZQUIERDA: Formulario ════ */}
                    <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}
                        style={{ ...S.card, flex: "0 0 450px", overflow: "hidden" }}>

                        {/* ── Header con glow ── */}
                        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--stroke)", textAlign: "center" }}>
                            {/* Icono central con glow */}
                            <div style={{ position: "relative", display: "inline-flex", marginBottom: 12 }}>
                                <div style={{ width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,rgba(13,166,242,0.2),rgba(99,51,255,0.2))", border: "1.5px solid rgba(13,166,242,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 0 24px rgba(13,166,242,0.25), inset 0 0 14px rgba(13,166,242,0.05)" }}>🔐</div>
                                {/* Anillo decorativo */}
                                <div style={{ position: "absolute", inset: -5, borderRadius: "50%", border: "1px solid rgba(13,166,242,0.12)", boxShadow: "0 0 12px rgba(13,166,242,0.08)" }} />
                            </div>
                            <h1 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" }}>Códigos (V3)</h1>
                            <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>Obtén credenciales de acceso de tu pedido</p>
                        </div>

                        {/* ── Body ── */}
                        <div style={{ padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: 15 }}>

                            {/* Input + botón inline */}
                            <div>
                                <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>
                                    Número de pedido
                                </label>
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <div style={{ position: "relative", flex: 1 }}>
                                            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, pointerEvents: "none", color: "var(--muted)" }}>🧾</span>
                                            <input
                                                value={orderNumber}
                                                onChange={e => setOrderNumber(e.target.value)}
                                                onKeyDown={e => { if (e.key === "Enter" && activePlatform && activePlatform !== "netflix") requestCode(activePlatform); }}
                                                placeholder="#12345"
                                                inputMode="numeric"
                                                style={{
                                                    width: "100%", height: 40, paddingLeft: 36, paddingRight: 12,
                                                    borderRadius: 10, fontSize: 13, fontWeight: 700,
                                                    background: "var(--input-bg)", color: "var(--text)",
                                                    border: "1px solid var(--stroke)", outline: "none",
                                                    fontFamily: "var(--font)", boxSizing: "border-box",
                                                    transition: "border-color 0.18s, box-shadow 0.18s",
                                                }}
                                                onFocus={e => { e.target.style.borderColor = "var(--accent)"; e.target.style.boxShadow = "0 0 0 3px rgba(13,166,242,0.15)"; }}
                                                onBlur={e => { e.target.style.borderColor = "var(--stroke)"; e.target.style.boxShadow = "none"; }}
                                            />
                                        </div>
                                    </div>

                                    {activePlatform === "netflix" && (
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <motion.button
                                                whileHover={{ scale: 1.02, boxShadow: "0 0 16px rgba(13,166,242,0.3)" }}
                                                whileTap={{ scale: 0.98 }}
                                                disabled={!canSearch}
                                                onClick={() => requestCode("netflix", "code")}
                                                style={{
                                                    flex: 1, height: 40, borderRadius: 10, fontSize: 12, fontWeight: 800,
                                                    background: canSearch ? "linear-gradient(135deg,rgba(13,166,242,0.1),rgba(13,166,242,0.05))" : "var(--input-bg)",
                                                    border: canSearch ? "1px solid rgba(13,166,242,0.4)" : "1px solid var(--stroke)",
                                                    color: canSearch ? "var(--accent)" : "var(--muted)",
                                                    cursor: canSearch ? "pointer" : "default", fontFamily: "var(--font)",
                                                    transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                                                }}
                                            >
                                                <span>🔑</span> <span style={{ textShadow: canSearch ? "0 0 10px rgba(13,166,242,0.3)" : "none" }}>Obtener Código</span>
                                            </motion.button>

                                            <motion.button
                                                whileHover={{ scale: 1.02, boxShadow: "0 0 16px rgba(16,185,129,0.3)" }}
                                                whileTap={{ scale: 0.98 }}
                                                disabled={!canSearch}
                                                onClick={() => requestCode("netflix", "approve")}
                                                style={{
                                                    flex: 1, height: 40, borderRadius: 10, fontSize: 12, fontWeight: 800,
                                                    background: canSearch ? "linear-gradient(135deg,rgba(16,185,129,0.1),rgba(16,185,129,0.05))" : "var(--input-bg)",
                                                    border: canSearch ? "1px solid rgba(16,185,129,0.4)" : "1px solid var(--stroke)",
                                                    color: canSearch ? "#10b981" : "var(--muted)",
                                                    cursor: canSearch ? "pointer" : "default", fontFamily: "var(--font)",
                                                    transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                                                }}
                                            >
                                                <span>✅</span> <span style={{ textShadow: canSearch ? "0 0 10px rgba(16,185,129,0.3)" : "none" }}>Aprobar Dispositivo</span>
                                            </motion.button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Grid plataformas */}
                            <div>
                                <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>
                                    Plataforma
                                </label>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                    {PLATFORMS.map(p => {
                                        const isActive = activePlatform === p.slug;
                                        const isLoading = loadingSlug === p.slug;
                                        return (
                                            <motion.button key={p.slug}
                                                whileHover={canSearch ? { scale: 1.03, boxShadow: `0 0 20px ${p.accent}40`, borderColor: p.accent } : {}}
                                                whileTap={{ scale: canSearch ? 0.97 : 1 }}
                                                disabled={!canSearch}
                                                onClick={() => handlePlatformClick(p.slug)}
                                                style={{
                                                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                                                    padding: "16px 8px", borderRadius: 14,
                                                    background: isActive ? p.bg : "var(--input-bg)",
                                                    border: `1px solid ${isActive ? p.border : "var(--stroke)"}`,
                                                    cursor: canSearch ? "pointer" : "default", fontFamily: "var(--font)",
                                                    boxShadow: isActive ? `0 0 24px ${p.accent}35` : "none",
                                                    transition: "all 0.18s", opacity: !canSearch && !isActive ? 0.45 : 1,
                                                    position: "relative"
                                                }}
                                            >
                                                {/* Contenedor del logo con neon glow */}
                                                <div style={{
                                                    width: 44, height: 44, borderRadius: 12,
                                                    background: "var(--card)",
                                                    border: `1.5px solid ${p.accent}`,
                                                    boxShadow: `0 0 14px ${p.accent}70, inset 0 0 10px ${p.accent}25`,
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    overflow: "hidden",
                                                    flexShrink: 0
                                                }}>
                                                    <img src={`/platform-logos/${p.logoSlug}.png`} alt={p.label}
                                                        style={{ width: "100%", height: "100%", objectFit: "cover", mixBlendMode: "normal" }}
                                                        onError={e => { e.target.style.display = "none"; e.target.parentElement.textContent = p.icon; }}
                                                    />
                                                </div>
                                                <span style={{ fontSize: 12, fontWeight: 800, color: isActive ? p.accent : "var(--text)", lineHeight: 1, letterSpacing: "0.2px" }}>
                                                    {isLoading ? "..." : p.label}
                                                </span>
                                                {isLoading && <span style={{ width: 10, height: 10, borderRadius: "50%", border: `2px solid ${p.accent}40`, borderTopColor: p.accent, display: "block", animation: "spin 0.7s linear infinite", position: "absolute", bottom: 12 }} />}
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Errores */}
                            <AnimatePresence>
                                {error && (
                                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                        style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 9, padding: "10px 12px", fontSize: 12, color: "#ef4444", fontWeight: 700 }}>
                                        ❌ {error}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <AnimatePresence>{data?.ok === false && <StatusCard d={data} />}</AnimatePresence>

                            {/* Resultado exitoso */}
                            <AnimatePresence>
                                {data?.ok && (
                                    <motion.div initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
                                        style={{ background: "linear-gradient(135deg,rgba(13,166,242,0.06),rgba(99,51,255,0.06))", border: "1px solid rgba(13,166,242,0.2)", borderRadius: 12, padding: 14, boxShadow: "0 8px 28px rgba(13,166,242,0.08)" }}>
                                        {/* Badge plataforma */}
                                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
                                            <div style={{ width: 22, height: 22, borderRadius: 6, background: `${activeMeta?.accent}20`, border: `1px solid ${activeMeta?.border || "rgba(13,166,242,0.3)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>{activeMeta?.icon}</div>
                                            <span style={{ fontSize: 10, fontWeight: 800, color: activeMeta?.accent || "var(--accent)", textTransform: "uppercase", letterSpacing: "0.8px" }}>{data.platform || activeMeta?.label}</span>
                                            <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)", fontFamily: "monospace", fontWeight: 600 }}>#{data.orderNumber}</span>
                                        </div>

                                        {data.type === "approval" ? (
                                            <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 10, padding: "16px", display: "flex", flexDirection: "column", gap: 6, alignItems: "center", textAlign: "center" }}>
                                                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#10b981,#059669)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, boxShadow: "0 0 20px rgba(16,185,129,0.3)", marginBottom: 4 }}>✅</div>
                                                <div style={{ fontSize: 15, fontWeight: 800, color: "#10b981", letterSpacing: "-0.3px" }}>Dispositivo Aprobado</div>
                                                <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 600 }}>Has autorizado el inicio de sesión para:</div>
                                                <div style={{ fontSize: 13, color: "var(--accent)", fontWeight: 800, background: "rgba(13,166,242,0.1)", padding: "4px 10px", borderRadius: 6, marginTop: 4 }}>{data.deviceName || "Tu Dispositivo"}</div>
                                            </div>
                                        ) : (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                                                {data.email && <CredField label="Correo electrónico" value={data.email} icon="✉️" />}
                                                {data.code && <CredField label="Contraseña" value={data.code} icon="🔑" secret />}
                                                {data.pin && <CredField label="PIN" value={data.pin} icon="🔢" secret />}
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Aviso */}
                            <div style={{ background: "rgba(99,51,255,0.08)", border: "1px solid rgba(99,51,255,0.22)", borderRadius: 9, padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                                <span style={{ fontSize: 13, flexShrink: 0, color: "#8b5cf6" }}>ℹ</span>
                                <p style={{ margin: 0, fontSize: 11, color: "var(--muted)", lineHeight: 1.65 }}>
                                    Los códigos tienen validez mientras su suscripción esté activa. <span style={{ color: "var(--text)", fontWeight: 800 }}>1 código por pedido</span>. Si la clave cambia, podrás solicitarlo nuevamente.
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    {/* ════ DERECHA: Info panels ════ */}
                    <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.08 }}
                        style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>

                        {/* ── Cómo obtener tu código ── */}
                        <div style={{ ...S.card, padding: "18px 20px" }}>
                            {/* Header */}
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                                <div style={{ ...S.sectionIcon, background: "linear-gradient(135deg,rgba(13,166,242,0.15),rgba(99,51,255,0.15))", border: "1px solid rgba(13,166,242,0.2)" }}>📖</div>
                                <h2 style={S.sectionTitle}>¿Cómo obtener tu código?</h2>
                            </div>
                            {/* Steps — horizontal */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                                {[
                                    { n: "01", icon: "🔍", title: "Localiza tu pedido", desc: "Revisa tu correo de confirmación o en Historial de Compras.", color: "#00d4ff" },
                                    { n: "02", icon: "⌨️", title: "Ingresa el número", desc: "Escríbelo en el campo de la izquierda, elige la plataforma.", color: "#8b5cf6" },
                                    { n: "03", icon: "⚡", title: "Accede al instante", desc: "Recibirás el usuario y contraseña listos para usar.", color: "#10b981" },
                                ].map((s, i) => (
                                    <div key={i} style={{ padding: "14px 14px", background: "var(--input-bg)", border: "1px solid var(--stroke)", borderRadius: 12, position: "relative", overflow: "hidden" }}>
                                        {/* Número decorativo */}
                                        <div style={{ position: "absolute", right: 10, top: 8, fontSize: 28, fontWeight: 900, color: "rgba(13,166,242,0.06)", fontFamily: "monospace", lineHeight: 1 }}>{s.n}</div>
                                        <div style={{ width: 28, height: 28, borderRadius: 8, background: `${s.color}15`, border: `1px solid ${s.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, marginBottom: 10 }}>{s.icon}</div>
                                        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>Paso {s.n}. <span>{s.title}</span></div>
                                        <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>{s.desc}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ── FAQ ── */}
                        <div style={{ ...S.card, padding: "18px 20px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                                <div style={{ ...S.sectionIcon, background: "linear-gradient(135deg,rgba(99,51,255,0.15),rgba(13,166,242,0.15))", border: "1px solid rgba(99,51,255,0.2)" }}>❓</div>
                                <h2 style={S.sectionTitle}>Preguntas frecuentes</h2>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                                <FaqItem q="¿Qué hago si mi código no funciona?" a="Contacta a soporte de inmediato. Nuestro equipo revisará tu cuenta y te asignará un nuevo acceso a la brevedad." />
                                <FaqItem q="¿Cuánto tiempo tarda en llegar mi código?" a="Los códigos son instantáneos. Si hay un retraso, verifica el número de pedido ingresado y vuelve a intentarlo." />
                                <FaqItem q="¿Es posible renovar mi suscripción actual?" a="Sí, puedes renovar desde la sección Historial de Compras antes de que venza tu suscripción actual." />
                                <FaqItem q="¿Puedo cambiar mi contraseña?" a="No modifiques la contraseña de la cuenta compartida, ya que esto podría bloquear el acceso a otros usuarios del plan." />
                            </div>
                        </div>

                        {/* ── Soporte banner ── */}
                        <motion.div
                            style={{ ...S.card, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, position: "relative", overflow: "hidden" }}
                        >
                            {/* Fondo glow decorativo */}
                            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,rgba(13,166,242,0.04) 0%,rgba(99,51,255,0.06) 100%)", pointerEvents: "none" }} />
                            <div style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg,rgba(13,166,242,0.15),rgba(99,51,255,0.15))", border: "1px solid rgba(13,166,242,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0, boxShadow: "0 0 16px rgba(13,166,242,0.1)" }}>🚀</div>
                            <div style={{ flex: 1, position: "relative" }}>
                                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 2 }}>¿Necesitas ayuda?</div>
                                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>Nuestro equipo está disponible 24/7 para asistirte.</div>
                            </div>
                            <motion.button
                                whileHover={{ scale: 1.04, boxShadow: "0 0 24px rgba(13,166,242,0.35)" }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => navigate("/support")}
                                style={{
                                    padding: "9px 18px", borderRadius: 10, fontSize: 12, fontWeight: 800,
                                    background: "linear-gradient(135deg,var(--accent),#6333ff)",
                                    border: "none", color: "#fff", cursor: "pointer",
                                    fontFamily: "var(--font)", flexShrink: 0,
                                    boxShadow: "0 4px 16px rgba(13,166,242,0.25)",
                                    position: "relative",
                                }}
                            >
                                Ir a Soporte →
                            </motion.button>
                        </motion.div>
                    </motion.div>
                </main>
            </div>
        </div>
    );
}
