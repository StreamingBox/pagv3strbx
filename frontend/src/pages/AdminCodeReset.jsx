import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import { apiGet, apiPost } from "../api/api";
import { useAuth } from "../context/AuthContext.jsx";
import useAppLogout from "../hooks/useAppLogout.js";
import "../styles/special-effects.css";

function fmtDate(value) {
    if (!value) return "-";
    try {
        return new Date(value).toLocaleString("es-CO", {
            timeZone: "America/Bogota",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return String(value);
    }
}

function CountCard({ label, value, tone = "#0da6f2" }) {
    return (
        <div style={{
            background: "var(--bg0)",
            border: "1px solid var(--stroke)",
            borderRadius: 14,
            padding: "14px 16px",
            minHeight: 78,
        }}>
            <div style={{
                fontSize: 10,
                fontWeight: 900,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: ".7px",
                marginBottom: 8,
            }}>
                {label}
            </div>
            <div style={{ color: tone, fontWeight: 950, fontSize: 26, lineHeight: 1 }}>
                {Number(value || 0).toLocaleString("es-CO")}
            </div>
        </div>
    );
}

function DetailItem({ label, value }) {
    return (
        <div style={{
            background: "rgba(255,255,255,.035)",
            border: "1px solid var(--stroke)",
            borderRadius: 12,
            padding: "12px 14px",
            minWidth: 0,
        }}>
            <div style={{
                fontSize: 10,
                fontWeight: 900,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: ".7px",
                marginBottom: 6,
            }}>
                {label}
            </div>
            <div style={{
                color: "var(--text)",
                fontWeight: 800,
                fontSize: 13,
                wordBreak: "break-word",
            }}>
                {value || "-"}
            </div>
        </div>
    );
}

export default function AdminCodeReset() {
    const navigate = useNavigate();
    const logout = useAppLogout();
    const { user } = useAuth();

    const [orderNumber, setOrderNumber] = useState("");
    const [note, setNote] = useState("");
    const [snapshot, setSnapshot] = useState(null);
    const [loading, setLoading] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [message, setMessage] = useState(null);

    async function lookup(event) {
        event?.preventDefault();
        const clean = String(orderNumber || "").trim();
        if (!clean) {
            setMessage({ type: "error", text: "Escribe el numero de pedido." });
            return;
        }

        setLoading(true);
        setMessage(null);
        setSnapshot(null);
        try {
            const res = await apiGet(`/admin/code-resets/${encodeURIComponent(clean)}`);
            if (!res.ok || !res.data?.ok) {
                setMessage({ type: "error", text: res.data?.message || "No se pudo consultar el pedido." });
                return;
            }
            setSnapshot(res.data);
        } catch (err) {
            setMessage({ type: "error", text: err?.message || "Error consultando el pedido." });
        } finally {
            setLoading(false);
        }
    }

    async function resetCounter() {
        if (!snapshot?.order?.subscriptionId) return;

        setResetting(true);
        setMessage(null);
        try {
            const res = await apiPost("/admin/code-resets", {
                orderNumber: snapshot.order.subscriptionId,
                note,
            });
            if (!res.ok || !res.data?.ok) {
                setMessage({ type: "error", text: res.data?.message || "No se pudo reiniciar el contador." });
                return;
            }
            setSnapshot(res.data);
            setNote("");
            setMessage({ type: "success", text: "Contador reiniciado. El cliente puede volver a solicitar codigo segun la regla normal." });
        } catch (err) {
            setMessage({ type: "error", text: err?.message || "Error reiniciando el contador." });
        } finally {
            setResetting(false);
        }
    }

    const order = snapshot?.order || null;
    const counts = snapshot?.counts || {};
    const messageColor = message?.type === "success" ? "#10b981" : "#ef4444";

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden>
                <div className="bg-grid" />
                <div className="bg-orb orb-1" />
                <div className="bg-orb orb-2" />
            </div>

            <div className="page-inner">
                <AdminSidebar
                    user={user}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                    onNavigate={navigate}
                />

                <main className="main" style={{ gap: 20 }}>
                    <div className="admin-page-header">
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{
                                width: 48,
                                height: 48,
                                borderRadius: 14,
                                background: "linear-gradient(135deg, rgba(13,166,242,.22), rgba(99,51,255,.18))",
                                border: "1px solid rgba(13,166,242,.35)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#0da6f2",
                                fontWeight: 950,
                            }}>
                                R
                            </div>
                            <div>
                                <h1 className="title" style={{ margin: 0 }}>Reinicio de Codigo</h1>
                                <p className="subtitle" style={{ marginTop: 5 }}>Reinicia el contador del pedido sin borrar el historial.</p>
                            </div>
                        </div>

                        <button
                            className="btn-ghost"
                            onClick={() => navigate("/admin")}
                            style={{ minHeight: 40, borderRadius: 12 }}
                        >
                            Volver al panel
                        </button>
                    </div>

                    <section style={{
                        background: "var(--card)",
                        border: "1px solid var(--stroke)",
                        borderRadius: 18,
                        padding: 22,
                        boxShadow: "var(--shadow)",
                    }}>
                        <form onSubmit={lookup} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 12, alignItems: "end" }}>
                            <label style={{ display: "grid", gap: 8 }}>
                                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 900, textTransform: "uppercase", letterSpacing: ".7px" }}>Numero de pedido</span>
                                <input
                                    value={orderNumber}
                                    onChange={(event) => setOrderNumber(event.target.value.replace(/[^\d]/g, ""))}
                                    placeholder="Ej: 4722"
                                    inputMode="numeric"
                                    style={{
                                        height: 46,
                                        borderRadius: 12,
                                        border: "1px solid var(--stroke)",
                                        background: "var(--bg0)",
                                        color: "var(--text)",
                                        padding: "0 14px",
                                        fontWeight: 800,
                                        outline: "none",
                                    }}
                                />
                            </label>
                            <button
                                type="submit"
                                disabled={loading}
                                style={{
                                    width: "100%",
                                    height: 46,
                                    borderRadius: 12,
                                    border: "1px solid rgba(13,166,242,.45)",
                                    background: "linear-gradient(135deg, #0da6f2, #635bff)",
                                    color: "#fff",
                                    fontWeight: 900,
                                    padding: "0 22px",
                                    cursor: loading ? "wait" : "pointer",
                                    opacity: loading ? .75 : 1,
                                }}
                            >
                                {loading ? "Consultando..." : "Consultar"}
                            </button>
                        </form>

                        {message ? (
                            <div style={{
                                marginTop: 16,
                                border: `1px solid ${messageColor}66`,
                                background: `${messageColor}18`,
                                color: messageColor,
                                borderRadius: 12,
                                padding: "12px 14px",
                                fontSize: 13,
                                fontWeight: 800,
                            }}>
                                {message.text}
                            </div>
                        ) : null}
                    </section>

                    {order ? (
                        <section style={{
                            background: "var(--card)",
                            border: "1px solid var(--stroke)",
                            borderRadius: 18,
                            overflow: "hidden",
                            boxShadow: "var(--shadow)",
                        }}>
                            <div style={{
                                padding: "20px 22px",
                                borderBottom: "1px solid var(--stroke)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 16,
                                flexWrap: "wrap",
                            }}>
                                <div>
                                    <div style={{ color: "var(--muted)", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".8px" }}>Pedido activo</div>
                                    <div style={{ color: "var(--text)", fontSize: 22, fontWeight: 950, marginTop: 4 }}>
                                        #{order.subscriptionId} · {order.platformName}
                                    </div>
                                </div>
                                <span style={{
                                    color: "#10b981",
                                    background: "rgba(16,185,129,.13)",
                                    border: "1px solid rgba(16,185,129,.32)",
                                    borderRadius: 999,
                                    padding: "7px 12px",
                                    fontSize: 12,
                                    fontWeight: 900,
                                }}>
                                    Activo y vigente
                                </span>
                            </div>

                            <div style={{ padding: 22, display: "grid", gap: 18 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
                                    <DetailItem label="Orden" value={order.orderCode || "-"} />
                                    <DetailItem label="Comprador" value={order.buyerEmail} />
                                    <DetailItem label="Cuenta" value={order.accountEmail} />
                                    <DetailItem label="Perfil" value={order.accountProfile || "-"} />
                                    <DetailItem label="Expira" value={fmtDate(order.expiresAt)} />
                                    <DetailItem label="Plataforma codigo" value={order.platformSlug} />
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                                    <CountCard label="Total tras reinicio" value={counts.totalAfterReset} tone="#0da6f2" />
                                    <CountCard label="Codigo inicio" value={counts.loginCodes} tone="#8b5cf6" />
                                    <CountCard label="Temporal" value={counts.temporaryCodes} tone="#f59e0b" />
                                    <CountCard label="Aprobaciones" value={counts.approvals} tone="#10b981" />
                                </div>

                                <div style={{
                                    background: "rgba(245,158,11,.1)",
                                    border: "1px solid rgba(245,158,11,.35)",
                                    borderRadius: 14,
                                    padding: 14,
                                    color: "#f59e0b",
                                    fontSize: 13,
                                    fontWeight: 800,
                                }}>
                                    Ultimo reinicio: {snapshot.lastReset ? `${fmtDate(snapshot.lastReset.created_at)} por ${snapshot.lastReset.requested_by || "admin"}` : "sin reinicios registrados para esta clave actual."}
                                </div>

                                <label style={{ display: "grid", gap: 8 }}>
                                    <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 900, textTransform: "uppercase", letterSpacing: ".7px" }}>Nota interna</span>
                                    <textarea
                                        value={note}
                                        onChange={(event) => setNote(event.target.value)}
                                        placeholder="Ej: error al aprobar Netflix, se habilita nuevo intento"
                                        rows={3}
                                        maxLength={240}
                                        style={{
                                            resize: "vertical",
                                            minHeight: 78,
                                            borderRadius: 12,
                                            border: "1px solid var(--stroke)",
                                            background: "var(--bg0)",
                                            color: "var(--text)",
                                            padding: 14,
                                            fontWeight: 700,
                                            outline: "none",
                                        }}
                                    />
                                </label>

                                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, flexWrap: "wrap" }}>
                                    <button
                                        type="button"
                                        className="btn-ghost"
                                        onClick={() => {
                                            setSnapshot(null);
                                            setMessage(null);
                                        }}
                                        style={{ minHeight: 42, borderRadius: 12 }}
                                    >
                                        Limpiar
                                    </button>
                                    <button
                                        type="button"
                                        disabled={resetting}
                                        onClick={resetCounter}
                                        style={{
                                            minHeight: 42,
                                            borderRadius: 12,
                                            border: "1px solid rgba(16,185,129,.45)",
                                            background: "linear-gradient(135deg, #10b981, #0da6f2)",
                                            color: "#fff",
                                            fontWeight: 950,
                                            padding: "0 20px",
                                            cursor: resetting ? "wait" : "pointer",
                                            opacity: resetting ? .75 : 1,
                                        }}
                                    >
                                        {resetting ? "Reiniciando..." : "Reiniciar contador"}
                                    </button>
                                </div>
                            </div>
                        </section>
                    ) : null}
                </main>
            </div>
        </div>
    );
}
