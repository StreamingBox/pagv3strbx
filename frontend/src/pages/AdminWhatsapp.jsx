import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import { apiLogout } from "../api/api";
import { useAuth } from "../context/AuthContext.jsx";
import "../styles/special-effects.css";

export default function AdminWhatsapp() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();

    const [token, setToken] = useState("");
    const [preview, setPreview] = useState("");
    const [hasToken, setHasToken] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState(null);
    const [showToken, setShowToken] = useState(false);
    const [webhookSecret, setWebhookSecret] = useState("");
    const [webhookPreview, setWebhookPreview] = useState("");
    const [webhookSource, setWebhookSource] = useState("none");
    const [hasWebhookSecret, setHasWebhookSecret] = useState(false);
    const [savingWebhook, setSavingWebhook] = useState(false);
    const [showWebhookSecret, setShowWebhookSecret] = useState(false);
    const [webhookMsg, setWebhookMsg] = useState(null);

    // Estado para prueba de envío
    const [testPhone, setTestPhone] = useState("");
    const [testSending, setTestSending] = useState(false);
    const [testResult, setTestResult] = useState(null);

    useEffect(() => { fetchToken(); fetchWebhookSecret(); }, []);

    async function fetchToken() {
        setLoading(true);
        try {
            const r = await fetch("/api/admin/whatsapp/token", { credentials: "include" });
            const d = await r.json();
            if (d.ok) { setPreview(d.preview || ""); setHasToken(d.hasToken || false); }
        } catch { setMsg({ type: "err", text: "Error al conectar con el servidor." }); }
        finally { setLoading(false); }
    }

    async function fetchWebhookSecret() {
        try {
            const r = await fetch("/api/admin/whatsapp/webhook-secret", { credentials: "include" });
            const d = await r.json();
            if (d.ok) {
                setWebhookPreview(d.preview || "");
                setHasWebhookSecret(!!d.hasSecret);
                setWebhookSource(d.source || "none");
            }
        } catch { setWebhookMsg({ type: "err", text: "Error al leer el webhook secret." }); }
    }

    async function handleSave(e) {
        e.preventDefault();
        if (!token.trim()) return;
        setSaving(true); setMsg(null);
        try {
            const r = await fetch("/api/admin/whatsapp/token", {
                method: "PUT", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: token.trim() }),
            });
            const d = await r.json();
            if (d.ok) { setMsg({ type: "ok", text: "✅ Token guardado correctamente." }); setToken(""); fetchToken(); }
            else { setMsg({ type: "err", text: d.message || "Error al guardar." }); }
        } catch { setMsg({ type: "err", text: "Error de red al guardar el token." }); }
        finally { setSaving(false); }
    }

    async function handleSaveWebhookSecret(e) {
        e.preventDefault();
        if (!webhookSecret.trim()) return;
        setSavingWebhook(true); setWebhookMsg(null);
        try {
            const r = await fetch("/api/admin/whatsapp/webhook-secret", {
                method: "PUT", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ secret: webhookSecret.trim() }),
            });
            const d = await r.json();
            if (d.ok) {
                setWebhookMsg({ type: "ok", text: "Webhook secret guardado correctamente." });
                setWebhookSecret("");
                fetchWebhookSecret();
            } else {
                setWebhookMsg({ type: "err", text: d.message || "Error al guardar webhook secret." });
            }
        } catch { setWebhookMsg({ type: "err", text: "Error de red al guardar webhook secret." }); }
        finally { setSavingWebhook(false); }
    }

    async function handleTestSend(e) {
        e.preventDefault();
        if (!testPhone.trim()) return;
        setTestSending(true); setTestResult(null);
        let to = testPhone.trim().replace(/\s|-/g, "");
        if (!to.startsWith("+")) to = "+" + to;
        try {
            const r = await fetch("/api/whatsapp/send", {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ to, text: "🔔 *Mensaje de prueba — Streaming Box*\n\nEsta es una prueba de conexión desde el panel admin. Si recibes este mensaje, la integración está funcionando correctamente.\n\n---\n⚠️ Este es un mensaje automático. Por favor NO respondas." }),
            });
            const d = await r.json();
            setTestResult({ ok: d.ok, text: d.ok ? `✅ Mensaje de prueba enviado a ${to}` : (d.message || "Error al enviar") });
        } catch { setTestResult({ ok: false, text: "Error de red." }); }
        finally { setTestSending(false); }
    }

    async function logout() {
        try { await apiLogout(); } catch { }
        setUser(null);
        try { localStorage.removeItem("user"); localStorage.removeItem("accessToken"); localStorage.removeItem("refreshToken"); } catch { }
        navigate("/", { replace: true });
    }

    const STEPS = [
        { num: "1", icon: "🛒", title: "El usuario agrega al carrito", desc: "El cliente selecciona el servicio que desea comprar." },
        { num: "2", icon: "📲", title: "Activa el envío al WhatsApp", desc: "Dentro del carrito hay un toggle para activar el envío automático e ingresar el número." },
        { num: "3", icon: "💳", title: "Finaliza la compra", desc: "Al hacer clic en 'Finalizar compra', el pago se procesa y las credenciales se envían al instante." },
        { num: "4", icon: "✅", title: "Credenciales recibidas", desc: "El cliente recibe usuario, contraseña y detalles directamente en su WhatsApp." },
    ];

    const isConnected = hasToken && hasWebhookSecret;
    const statusLabel = loading ? "Verificando..." : isConnected ? "Conectado" : hasToken ? "Falta webhook" : "Sin configurar";
    const statusColor = loading ? "#f59e0b" : isConnected ? "#22c55e" : "#ef4444";

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden>
            <div className="bg-grid" />
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            </div>

            <div className="page-inner">
                <AdminSidebar
                    user={user} logoSrc="/api/branding/logo" logoOk={true}
                    setLogoOk={() => { }} uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main" style={{ padding: "20px 24px 40px" }}>

                    {/* ── Header ── */}
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid var(--stroke)", flexWrap: "wrap", gap: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg, rgba(37,211,102,0.18), rgba(18,140,126,0.18))", border: "1px solid rgba(37,211,102,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 4px 16px rgba(37,211,102,0.2)", flexShrink: 0 }}>💬</div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" }}>WhatsApp API</h1>
                                <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--muted)" }}>Envío automático de credenciales vía WaSender · <a href="https://wasenderapi.com" target="_blank" rel="noopener noreferrer" style={{ color: "#25d366" }}>wasenderapi.com</a></p>
                            </div>
                        </div>

                        {/* Status Badge */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 30, background: isConnected ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${isConnected ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}` }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, boxShadow: isConnected ? "0 0 8px rgba(34,197,94,0.7)" : "none" }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>
                                {statusLabel}
                            </span>
                        </div>
                    </motion.div>

                    {/* ── Grid principal ── */}
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18, marginBottom: 20 }}>

                        {/* Card 1: Token actual */}
                        <div className="stitch-beam-container" style={{ "--beam-color": hasToken ? "#10b981" : "#ef4444" }}>
                            <div className="stitch-beam-content" style={{ padding: "22px 24px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "inherit", height: "100%", boxSizing: "border-box" }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>Estado del Token</div>

                                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ width: 44, height: 44, borderRadius: 12, background: hasToken ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.10)", border: `1px solid ${hasToken ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.25)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                                            {loading ? "⏳" : hasToken ? "🔑" : "🚫"}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text)" }}>
                                                {loading ? "Verificando..." : hasToken ? "Token configurado" : "Sin token"}
                                            </div>
                                            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                                                {hasToken ? "WaSender API activa" : "Configura para activar"}
                                            </div>
                                        </div>
                                    </div>

                                    {!loading && hasToken && preview && (
                                        <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(0,0,0,0.2)", border: "1px solid var(--stroke)" }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Token actual</div>
                                            <div style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text)", wordBreak: "break-all" }}>{preview}</div>
                                        </div>
                                    )}

                                    {!loading && !hasToken && (
                                        <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 12, color: "#ef4444", fontWeight: 600 }}>
                                            ⚠️ Los mensajes de WhatsApp no se enviarán hasta configurar el token.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Card 2: Configurar Token */}
                        <div className="stitch-beam-container" style={{ "--beam-color": "#25d366" }}>
                            <div className="stitch-beam-content" style={{ padding: "22px 24px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "inherit", height: "100%", boxSizing: "border-box" }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>
                                    {hasToken ? "Actualizar Token" : "Configurar Token"}
                                </div>

                                <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                            Personal Access Token
                                        </label>
                                        <div style={{ position: "relative" }}>
                                            <input
                                                type={showToken ? "text" : "password"}
                                                placeholder="Pega tu token de WaSender..."
                                                value={token}
                                                onChange={e => setToken(e.target.value)}
                                                required minLength={10}
                                                style={{ width: "100%", padding: "10px 42px 10px 12px", borderRadius: 10, border: "1px solid var(--stroke)", background: "var(--input-bg)", color: "var(--text)", fontSize: 13, fontFamily: "monospace", boxSizing: "border-box", outline: "none" }}
                                                onFocus={e => e.target.style.borderColor = "#25d366"}
                                                onBlur={e => e.target.style.borderColor = "var(--stroke)"}
                                            />
                                            <button type="button" onClick={() => setShowToken(v => !v)}
                                                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--muted)", padding: 0 }}>
                                                {showToken ? "🙈" : "👁️"}
                                            </button>
                                        </div>
                                    </div>

                                    <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                                        Obtén el token en <a href="https://wasenderapi.com" target="_blank" rel="noopener noreferrer" style={{ color: "#25d366", fontWeight: 600 }}>wasenderapi.com</a> → Settings → Personal Access Token.
                                    </p>

                                    {msg && (
                                        <div style={{ padding: "9px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: msg.type === "ok" ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)", color: msg.type === "ok" ? "#22c55e" : "#ef4444", border: `1px solid ${msg.type === "ok" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}` }}>
                                            {msg.text}
                                        </div>
                                    )}

                                    <button type="submit" disabled={saving || !token.trim()} className="btn"
                                        style={{ padding: "10px 0", width: "100%", background: "linear-gradient(135deg, #25d366, #128c7e)", border: "none", fontWeight: 700, fontSize: 13 }}>
                                        {saving ? "Guardando..." : "💾 Guardar token"}
                                    </button>
                                </form>
                            </div>
                        </div>

                        {/* Card 3: Configurar Webhook Secret */}
                        <div className="stitch-beam-container" style={{ "--beam-color": hasWebhookSecret ? "#22c55e" : "#f59e0b" }}>
                            <div className="stitch-beam-content" style={{ padding: "22px 24px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "inherit", height: "100%", boxSizing: "border-box" }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>
                                    Webhook Secret
                                </div>

                                <form onSubmit={handleSaveWebhookSecret} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                    {hasWebhookSecret && webhookPreview && (
                                        <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(0,0,0,0.2)", border: "1px solid var(--stroke)" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 4 }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Secret activo</div>
                                                <div style={{ fontSize: 10, color: webhookSource === "database" ? "#22c55e" : "#f59e0b", fontWeight: 700 }}>
                                                    {webhookSource === "database" ? "Panel" : "Env"}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text)", wordBreak: "break-all" }}>{webhookPreview}</div>
                                        </div>
                                    )}

                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                            Webhook Secret
                                        </label>
                                        <div style={{ position: "relative" }}>
                                            <input
                                                type={showWebhookSecret ? "text" : "password"}
                                                placeholder="Pega tu webhook secret de WaSender..."
                                                value={webhookSecret}
                                                onChange={e => setWebhookSecret(e.target.value)}
                                                required minLength={10}
                                                style={{ width: "100%", padding: "10px 42px 10px 12px", borderRadius: 10, border: "1px solid var(--stroke)", background: "var(--input-bg)", color: "var(--text)", fontSize: 13, fontFamily: "monospace", boxSizing: "border-box", outline: "none" }}
                                                onFocus={e => e.target.style.borderColor = "#22c55e"}
                                                onBlur={e => e.target.style.borderColor = "var(--stroke)"}
                                            />
                                            <button type="button" onClick={() => setShowWebhookSecret(v => !v)}
                                                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--muted)", padding: 0 }}>
                                                {showWebhookSecret ? "🙈" : "👁️"}
                                            </button>
                                        </div>
                                    </div>

                                    <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                                        Este valor se compara contra el header <b>X-Webhook-Signature</b> que envia WaSender al webhook.
                                    </p>

                                    {webhookMsg && (
                                        <div style={{ padding: "9px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: webhookMsg.type === "ok" ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)", color: webhookMsg.type === "ok" ? "#22c55e" : "#ef4444", border: `1px solid ${webhookMsg.type === "ok" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}` }}>
                                            {webhookMsg.text}
                                        </div>
                                    )}

                                    <button type="submit" disabled={savingWebhook || !webhookSecret.trim()} className="btn"
                                        style={{ padding: "10px 0", width: "100%", background: "linear-gradient(135deg, #22c55e, #128c7e)", border: "none", fontWeight: 700, fontSize: 13 }}>
                                        {savingWebhook ? "Guardando..." : "Guardar webhook secret"}
                                    </button>
                                </form>
                            </div>
                        </div>

                        {/* Card 4: Probar envío */}
                        <div className="stitch-beam-container" style={{ "--beam-color": "#0da6f2" }}>
                            <div className="stitch-beam-content" style={{ padding: "22px 24px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "inherit", height: "100%", boxSizing: "border-box" }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>Probar Conexión</div>

                                <form onSubmit={handleTestSend} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                            Número de prueba
                                        </label>
                                        <input
                                            type="tel"
                                            placeholder="573001234567"
                                            value={testPhone}
                                            onChange={e => setTestPhone(e.target.value)}
                                            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--stroke)", background: "var(--input-bg)", color: "var(--text)", fontSize: 13, boxSizing: "border-box", outline: "none" }}
                                            onFocus={e => e.target.style.borderColor = "#0da6f2"}
                                            onBlur={e => e.target.style.borderColor = "var(--stroke)"}
                                            required
                                        />
                                    </div>

                                    <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                                        Envía un mensaje de prueba para confirmar que la integración funciona correctamente.
                                    </p>

                                    {testResult && (
                                        <div style={{ padding: "9px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: testResult.ok ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)", color: testResult.ok ? "#22c55e" : "#ef4444", border: `1px solid ${testResult.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}` }}>
                                            {testResult.text}
                                        </div>
                                    )}

                                    <button type="submit" disabled={testSending || !hasToken || !testPhone.trim()} className="btn"
                                        style={{ padding: "10px 0", width: "100%", fontWeight: 700, fontSize: 13, opacity: !hasToken ? 0.5 : 1 }}>
                                        {testSending ? "Enviando..." : "📤 Enviar mensaje de prueba"}
                                    </button>
                                    {!hasToken && <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>Configura el token primero</div>}
                                </form>
                            </div>
                        </div>
                    </motion.div>

                    {/* ── Flujo de envío ── */}
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid var(--line)", opacity: 0.8 }}>
                            Cómo funciona el flujo
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                            {STEPS.map((step, i) => (
                                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.06 }}
                                    className="stitch-beam-container" style={{ "--beam-color": "#25d366" }}>
                                    <div className="stitch-beam-content" style={{ padding: "18px 20px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "inherit", display: "flex", flexDirection: "column", gap: 10 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg, rgba(37,211,102,0.2), rgba(18,140,126,0.15))", border: "1px solid rgba(37,211,102,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: "#25d366", flexShrink: 0 }}>{step.num}</div>
                                            <span style={{ fontSize: 20 }}>{step.icon}</span>
                                        </div>
                                        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{step.title}</div>
                                        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{step.desc}</div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>

                </main>
            </div>
        </div>
    );
}
