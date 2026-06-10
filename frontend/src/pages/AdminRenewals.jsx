import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiFetch as baseApiFetch, apiLogout } from "../api/api";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";
import { currentBogotaDateOnly, formatDateOnlyDisplay, normalizeDateOnly } from "../utils/datetime";

const LOGO_URL = "/api/branding/logo";
const STATUS_LABELS = { active: "Activo", expired: "Vencido", cancelled: "Cancelado" };
const STATUS_COLORS = { active: "#10b981", expired: "#ef4444", cancelled: "#6b7280" };

async function apiFetch(path, opts = {}) {
    const res = await baseApiFetch(path, opts);
    if (!res.ok) throw new Error(res.data?.message || "Error en la solicitud");
    return res.data;
}

function formatBogotaDateTime(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString("es-CO", { timeZone: "America/Bogota" });
}

function formatBogotaDate(value) {
    if (!value) return "—";
    return new Date(value).toLocaleDateString("es-CO", { timeZone: "America/Bogota" });
}

export default function AdminRenewals() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, setUser } = useAuth();

    const [orderId, setOrderId] = useState("");
    const [order, setOrder] = useState(null);
    const [accounts, setAccounts] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searchErr, setSearchErr] = useState("");

    const [newAccountId, setNewAccountId] = useState("");
    const [deductWallet, setDeductWallet] = useState(true);
    const [overridePrice, setOverridePrice] = useState("");
    const [note, setNote] = useState("");

    const [result, setResult] = useState(null);
    const [renewing, setRenewing] = useState(false);
    const [renewErr, setRenewErr] = useState("");
    const [copiedDeliveryMessage, setCopiedDeliveryMessage] = useState(false);

    const [logs, setLogs] = useState([]);
    const [logsPage, setLogsPage] = useState(1);
    const [logsLimit, setLogsLimit] = useState(5);
    const [logsTotalPages, setLogsTotalPages] = useState(1);
    const [logsTotal, setLogsTotal] = useState(0);
    const [logsLoading, setLogsLoading] = useState(true);
    const [logsError, setLogsError] = useState("");
    const [logsQuery, setLogsQuery] = useState("");

    async function logout() {
        try { await apiLogout(); } catch (e) { console.error(e); }
        setUser(null);
        try {
            localStorage.removeItem("user");
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
        } catch {
            // ignore
        }
        navigate("/", { replace: true });
    }

    useEffect(() => {
        if (location.state?.orderId) {
            const id = String(location.state.orderId);
            setOrderId(id);
            void performSearch(id);
        }
    }, [location.state]);

    useEffect(() => {
        let cancelled = false;

        async function loadLogs() {
            setLogsLoading(true);
            setLogsError("");
            try {
                const params = new URLSearchParams({
                    page: String(logsPage),
                    limit: String(logsLimit),
                });
                if (logsQuery.trim()) params.set("q", logsQuery.trim());
                const data = await apiFetch(`/admin/renewals/logs?${params.toString()}`);
                if (cancelled) return;
                setLogs(Array.isArray(data.items) ? data.items : []);
                setLogsTotal(Number(data.total || 0));
                setLogsTotalPages(Number(data.totalPages || 1));
            } catch (e) {
                if (cancelled) return;
                setLogsError(e?.message || "No se pudo cargar el log de renovaciones.");
                setLogs([]);
            } finally {
                if (!cancelled) setLogsLoading(false);
            }
        }

        void loadLogs();
        return () => { cancelled = true; };
    }, [logsPage, logsLimit, logsQuery, result]);

    async function performSearch(id) {
        if (!id) return;
        setSearching(true);
        setSearchErr("");
        setOrder(null);
        setResult(null);
        setCopiedDeliveryMessage(false);
        setRenewErr("");
        try {
            const data = await apiFetch(`/admin/orders/${id}`);
            setOrder(data);
            setOverridePrice(String(data.price || ""));
            setNote(`Renovación suscripción #${id}`);

            try {
                const acc = await apiFetch(`/admin/accounts?platformId=${data.platform_id}&available=1&limit=200`);
                setAccounts(acc.items || []);
            } catch {
                setAccounts([]);
            }
            setNewAccountId("");
        } catch (e) {
            setSearchErr(e?.message || "No se pudo cargar la suscripción.");
        } finally {
            setSearching(false);
        }
    }

    async function handleSearch(e) {
        e.preventDefault();
        await performSearch(orderId.trim());
    }

    async function handleRenew(e) {
        e.preventDefault();
        if (!order?.id) return;
        setRenewing(true);
        setRenewErr("");
        setResult(null);
        setCopiedDeliveryMessage(false);
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
            setRenewErr(e?.message || "No se pudo procesar la renovación.");
        } finally {
            setRenewing(false);
        }
    }

    async function copyDeliveryMessage() {
        const message = String(result?.deliveryMessage || "");
        if (!message) return;

        try {
            await navigator.clipboard.writeText(message);
            setCopiedDeliveryMessage(true);
            window.setTimeout(() => setCopiedDeliveryMessage(false), 1600);
        } catch (e) {
            console.error(e);
            setRenewErr("No se pudo copiar el mensaje. Selecciona el texto y copialo manualmente.");
        }
    }

    const inputStyle = {
        appearance: "none",
        WebkitAppearance: "none",
        height: 44,
        padding: "0 16px",
        background: "var(--input-bg)",
        color: "var(--text)",
        border: "1px solid var(--stroke)",
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 500,
        outline: "none",
        width: "100%",
        fontFamily: "var(--font)",
    };

    const sectionStyle = {
        background: "var(--card)",
        border: "1px solid var(--stroke)",
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        boxShadow: "0 10px 40px rgba(0,0,0,0.12)",
    };

    const responsiveGrid = useMemo(() => ({
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
        alignItems: "end",
    }), []);

    const renewalExpiryDate = normalizeDateOnly(order?.expires_date || order?.effective_expires_at || order?.expires_at);
    const renewalTodayDate = currentBogotaDateOnly();
    const renewalBlockedReason = order?.renewal?.block_reason
        || (Number(order?.is_renewable) !== 1 ? "Este plan no tiene renovación habilitada." : "")
        || (renewalExpiryDate && renewalExpiryDate < renewalTodayDate
            ? "La suscripción ya no está dentro del día permitido para renovar."
            : "");

    return (
        <div className="page-shell">
            <style>{`
                .admin-renewals-tableWrap { display: block; }
                .admin-renewals-mobileList { display: none; }
                @media (max-width: 960px) {
                    .admin-renewals-tableWrap { display: none; }
                    .admin-renewals-mobileList { display: grid; }
                }
                @media (max-width: 640px) {
                    .admin-renewals-main { padding: 16px 14px 28px !important; }
                    .admin-renewals-header {
                        align-items: flex-start !important;
                        padding-bottom: 18px !important;
                        margin-bottom: 18px !important;
                    }
                    .admin-renewals-heroIcon {
                        width: 42px !important;
                        height: 42px !important;
                        font-size: 20px !important;
                    }
                    .admin-renewals-searchButton {
                        width: 100% !important;
                    }
                    .admin-renewals-resultHeader {
                        align-items: flex-start !important;
                    }
                    .admin-renewals-submitRow {
                        justify-content: stretch !important;
                    }
                    .admin-renewals-submitButton {
                        width: 100% !important;
                    }
                }
            `}</style>

            <div className="page-shell-bg" aria-hidden>
                <div className="bg-orb orb-1" />
                <div className="bg-orb orb-2" />
                <div className="bg-grid" />
            </div>

            <div className="page-inner">
                <AdminSidebar
                    user={user}
                    logoSrc={LOGO_URL}
                    logoOk={true}
                    setLogoOk={() => {}}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main admin-renewals-main" style={{ padding: "20px 24px 32px" }}>
                    <motion.div
                        className="admin-renewals-header"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, gap: 20, flexWrap: "wrap", borderBottom: "1px solid var(--stroke)", paddingBottom: 24 }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div
                                className="admin-renewals-heroIcon"
                                style={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 14,
                                    flexShrink: 0,
                                    background: "rgba(13,166,242,0.1)",
                                    border: "1px solid rgba(13,166,242,0.3)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 24,
                                    boxShadow: "0 4px 16px rgba(13,166,242,0.2)",
                                }}
                            >
                                ↻
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" }}>
                                    Renovaciones
                                </h1>
                                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
                                    Bitácora de renovaciones y renovación manual por suscripción.
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        style={{ ...sectionStyle, boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}
                    >
                        <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 18, fontWeight: 900, color: "var(--text)" }}>Buscar suscripción</div>
                            <div style={{ color: "var(--muted)", fontSize: 13 }}>Consulta una suscripción puntual y ejecuta la renovación manual.</div>
                        </div>

                        <form onSubmit={handleSearch} style={responsiveGrid}>
                            <div style={{ minWidth: 0 }}>
                                <input
                                    value={orderId}
                                    onChange={(e) => setOrderId(e.target.value)}
                                    placeholder="ID de suscripción"
                                    style={inputStyle}
                                    type="number"
                                    min="1"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={searching}
                                className="admin-renewals-searchButton"
                                style={{ height: 44, width: "100%", padding: "0 28px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #0da6f2 0%, #8b5cf6 100%)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                            >
                                {searching ? "Buscando..." : "Buscar suscripción"}
                            </button>
                        </form>

                        {searchErr ? <div className="error" style={{ marginTop: 16 }}>{searchErr}</div> : null}
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.08 }}
                        style={sectionStyle}
                    >
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 18, fontWeight: 900, color: "var(--text)" }}>Log de renovaciones</div>
                            <div style={{ color: "var(--muted)", fontSize: 13 }}>Qué se renovó, quién lo hizo y cuánto se cobró.</div>
                        </div>

                        <div style={responsiveGrid}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Buscar
                                </div>
                                <input
                                    value={logsQuery}
                                    onChange={(e) => {
                                        setLogsQuery(e.target.value);
                                        setLogsPage(1);
                                    }}
                                    placeholder="Orden, usuario o plataforma"
                                    style={{ ...inputStyle, height: 42 }}
                                />
                            </div>

                            <div style={{ minWidth: 0 }}>
                                <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Mostrar
                                </div>
                                <select
                                    value={String(logsLimit)}
                                    onChange={(e) => {
                                        setLogsPage(1);
                                        setLogsLimit(Number(e.target.value) || 5);
                                    }}
                                    style={{ ...inputStyle, height: 42, cursor: "pointer" }}
                                >
                                    <option value="5">5</option>
                                    <option value="10">10</option>
                                    <option value="20">20</option>
                                </select>
                            </div>
                        </div>

                        {logsError ? <div className="error" style={{ marginTop: 12 }}>{logsError}</div> : null}

                        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 14, marginBottom: 12 }}>
                            Mostrando {logsLimit} por página, ordenadas de la más reciente a la más antigua.
                        </div>

                        <div className="admin-renewals-tableWrap" style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: "rgba(0,0,0,0.2)", textAlign: "left" }}>
                                        {["Fecha", "Renovación", "Usuario", "Plataforma", "Actor", "Cobro", "Vencimiento"].map((h) => (
                                            <th key={h} style={{ padding: "12px 14px", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px" }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {logsLoading ? (
                                        <tr><td colSpan={7} style={{ padding: "30px 14px", color: "var(--muted)", textAlign: "center" }}>Cargando renovaciones...</td></tr>
                                    ) : logs.length === 0 ? (
                                        <tr><td colSpan={7} style={{ padding: "30px 14px", color: "var(--muted)", textAlign: "center" }}>No hay renovaciones registradas.</td></tr>
                                    ) : logs.map((log) => (
                                        <tr key={log.id} style={{ borderTop: "1px solid var(--stroke2)" }}>
                                            <td style={{ padding: "12px 14px", color: "var(--muted)" }}>{formatBogotaDateTime(log.created_at)}</td>
                                            <td style={{ padding: "12px 14px" }}>
                                                <div style={{ fontWeight: 700, color: "var(--text)" }}>{log.renewal_order_code}</div>
                                                <div style={{ fontSize: 12, color: "var(--muted)" }}>Anterior: {log.previous_order_code || "—"}</div>
                                            </td>
                                            <td style={{ padding: "12px 14px", color: "var(--text)" }}>{log.user_email}</td>
                                            <td style={{ padding: "12px 14px", color: "var(--text)" }}>{log.platform_name || "—"}</td>
                                            <td style={{ padding: "12px 14px" }}>
                                                <div style={{ fontWeight: 700, color: "var(--text)" }}>{log.actor_email || `#${log.actor_user_id}`}</div>
                                                <div style={{ fontSize: 12, color: "var(--muted)" }}>{log.actor_role}</div>
                                            </td>
                                            <td style={{ padding: "12px 14px", color: "var(--text)" }}>
                                                {Number(log.amount_charged || 0).toLocaleString("es-CO")} {log.currency}
                                                <div style={{ fontSize: 12, color: "var(--muted)" }}>{Number(log.deduct_wallet) === 1 ? "Descontado de wallet" : "Sin descuento"}</div>
                                            </td>
                                            <td style={{ padding: "12px 14px" }}>
                                                <div style={{ fontSize: 12, color: "var(--muted)" }}>Antes: {formatBogotaDate(log.previous_expires_at)}</div>
                                                <div style={{ fontWeight: 700, color: "#10b981" }}>Nuevo: {formatBogotaDate(log.new_expires_at)}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="admin-renewals-mobileList" style={{ gap: 12 }}>
                            {logsLoading ? (
                                <div style={{ padding: "18px 16px", color: "var(--muted)", textAlign: "center", border: "1px solid var(--stroke2)", borderRadius: 14 }}>
                                    Cargando renovaciones...
                                </div>
                            ) : logs.length === 0 ? (
                                <div style={{ padding: "18px 16px", color: "var(--muted)", textAlign: "center", border: "1px solid var(--stroke2)", borderRadius: 14 }}>
                                    No hay renovaciones registradas.
                                </div>
                            ) : logs.map((log) => (
                                <div key={`mobile-${log.id}`} style={{ border: "1px solid var(--stroke2)", borderRadius: 14, padding: 14, background: "rgba(255,255,255,0.02)" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                                        <div>
                                            <div style={{ fontWeight: 900, color: "var(--text)", fontSize: 15 }}>{log.renewal_order_code}</div>
                                            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{formatBogotaDateTime(log.created_at)}</div>
                                        </div>
                                        <div style={{ color: "#10b981", fontWeight: 800, fontSize: 13 }}>
                                            {Number(log.amount_charged || 0).toLocaleString("es-CO")} {log.currency}
                                        </div>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 12 }}>
                                        <div>
                                            <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Usuario</div>
                                            <div style={{ color: "var(--text)", fontWeight: 700 }}>{log.user_email}</div>
                                        </div>
                                        <div>
                                            <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Plataforma</div>
                                            <div style={{ color: "var(--text)", fontWeight: 700 }}>{log.platform_name || "—"}</div>
                                        </div>
                                        <div>
                                            <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Actor</div>
                                            <div style={{ color: "var(--text)", fontWeight: 700 }}>{log.actor_email || `#${log.actor_user_id}`}</div>
                                            <div style={{ color: "var(--muted)", fontSize: 12 }}>{log.actor_role}</div>
                                        </div>
                                        <div>
                                            <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Vencimiento</div>
                                            <div style={{ color: "var(--muted)", fontSize: 12 }}>Antes: {formatBogotaDate(log.previous_expires_at)}</div>
                                            <div style={{ color: "#10b981", fontWeight: 800 }}>Nuevo: {formatBogotaDate(log.new_expires_at)}</div>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
                                        Anterior: {log.previous_order_code || "—"} · {Number(log.deduct_wallet) === 1 ? "Descontado de wallet" : "Sin descuento"}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 12, flexWrap: "wrap" }}>
                            <div style={{ color: "var(--muted)", fontSize: 13 }}>
                                Total registros: {logsTotal} · Página {logsPage} de {logsTotalPages}
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <button className="btn-ghost" disabled={logsPage <= 1} onClick={() => setLogsPage((p) => Math.max(1, p - 1))} style={{ width: "auto", padding: "6px 14px", fontSize: 13 }}>Anterior</button>
                                <button className="btn-ghost" disabled={logsPage >= logsTotalPages} onClick={() => setLogsPage((p) => Math.min(logsTotalPages, p + 1))} style={{ width: "auto", padding: "6px 14px", fontSize: 13 }}>Siguiente</button>
                            </div>
                        </div>
                    </motion.div>

                    {order ? (
                        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
                            <div style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}>
                                <div className="admin-renewals-resultHeader" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--stroke2)" }}>
                                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "var(--text)" }}>
                                        Suscripción #{order.id}
                                    </h2>
                                    <div style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800, background: `${STATUS_COLORS[order.status] || "#64748b"}20`, color: STATUS_COLORS[order.status] || "#64748b", border: `1px solid ${(STATUS_COLORS[order.status] || "#64748b")}40` }}>
                                        {STATUS_LABELS[order.status] || order.status}
                                    </div>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
                                    {[
                                        ["Usuario", order.user_email],
                                        ["Plataforma", order.platform_name],
                                        ["Duración", `${order.duration_name} (${order.days} días)`],
                                        ["Precio actual", `${Number(overridePrice || order.price || 0).toLocaleString("es-CO")} ${order.currency}`],
                                        ["Vencimiento", formatDateOnlyDisplay(order.expires_date || order.effective_expires_at || order.expires_at)],
                                        ["Atención", order.is_attended ? "Atendida" : "Pendiente"],
                                        ["Cuenta", order.account_email || "Usuario local"],
                                    ].map(([label, val]) => (
                                        <div key={label}>
                                            <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
                                            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{val}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {result ? (
                                <div style={{ background: "var(--card)", border: "1px solid rgba(16,185,129,.4)", borderRadius: 16, padding: 24, boxShadow: "0 10px 40px rgba(16,185,129,0.1)" }}>
                                    <div style={{ fontWeight: 900, fontSize: 18, color: "#10b981", marginBottom: 16 }}>
                                        Renovación procesada
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
                                        {[
                                            ["Orden de renovación", result.renewalOrderCode || (result.renewalOrderId ? `#${result.renewalOrderId}` : "—")],
                                            ["Nuevo vencimiento", formatBogotaDateTime(result.newExpiry)],
                                            ["Descontado", `${Number(result.deducted || 0).toLocaleString("es-CO")} ${result.currency || ""}`.trim()],
                                            ["Saldo resultante", result.newBalance !== null ? `${Number(result.newBalance).toLocaleString("es-CO")} ${result.currency || ""}`.trim() : "—"],
                                        ].map(([label, val]) => (
                                            <div key={label}>
                                                <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 4 }}>{label}</div>
                                                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{val}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {result.deliveryMessage ? (
                                        <div style={{ marginTop: 20 }}>
                                            <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                                Mensaje para copiar y pegar
                                            </div>
                                            <pre style={{ margin: 0, maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", background: "rgba(2,6,23,0.45)", border: "1px solid var(--stroke)", borderRadius: 12, padding: 14, color: "var(--text)", fontSize: 12, lineHeight: 1.45, fontFamily: "monospace" }}>{result.deliveryMessage}</pre>
                                            <button
                                                type="button"
                                                className="btn"
                                                onClick={copyDeliveryMessage}
                                                style={{ width: "auto", padding: "8px 16px", marginTop: 12 }}
                                            >
                                                {copiedDeliveryMessage ? "Copiado" : "Copiar mensaje"}
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}>
                                    {renewalBlockedReason ? (
                                        <div style={{ marginBottom: 18, padding: "12px 16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, color: "#ef4444", fontSize: 13 }}>
                                            {renewalBlockedReason}
                                        </div>
                                    ) : null}

                                    <form onSubmit={handleRenew}>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
                                            <div>
                                                <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 8, fontWeight: 500 }}>
                                                    Cambiar cuenta (opcional)
                                                </label>
                                                <select
                                                    style={{ ...inputStyle, cursor: renewalBlockedReason ? "not-allowed" : "pointer" }}
                                                    disabled={!!renewalBlockedReason}
                                                    value={newAccountId}
                                                    onChange={(e) => setNewAccountId(e.target.value)}
                                                >
                                                    <option value="">Mantener asignación actual</option>
                                                    {accounts.map((a) => (
                                                        <option key={a.id} value={a.id}>#{a.id} - {a.email}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div>
                                                <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 8, fontWeight: 500 }}>
                                                    Cobro
                                                </label>
                                                <input
                                                    style={inputStyle}
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    disabled={!!renewalBlockedReason}
                                                    value={overridePrice}
                                                    onChange={(e) => setOverridePrice(e.target.value)}
                                                />
                                            </div>

                                            <div style={{ gridColumn: "1 / -1" }}>
                                                <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 8, fontWeight: 500 }}>
                                                    Nota
                                                </label>
                                                <input
                                                    style={inputStyle}
                                                    type="text"
                                                    disabled={!!renewalBlockedReason}
                                                    value={note}
                                                    onChange={(e) => setNote(e.target.value)}
                                                />
                                            </div>

                                        </div>

                                        <div style={{ marginTop: 24, padding: "16px", borderRadius: 12, background: "var(--input-bg)", border: "1px solid var(--stroke2)", display: "flex", alignItems: "center", gap: 12 }}>
                                            <input
                                                type="checkbox"
                                                checked={deductWallet}
                                                disabled={!!renewalBlockedReason}
                                                onChange={(e) => setDeductWallet(e.target.checked)}
                                            />
                                            <div>
                                                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Descontar de wallet</div>
                                                <div style={{ fontSize: 12, color: "var(--muted)" }}>Usa el saldo del cliente para cobrar la renovación.</div>
                                            </div>
                                        </div>

                                        {renewErr ? <div className="error" style={{ marginTop: 16 }}>{renewErr}</div> : null}

                                        <div className="admin-renewals-submitRow" style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
                                            <button
                                                type="submit"
                                                disabled={renewing || !!renewalBlockedReason}
                                                className="admin-renewals-submitButton"
                                                style={{ height: 48, padding: "0 32px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #0da6f2 0%, #8b5cf6 100%)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: (renewing || renewalBlockedReason) ? "not-allowed" : "pointer", opacity: (renewing || renewalBlockedReason) ? 0.55 : 1 }}
                                            >
                                                {renewing ? "Procesando..." : "Confirmar renovación"}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}
                        </motion.div>
                    ) : null}
                </main>
            </div>
        </div>
    );
}
