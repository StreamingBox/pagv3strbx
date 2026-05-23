import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../api/api";
import { useAuth } from "../context/AuthContext.jsx";
import Sidebar from "../components/dashboard/Sidebar.jsx";
import useAppLogout from "../hooks/useAppLogout.js";

export default function Orders() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const logout = useAppLogout();

    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState([]);
    const [platforms, setPlatforms] = useState([]);
    const [error, setError] = useState("");

    const [page, setPage] = useState(1);
    const [limit] = useState(5);
    const [total, setTotal] = useState(0);

    const [filters, setFilters] = useState({
        from: "",
        to: "",
        platformId: "",
        q: "",
    });
    const filtersRef = useRef(filters);
    const [renewModal, setRenewModal] = useState(null);
    const [renewWallet, setRenewWallet] = useState(null);
    const [renewLoadingWallet, setRenewLoadingWallet] = useState(false);
    const [renewSubmitting, setRenewSubmitting] = useState(false);
    const [renewError, setRenewError] = useState("");
    const [renewSuccess, setRenewSuccess] = useState("");
    const [renewDeliveryMessage, setRenewDeliveryMessage] = useState("");
    const [renewCopied, setRenewCopied] = useState(false);

    function formatBogota(dt) {
        if (!dt) return "-";
        let s = String(dt).trim();
        if (s === "0000-00-00 00:00:00" || s === "0000-00-00") return "-";

        if (s.includes(" ") && !s.includes("T")) s = s.replace(" ", "T");

        const hasTZ = /Z$|[+-]\d{2}:\d{2}$/.test(s);
        const iso = hasTZ ? s : `${s}Z`;

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

    async function loadPlatforms() {
        try {
            const res = await apiGet("/platforms");
            if (res.ok && Array.isArray(res.data)) setPlatforms(res.data);
        } catch {
            /* ignore platform filter failures */
        }
    }

    const loadOrders = useCallback(async (nextPage = page, nextFilters = filtersRef.current) => {
        setLoading(true);
        setError("");

        try {
            const qs = new URLSearchParams();
            if (nextFilters.from) qs.set("from", nextFilters.from);
            if (nextFilters.to) qs.set("to", nextFilters.to);
            if (nextFilters.platformId) qs.set("platformId", nextFilters.platformId);
            if (nextFilters.q) qs.set("q", nextFilters.q);

            qs.set("page", String(nextPage));
            qs.set("limit", String(limit));

            const res = await apiGet(`/orders?${qs.toString()}`);
            if (!res.ok) throw new Error(res.data?.message || "Error cargando historial.");

            const data = res.data;

            if (data && typeof data === "object" && Array.isArray(data.orders)) {
                setOrders(data.orders);
                setTotal(Number(data.total || 0));
            } else if (Array.isArray(data)) {
                setOrders(data);
                setTotal(data.length);
            } else {
                setOrders([]);
                setTotal(0);
            }
        } catch (e) {
            setError(e?.message || "Error cargando historial.");
            setOrders([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [limit, page]);

    useEffect(() => {
        void loadPlatforms();
    }, []);

    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);

    useEffect(() => {
        void loadOrders(page);
    }, [page, loadOrders]);

    const totalOrdersShown = orders.length;
    const totalItemsShown = useMemo(() => orders.reduce((sum, o) => sum + (o.items?.length || 0), 0), [orders]);

    const canPrev = page > 1;
    const canNext = page * limit < total;

    async function openRenewModal(item) {
        setRenewModal(item);
        setRenewWallet(null);
        setRenewLoadingWallet(true);
        setRenewError("");
        setRenewSuccess("");
        setRenewDeliveryMessage("");
        setRenewCopied(false);
        try {
            const res = await apiGet("/wallet");
            if (!res.ok) throw new Error(res.data?.message || "No se pudo cargar tu saldo.");
            setRenewWallet(res.data);
        } catch (e) {
            setRenewError(e?.message || "No se pudo cargar tu saldo.");
        } finally {
            setRenewLoadingWallet(false);
        }
    }

    async function confirmRenew() {
        if (!renewModal?.subscription_id) return;
        if (renewSubmitting || renewSuccess) return;
        setRenewSubmitting(true);
        setRenewError("");
        setRenewSuccess("");
        setRenewDeliveryMessage("");
        setRenewCopied(false);
        try {
            const res = await apiPost(`/orders/${renewModal.subscription_id}/renew`, {});
            if (!res.ok) throw new Error(res.data?.message || "No se pudo renovar la suscripción.");
            setRenewSuccess(res.data?.message || "Renovación completada.");
            setRenewDeliveryMessage(res.data?.deliveryMessage || "");
            const walletRes = await apiGet("/wallet");
            if (walletRes.ok) setRenewWallet(walletRes.data);
            await loadOrders(page);
        } catch (e) {
            setRenewError(e?.message || "No se pudo renovar la suscripción.");
        } finally {
            setRenewSubmitting(false);
        }
    }

    async function copyRenewDeliveryMessage() {
        if (!renewDeliveryMessage) return;
        await navigator.clipboard.writeText(renewDeliveryMessage);
        setRenewCopied(true);
        window.setTimeout(() => setRenewCopied(false), 1600);
    }

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden>
                <div className="bg-orb orb-1" />
                <div className="bg-orb orb-2" />
                <div className="bg-grid" />
            </div>

            <div className="page-inner">
                <Sidebar
                    user={user}
                    wallet={null}
                    cartCount={0}
                    onOpenCart={() => {}}
                    onGoOrders={() => navigate("/orders")}
                    onGoRenewals={() => navigate("/renewals")}
                    onGoWallet={() => navigate("/topups")}
                    onGoAnalytics={() => navigate("/analytics")}
                    onGoCodes={() => navigate("/codes")}
                    onGoCodeLogs={() => navigate("/admin/code-logs")}
                    onGoAdmin={() => navigate("/admin")}
                    onGoExpirations={() => navigate("/expirations")}
                    onGoAdvertising={() => navigate("/advertising")}
                    onGoHome={() => navigate("/dashboard")}
                    onLogout={logout}
                />

                <main className="main">
                    <h1 style={{ margin: 0 }}>Historial de compras</h1>
                    <p style={{ marginTop: 6, color: "var(--muted)" }}>
                        Filtra por fecha y plataforma. Cada compra tiene un número de orden.
                    </p>

                    <div className="kpi" style={{ marginTop: 12 }}>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                            <div style={{ flex: 1, minWidth: 200 }}>
                                <div className="label">Buscar</div>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="Orden, PIN, correo, sub ID..."
                                    value={filters.q}
                                    onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))}
                                />
                            </div>

                            <div style={{ minWidth: 150 }}>
                                <div className="label">Desde</div>
                                <input
                                    type="date"
                                    className="input"
                                    value={filters.from}
                                    onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))}
                                />
                            </div>

                            <div style={{ minWidth: 180 }}>
                                <div className="label">Hasta</div>
                                <input
                                    type="date"
                                    className="input"
                                    value={filters.to}
                                    onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))}
                                />
                            </div>

                            <div style={{ minWidth: 220 }}>
                                <div className="label">Plataforma</div>
                                <select
                                    className="input"
                                    value={filters.platformId}
                                    onChange={(e) => setFilters((p) => ({ ...p, platformId: e.target.value }))}
                                >
                                    <option value="">Todas</option>
                                    {platforms.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: "flex", gap: 10 }}>
                                <button
                                    className="btn"
                                    onClick={() => {
                                        setPage(1);
                                        void loadOrders(1);
                                    }}
                                >
                                    Aplicar filtros
                                </button>

                                <button
                                    className="btn-ghost"
                                    onClick={() => {
                                        setFilters({ from: "", to: "", platformId: "", q: "" });
                                        setPage(1);
                                        setTimeout(() => {
                                            void loadOrders(1);
                                        }, 0);
                                    }}
                                >
                                    Limpiar
                                </button>
                            </div>
                        </div>
                    </div>

                    {error ? (
                        <div className="error" style={{ marginTop: 12 }}>
                            {error}
                        </div>
                    ) : null}

                    <div className="kpi" style={{ marginTop: 12 }}>
                        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                            <div>
                                <div className="label">Órdenes (mostradas)</div>
                                <div className="value">{totalOrdersShown}</div>
                            </div>
                            <div>
                                <div className="label">Items (mostrados)</div>
                                <div className="value">{totalItemsShown}</div>
                            </div>
                            <div>
                                <div className="label">Total órdenes</div>
                                <div className="value">{total}</div>
                            </div>
                            <div>
                                <div className="label">Página</div>
                                <div className="value">
                                    {page} / {Math.max(1, Math.ceil(total / limit))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                        <button
                            className="btn-ghost"
                            disabled={!canPrev || loading}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                            ⬅ Anterior
                        </button>
                        <button className="btn" disabled={!canNext || loading} onClick={() => setPage((p) => p + 1)}>
                            Siguiente ➡
                        </button>
                    </div>

                    {loading ? <p style={{ color: "var(--muted)", marginTop: 12 }}>Cargando...</p> : null}

                    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                        {orders.map((o) => (
                            <div key={o.id} className="kpi">
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                                    <div>
                                        <div style={{ fontWeight: 950, fontSize: 18 }}>🧾 Orden: {o.order_code}</div>
                                        <div className="muted">Fecha: {formatBogota(o.created_at)}</div>
                                    </div>

                                    <div style={{ textAlign: "right" }}>
                                        <div style={{ fontWeight: 950, fontSize: 18 }}>
                                            {Number(o.total).toLocaleString()} {o.currency}
                                        </div>
                                        <div style={{ color: "var(--muted)", marginTop: 4 }}>Items: {o.items?.length || 0}</div>
                                    </div>
                                </div>

                                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                                    {(o.items || []).map((it) => (
                                        <div key={it.item_id ?? it.subscription_id}>
                                            <div style={{ fontWeight: 900 }}>{it.platform_name}</div>

                                            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                                                Subscription ID: {it.subscription_id}
                                                {it.duration_name ? ` · Plan: ${it.duration_name}` : ""}
                                            </div>

                                            {it.subscription_expires_at ? (
                                                <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                                                    Expira: {formatBogota(it.subscription_expires_at)}
                                                </div>
                                            ) : null}

                                            {it.renewal?.is_renewable ? (
                                                <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                                    <button
                                                        className="btn"
                                                        disabled={!it.renewal?.can_renew_now}
                                                        onClick={() => openRenewModal(it)}
                                                        style={{
                                                            width: "auto",
                                                            padding: "8px 14px",
                                                            fontSize: 12,
                                                            opacity: it.renewal?.can_renew_now ? 1 : 0.5,
                                                            cursor: it.renewal?.can_renew_now ? "pointer" : "not-allowed",
                                                        }}
                                                        title={it.renewal?.can_renew_now ? "Renovar ahora" : (it.renewal?.block_reason || "No disponible")}
                                                    >
                                                        Renovar
                                                    </button>
                                                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                                                        Valor: {Number(it.renewal?.renewal_price || 0).toLocaleString("es-CO")} {it.renewal?.currency || o.currency}
                                                    </span>
                                                    {!it.renewal?.can_renew_now ? (
                                                        <span style={{ fontSize: 12, color: "#f59e0b" }}>
                                                            {it.renewal?.block_reason}
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: 12, color: "#10b981" }}>
                                                            Renovable hasta el {it.renewal?.eligible_until_date}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : null}

                                            {it.account ? (
                                                <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.35 }}>
                                                    <div>
                                                        <b>Correo:</b> {it.account.email}
                                                    </div>
                                                    <div>
                                                        <b>Contraseña:</b> {it.account.password}
                                                    </div>
                                                    <div>
                                                        <b>Perfil:</b> {it.account.profile_number ?? "-"}
                                                    </div>
                                                    <div>
                                                        <b>Pin:</b> {it.account.pin ?? "-"}
                                                    </div>

                                                    {it.credential_url ? (
                                                        <div style={{ marginTop: 6 }}>
                                                            <a
                                                                href={it.credential_url}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                style={{ color: "var(--primary)", fontWeight: 900 }}
                                                            >
                                                                🔗 Ver credenciales (link)
                                                            </a>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : (
                                                <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>(Sin cuenta asignada)</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {!loading && !orders.length ? (
                            <div className="kpi">
                                <div style={{ color: "var(--muted)" }}>No hay compras en ese rango.</div>
                            </div>
                        ) : null}
                    </div>
                </main>
            </div>

            {renewModal ? (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.65)",
                        zIndex: 9999,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 20,
                    }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget && !renewSubmitting) {
                            setRenewModal(null);
                        }
                    }}
                >
                    <div
                        className="kpi"
                        style={{
                            width: "100%",
                            maxWidth: 520,
                            maxHeight: "90vh",
                            overflowY: "auto",
                            background: "var(--card)",
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                            <div>
                                <div style={{ fontSize: 20, fontWeight: 900 }}>Renovar suscripción</div>
                                <div style={{ color: "var(--muted)", marginTop: 4 }}>
                                    {renewModal.platform_name} · Sub #{renewModal.subscription_id}
                                </div>
                            </div>
                            <button
                                className="btn-ghost"
                                disabled={renewSubmitting}
                                onClick={() => setRenewModal(null)}
                                style={{ width: "auto", padding: "6px 12px" }}
                            >
                                Cerrar
                            </button>
                        </div>

                        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                            <div>
                                <div className="label">Expira</div>
                                <div>{formatBogota(renewModal.subscription_expires_at)}</div>
                            </div>
                            <div>
                                <div className="label">Límite para renovar</div>
                                <div>{renewModal.renewal?.eligible_until_date} 23:59 Colombia</div>
                            </div>
                            <div>
                                <div className="label">Valor de la renovación</div>
                                <div>
                                    {Number(renewModal.renewal?.renewal_price || 0).toLocaleString("es-CO")} {renewModal.renewal?.currency || "COP"}
                                </div>
                            </div>
                            <div>
                                <div className="label">Saldo disponible</div>
                                <div>
                                    {renewLoadingWallet
                                        ? "Cargando saldo..."
                                        : renewWallet
                                            ? `${Number(renewWallet.balance || 0).toLocaleString("es-CO")} ${renewWallet.currency || "COP"}`
                                            : "No disponible"}
                                </div>
                            </div>
                        </div>

                        {!renewSuccess ? (
                            <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.28)", color: "var(--text)" }}>
                                <div style={{ fontWeight: 900 }}>¿Estás seguro de que deseas renovar esta cuenta?</div>
                                <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>
                                    Se descontará el valor de tu saldo y el tiempo adicional se sumará desde el vencimiento actual, no desde hoy.
                                </div>
                            </div>
                        ) : null}

                        {renewError ? (
                            <div className="error" style={{ marginTop: 14 }}>{renewError}</div>
                        ) : null}

                        {renewSuccess ? (
                            <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", fontWeight: 700 }}>
                                {renewSuccess}
                                {renewWallet ? (
                                    <div style={{ marginTop: 6, color: "var(--text)", fontWeight: 500 }}>
                                        Nuevo saldo: {Number(renewWallet.balance || 0).toLocaleString("es-CO")} {renewWallet.currency || "COP"}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        {renewDeliveryMessage ? (
                            <div style={{ marginTop: 14 }}>
                                <div className="label">Mensaje para copiar y pegar</div>
                                <pre
                                    style={{
                                        margin: "8px 0 0",
                                        maxHeight: 280,
                                        overflow: "auto",
                                        whiteSpace: "pre-wrap",
                                        wordBreak: "break-word",
                                        background: "rgba(2,6,23,0.45)",
                                        border: "1px solid var(--stroke)",
                                        borderRadius: 12,
                                        padding: 12,
                                        color: "var(--text)",
                                        fontSize: 12,
                                        lineHeight: 1.45,
                                    }}
                                >
                                    {renewDeliveryMessage}
                                </pre>
                                <button
                                    className="btn"
                                    onClick={copyRenewDeliveryMessage}
                                    style={{ width: "auto", padding: "8px 16px", marginTop: 10 }}
                                >
                                    {renewCopied ? "Copiado" : "Copiar mensaje"}
                                </button>
                            </div>
                        ) : null}

                        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                            <button
                                className="btn-ghost"
                                disabled={renewSubmitting}
                                onClick={() => setRenewModal(null)}
                                style={{ width: "auto", padding: "8px 16px" }}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn"
                                disabled={renewSubmitting || !!renewSuccess || !renewModal.renewal?.can_renew_now}
                                onClick={confirmRenew}
                                style={{ width: "auto", padding: "8px 16px" }}
                            >
                                {renewSubmitting ? "Renovando..." : "Sí, renovar ahora"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
