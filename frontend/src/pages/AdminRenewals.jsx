import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiLogout } from "../api/api";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
const LOGO_URL = "/api/branding/logo";

function buildUrl(path) {
    const base = String(API_BASE).replace(/\/+$/, "");
    if (base.endsWith("/api") && path.startsWith("/api/")) path = path.slice(4);
    return `${base}${path}`;
}

async function apiFetch(path, opts = {}) {
    const res = await fetch(buildUrl(path), {
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
        ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Error en la solicitud");
    return data;
}

const STATUS_LABELS = { active: "Activo", expired: "Vencido", cancelled: "Cancelado" };
const STATUS_COLORS = { active: "#10b981", expired: "#ef4444", cancelled: "#6b7280" };

export default function AdminRenewals() {
    const navigate = useNavigate();
    const location = useLocation();

    const { user, setUser } = useAuth();

    async function logout() {
        try { await apiLogout(); } catch (e) { console.error(e); }
        setUser(null);
        try {
            localStorage.removeItem("user");
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
        } catch { }
        navigate("/", { replace: true });
    }

    // Search
    const [orderId, setOrderId] = useState("");
    const [order, setOrder] = useState(null);
    const [accounts, setAccounts] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searchErr, setSearchErr] = useState("");

    // Renewal form
    const [newAccountId, setNewAccountId] = useState("");
    const [deductWallet, setDeductWallet] = useState(true);
    const [overridePrice, setOverridePrice] = useState("");
    const [note, setNote] = useState("");

    // Result
    const [result, setResult] = useState(null);
    const [renewing, setRenewing] = useState(false);
    const [renewErr, setRenewErr] = useState("");

    // On mount, if orderId is passed via state, auto-fetch
    useEffect(() => {
        if (location.state?.orderId) {
            const id = String(location.state.orderId);
            setOrderId(id);
            performSearch(id);
        }
    }, [location.state]);

    async function handleSearch(e) {
        e.preventDefault();
        performSearch(orderId.trim());
    }

    async function performSearch(id) {
        if (!id) return;
        setSearching(true);
        setSearchErr("");
        setOrder(null);
        setResult(null);
        setRenewErr("");
        try {
            const data = await apiFetch(`/admin/orders/${id}`);
            setOrder(data);
            setOverridePrice(String(data.price || ""));
            setNote(`Renovación pedido #${id}`);

            // Load available accounts for that platform
            const acc = await apiFetch(`/admin/accounts?platformId=${data.platform_id}&available=1&limit=200`).catch(() => ({ items: [] }));
            setAccounts(acc.items || []);
            setNewAccountId("");
        } catch (e) {
            setSearchErr(e.message);
        } finally {
            setSearching(false);
        }
    }

    async function handleRenew(e) {
        e.preventDefault();
        setRenewing(true);
        setRenewErr("");
        setResult(null);
        try {
            const body = {
                deductWallet,
                note: note || undefined,
                ...(newAccountId ? { newAccountId: Number(newAccountId) } : {}),
                ...(overridePrice !== "" ? { overridePrice: Number(overridePrice) } : {}),
            };
            const data = await apiFetch(`/admin/orders/${order.id}/renew`, {
                method: "POST",
                body: JSON.stringify(body),
            });
            setResult(data);
        } catch (e) {
            setRenewErr(e.message);
        } finally {
            setRenewing(false);
        }
    }

    const expiryColor = order?.expires_at
        ? new Date(order.expires_at) < new Date() ? "#ef4444" : "#10b981"
        : "#aaa";

    const inputStyle = {
        appearance: "none", WebkitAppearance: "none",
        height: 44, padding: "0 16px",
        background: "var(--input-bg)", color: "var(--text)",
        border: "1px solid var(--stroke)", borderRadius: 12,
        fontSize: 14, fontWeight: 500, outline: "none", width: "100%", fontFamily: "var(--font)",
        transition: "border-color 0.2s, box-shadow 0.2s"
    };

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                <AdminSidebar
                    user={user}
                    logoSrc={LOGO_URL}
                    logoOk={true}
                    setLogoOk={() => { }}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main" style={{ padding: "20px 24px 32px" }}>
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, gap: 20, flexWrap: "wrap", borderBottom: "1px solid var(--stroke)", paddingBottom: 24 }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            {/* Icon badge */}
                            <div style={{
                                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                                background: "rgba(13,166,242,0.1)",
                                border: "1px solid rgba(13,166,242,0.3)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 24, boxShadow: "0 4px 16px rgba(13,166,242,0.2)",
                            }}>
                                🔄
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" }}>
                                    Renovaciones de Servicios
                                </h1>
                                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
                                    Busca un pedido por ID, actualiza la fecha de vencimiento y descuentos del saldo.
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    {/* ─── Search ─────────────────────────────── */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "20px", marginBottom: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}
                    >
                        <form onSubmit={handleSearch} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                            <div style={{ position: "relative", flex: 1, minWidth: 280, maxWidth: 400 }}>
                                <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 16, opacity: 0.6 }}>🔍</span>
                                <input
                                    value={orderId}
                                    onChange={e => setOrderId(e.target.value)}
                                    placeholder="Número de pedido (ID)"
                                    style={{ ...inputStyle, paddingLeft: 44 }}
                                    type="number"
                                    min="1"
                                />
                            </div>
                            <button type="submit" disabled={searching} style={{ height: 44, padding: "0 28px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #0da6f2 0%, #8b5cf6 100%)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 4px 16px rgba(13,166,242,0.3)", transition: "opacity 0.2s" }}>
                                {searching ? "Buscando..." : "Buscar"}
                            </button>
                        </form>
                        {searchErr && <div style={{ marginTop: 16, color: "#ef4444", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                            <span>⚠️</span> {searchErr}
                        </div>}
                    </motion.div>

                    {/* ─── Order Info ─────────────────────────── */}
                    {order && (
                        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 }}>
                            <div style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "24px", marginBottom: 20, boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--stroke2)" }}>
                                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ color: "#0da6f2" }}>ID Pedido:</span> #{order.id}
                                    </h2>
                                    <div style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800, background: `${STATUS_COLORS[order.status]}20`, color: STATUS_COLORS[order.status], border: `1px solid ${STATUS_COLORS[order.status]}40` }}>
                                        {STATUS_LABELS[order.status] || order.status}
                                    </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
                                    {[
                                        ["Usuario", order.user_email],
                                        ["Plataforma", order.platform_name],
                                        ["Duración", `${order.duration_name} (${order.days} días)`],
                                        ["Precio", `${Number(order.price).toLocaleString("es-CO")} ${order.currency}`],
                                        ["Vencimiento", <span style={{ color: expiryColor, fontWeight: 800 }}>{order.expires_at ? new Date(order.expires_at).toLocaleDateString("es-CO") : "—"}</span>],
                                        ["Acreditación", order.account_email || "Usuario Local"],
                                    ].map(([label, val]) => (
                                        <div key={label}>
                                            <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
                                            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{val}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* ─── Renewal Form ───────────────────── */}
                            {result ? (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ background: "var(--card)", border: "1px solid rgba(16,185,129,.4)", borderRadius: 16, padding: "24px", boxShadow: "0 10px 40px rgba(16,185,129,0.1)" }}>
                                    <div style={{ fontWeight: 900, fontSize: 18, color: "#10b981", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                                        ✅ Renovación Procesada
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
                                        {[
                                            ["Nuevo Vencimiento", new Date(result.newExpiry).toLocaleString("es-CO")],
                                            ["Monto Cobrado", result.deducted > 0 ? `$${Number(result.deducted).toLocaleString("es-CO")}` : "0"],
                                            ...(result.newBalance !== null ? [["Saldo del Usuario", `$${Number(result.newBalance).toLocaleString("es-CO")}`]] : []),
                                        ].map(([label, val]) => (
                                            <div key={label}>
                                                <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 4 }}>{label}</div>
                                                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{val}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {result.whatsappText && (
                                        <div style={{ marginTop: 24 }}>
                                            <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8, fontWeight: 500 }}>
                                                Notificación para el cliente (WhatsApp)
                                            </div>
                                            <div style={{ position: "relative" }}>
                                                <textarea
                                                    readOnly
                                                    value={result.whatsappText}
                                                    style={{ ...inputStyle, height: 160, padding: 16, resize: "none", fontFamily: "monospace", fontSize: 13, background: "var(--input-bg)" }}
                                                />
                                                <button
                                                    onClick={() => navigator.clipboard.writeText(result.whatsappText)}
                                                    style={{ position: "absolute", bottom: 12, right: 12, padding: "6px 14px", background: "var(--stroke)", border: "1px solid var(--stroke)", borderRadius: 8, color: "var(--text)", fontSize: 12, cursor: "pointer", backdropFilter: "blur(4px)" }}
                                                >
                                                    📋 Copiar Mensaje
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--stroke2)" }}>
                                        <button style={{ height: 44, padding: "0 24px", borderRadius: 12, border: "1px solid var(--stroke)", background: "var(--bg0)", color: "var(--text)", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "background 0.2s" }}
                                            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                                            onMouseLeave={e => e.currentTarget.style.background = "var(--bg0)"}
                                            onClick={() => { setResult(null); setOrder(null); setOrderId(""); }}>
                                            ← Realizar otra renovación
                                        </button>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}>
                                    <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 20, color: "var(--text)" }}>Configurar Renovación</div>
                                    <form onSubmit={handleRenew}>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>

                                            {/* Nueva cuenta */}
                                            <div>
                                                <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 8, fontWeight: 500 }}>
                                                    Actualizar Cuenta Asignada (Opcional)
                                                </label>
                                                <div style={{ position: "relative" }}>
                                                    <select style={{ ...inputStyle, cursor: "pointer", appearance: "none", WebkitAppearance: "none", paddingRight: 36 }}
                                                        value={newAccountId} onChange={e => setNewAccountId(e.target.value)}>
                                                        <option value="" style={{ background: "var(--input-bg)", color: "var(--text)" }}>Mantener asignación actual</option>
                                                        {accounts.map(a => (
                                                            <option key={a.id} value={a.id} style={{ background: "var(--input-bg)", color: "var(--text)" }}>#{a.id} - {a.email} {a.profile_number ? `P${a.profile_number}` : ""}</option>
                                                        ))}
                                                    </select>
                                                    <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                                                </div>
                                            </div>

                                            {/* Monto a descontar */}
                                            <div>
                                                <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 8, fontWeight: 500 }}>
                                                    Modificar Cobro (Opcional)
                                                </label>
                                                <div style={{ position: "relative" }}>
                                                    <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 14 }}>$</span>
                                                    <input style={{ ...inputStyle, paddingLeft: 30 }} type="number" min="0" step="any"
                                                        value={overridePrice} onChange={e => setOverridePrice(e.target.value)}
                                                        placeholder={order.price} />
                                                </div>
                                            </div>

                                            {/* Nota */}
                                            <div style={{ gridColumn: "1 / -1" }}>
                                                <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 8, fontWeight: 500 }}>
                                                    Nota Interna / Razón
                                                </label>
                                                <input style={inputStyle} type="text"
                                                    value={note} onChange={e => setNote(e.target.value)}
                                                    placeholder="Detalles sobre la renovación..." />
                                            </div>
                                        </div>

                                        {/* Deduct checkbox */}
                                        <div style={{ marginTop: 24, padding: "16px", borderRadius: 12, background: "var(--input-bg)", border: "1px solid var(--stroke2)", display: "flex", alignItems: "center", gap: 12 }}>
                                            <label style={{ position: "relative", display: "inline-block", width: 44, height: 24 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={deductWallet}
                                                    onChange={e => setDeductWallet(e.target.checked)}
                                                    style={{ opacity: 0, width: 0, height: 0 }}
                                                />
                                                <span style={{
                                                    position: "absolute", cursor: "pointer", top: 0, left: 0, right: 0, bottom: 0,
                                                    backgroundColor: deductWallet ? "var(--accent)" : "var(--stroke)",
                                                    transition: ".4s", borderRadius: 24,
                                                    boxShadow: deductWallet ? "0 0 10px var(--accent-glow)" : "none"
                                                }}>
                                                    <span style={{
                                                        position: "absolute", height: 18, width: 18, left: 3, bottom: 3,
                                                        backgroundColor: "white", transition: ".4s", borderRadius: "50%",
                                                        transform: deductWallet ? "translateX(20px)" : "translateX(0)"
                                                    }}></span>
                                                </span>
                                            </label>
                                            <div style={{ display: "flex", flexDirection: "column" }}>
                                                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Descontar saldo de la billetera</span>
                                                <span style={{ fontSize: 12, color: "var(--muted)" }}>El monto de renovación será restado del crédito del usuario.</span>
                                            </div>
                                        </div>

                                        {renewErr && <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, color: "#ef4444", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                                            <span>⚠️</span> {renewErr}
                                        </div>}

                                        <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
                                            <button type="submit" disabled={renewing}
                                                style={{ height: 48, padding: "0 32px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #0da6f2 0%, #8b5cf6 100%)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: renewing ? "not-allowed" : "pointer", boxShadow: "0 4px 16px rgba(13,166,242,0.3)", transition: "opacity 0.2s, transform 0.1s", opacity: renewing ? 0.7 : 1 }}>
                                                {renewing ? "Procesando Renovación..." : "Confirmar Renovación"}
                                            </button>
                                        </div>
                                    </form>
                                </motion.div>
                            )}
                        </motion.div>
                    )}
                </main>
            </div>
        </div>
    );
}

