import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
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

    const location = useLocation();

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

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                <aside className="sidebar">
                    <div className="nav-title">Admin</div>
                    <p className="nav-sub">Renovaciones</p>
                    <div className="nav-item" onClick={() => navigate("/admin")}>
                        <span>Volver al panel</span><span style={{ opacity: 0.7 }}>→</span>
                    </div>
                    <div className="nav-item" onClick={() => navigate("/admin/orders")}>
                        <span>Historial de compras</span><span style={{ opacity: 0.7 }}>→</span>
                    </div>
                </aside>

                <main className="main">
                    <h1 style={{ margin: "0 0 6px" }}>🔄 Renovaciones</h1>
                    <p style={{ color: "rgba(234,241,255,.6)", marginBottom: 24 }}>
                        Busca un pedido por ID, actualiza la fecha de vencimiento y descuenta el saldo del usuario.
                    </p>

                    {/* ─── Search ─────────────────────────────── */}
                    <form onSubmit={handleSearch} style={{ display: "flex", gap: 10, marginBottom: 24 }}>
                        <input
                            className="input"
                            value={orderId}
                            onChange={e => setOrderId(e.target.value)}
                            placeholder="Número de pedido (ID)"
                            style={{ flex: 1, maxWidth: 300 }}
                            type="number"
                            min="1"
                        />
                        <button className="btn" type="submit" disabled={searching} style={{ width: "auto", padding: "0 20px" }}>
                            {searching ? "Buscando..." : "Buscar"}
                        </button>
                    </form>

                    {searchErr && <div className="error" style={{ marginBottom: 16 }}>{searchErr}</div>}

                    {/* ─── Order Info ─────────────────────────── */}
                    {order && (
                        <>
                            <div className="kpi" style={{ padding: 20, marginBottom: 20 }}>
                                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 14 }}>
                                    Pedido #{order.id}
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
                                    {[
                                        ["Usuario", order.user_email],
                                        ["Plataforma", order.platform_name],
                                        ["Duración", `${order.duration_name} (${order.days} días)`],
                                        ["Precio original", `${Number(order.price).toLocaleString("es-CO")} ${order.currency}`],
                                        ["Estado", <span style={{ color: STATUS_COLORS[order.status] }}>{STATUS_LABELS[order.status] || order.status}</span>],
                                        ["Vence", <span style={{ color: expiryColor }}>{order.expires_at ? new Date(order.expires_at).toLocaleDateString("es-CO") : "—"}</span>],
                                        ["Cuenta actual", order.account_email || "—"],
                                    ].map(([label, val]) => (
                                        <div key={label}>
                                            <div style={{ color: "rgba(234,241,255,.55)", fontSize: 11 }}>{label}</div>
                                            <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{val}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* ─── Renewal Form ───────────────────── */}
                            {result ? (
                                <div className="kpi" style={{ padding: 20, borderColor: "rgba(16,185,129,.4)" }}>
                                    <div style={{ fontWeight: 900, fontSize: 15, color: "#10b981", marginBottom: 12 }}>
                                        ✅ Renovación exitosa
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                                        {[
                                            ["Nuevo vencimiento", new Date(result.newExpiry).toLocaleString("es-CO")],
                                            ["Monto descontado", result.deducted > 0 ? `${Number(result.deducted).toLocaleString("es-CO")}` : "Sin descuento"],
                                            ...(result.newBalance !== null ? [["Nuevo saldo usuario", `${Number(result.newBalance).toLocaleString("es-CO")}`]] : []),
                                        ].map(([label, val]) => (
                                            <div key={label}>
                                                <div style={{ color: "rgba(234,241,255,.55)", fontSize: 11 }}>{label}</div>
                                                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{val}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {result.whatsappText && (
                                        <div style={{ marginTop: 20 }}>
                                            <div style={{ color: "rgba(234,241,255,.55)", fontSize: 11, marginBottom: 4 }}>
                                                Mensaje para el cliente
                                            </div>
                                            <textarea
                                                className="input"
                                                readOnly
                                                value={result.whatsappText}
                                                style={{ width: "100%", height: 180, resize: "vertical", fontFamily: "monospace", fontSize: 13 }}
                                            />
                                            <button
                                                className="btn"
                                                style={{ marginTop: 8, padding: "6px 16px", fontSize: 12, width: "auto" }}
                                                onClick={() => navigator.clipboard.writeText(result.whatsappText)}
                                            >
                                                📋 Copiar Mensaje
                                            </button>
                                        </div>
                                    )}

                                    <button className="btn-ghost" style={{ marginTop: 20, width: "auto", padding: "0 16px" }}
                                        onClick={() => { setResult(null); setOrder(null); setOrderId(""); }}>
                                        Renovar otro pedido
                                    </button>
                                </div>
                            ) : (
                                <div className="kpi" style={{ padding: 20 }}>
                                    <div style={{ fontWeight: 900, marginBottom: 16 }}>Configurar Renovación</div>
                                    <form onSubmit={handleRenew}>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>

                                            {/* Nueva cuenta */}
                                            <div>
                                                <label style={{ display: "block", fontSize: 12, color: "rgba(234,241,255,.7)", marginBottom: 6 }}>
                                                    Nueva cuenta (opcional)
                                                </label>
                                                <select className="input" style={{ width: "100%", padding: "8px 10px" }}
                                                    value={newAccountId} onChange={e => setNewAccountId(e.target.value)}>
                                                    <option value="">Mantener cuenta actual</option>
                                                    {accounts.map(a => (
                                                        <option key={a.id} value={a.id}>#{a.id} — {a.email} {a.profile_number ? `P${a.profile_number}` : ""}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Monto a descontar */}
                                            <div>
                                                <label style={{ display: "block", fontSize: 12, color: "rgba(234,241,255,.7)", marginBottom: 6 }}>
                                                    Monto a descontar
                                                </label>
                                                <input className="input" type="number" min="0" style={{ width: "100%", padding: "8px 10px" }}
                                                    value={overridePrice} onChange={e => setOverridePrice(e.target.value)}
                                                    placeholder={order.price} />
                                            </div>

                                            {/* Nota */}
                                            <div>
                                                <label style={{ display: "block", fontSize: 12, color: "rgba(234,241,255,.7)", marginBottom: 6 }}>
                                                    Nota (transacción)
                                                </label>
                                                <input className="input" type="text" style={{ width: "100%", padding: "8px 10px" }}
                                                    value={note} onChange={e => setNote(e.target.value)}
                                                    placeholder="Renovación..." />
                                            </div>
                                        </div>

                                        {/* Deduct checkbox */}
                                        <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, cursor: "pointer" }}>
                                            <input type="checkbox" checked={deductWallet} onChange={e => setDeductWallet(e.target.checked)}
                                                style={{ width: 16, height: 16, accentColor: "#3b82f6" }} />
                                            <span style={{ fontSize: 13 }}>Descontar saldo de la billetera del usuario</span>
                                        </label>

                                        {renewErr && <div className="error" style={{ marginTop: 12 }}>{renewErr}</div>}

                                        <button className="btn" type="submit" disabled={renewing}
                                            style={{ marginTop: 20, width: "auto", padding: "0 28px" }}>
                                            {renewing ? "Renovando..." : "🔄 Confirmar Renovación"}
                                        </button>
                                    </form>
                                </div>
                            )}
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}
