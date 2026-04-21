import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../api/api";
import Sidebar from "../components/dashboard/Sidebar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import useAppLogout from "../hooks/useAppLogout.js";

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
    }).format(d).replace(",", "");
}

export default function Renewals() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const logout = useAppLogout();

    const [wallet, setWallet] = useState(null);
    const [platforms, setPlatforms] = useState([]);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(1);
    const [filters, setFilters] = useState({
        q: "",
        platformId: "",
        availability: "available",
    });
    const [renewModal, setRenewModal] = useState(null);
    const [renewSubmitting, setRenewSubmitting] = useState(false);
    const [renewError, setRenewError] = useState("");
    const [renewSuccess, setRenewSuccess] = useState("");

    const loadWallet = useCallback(async () => {
        const res = await apiGet("/wallet");
        if (res.ok) setWallet(res.data);
    }, []);

    const loadPlatforms = useCallback(async () => {
        const res = await apiGet("/platforms");
        if (res.ok && Array.isArray(res.data)) {
            setPlatforms(res.data);
        }
    }, []);

    const loadRenewals = useCallback(async (nextPage = page, nextLimit = limit, nextFilters = filters) => {
        setLoading(true);
        setError("");
        try {
            const qs = new URLSearchParams({
                page: String(nextPage),
                limit: String(nextLimit),
                availability: nextFilters.availability || "available",
            });

            if (nextFilters.q.trim()) qs.set("q", nextFilters.q.trim());
            if (nextFilters.platformId) qs.set("platformId", nextFilters.platformId);

            const res = await apiGet(`/orders/renewals?${qs.toString()}`);
            if (!res.ok) throw new Error(res.data?.message || "No se pudieron cargar las renovaciones.");

            setItems(Array.isArray(res.data?.items) ? res.data.items : []);
            setTotal(Number(res.data?.total || 0));
            setPages(Math.max(1, Number(res.data?.pages || 1)));
        } catch (e) {
            setItems([]);
            setTotal(0);
            setPages(1);
            setError(e?.message || "No se pudieron cargar las renovaciones.");
        } finally {
            setLoading(false);
        }
    }, [filters, limit, page]);

    useEffect(() => {
        void loadWallet();
        void loadPlatforms();
    }, [loadPlatforms, loadWallet]);

    useEffect(() => {
        void loadRenewals(page, limit, filters);
    }, [page, limit, filters, loadRenewals]);

    const availableCount = useMemo(
        () => items.filter((item) => item.renewal?.can_renew_now).length,
        [items]
    );

    function openRenewModal(item) {
        setRenewModal(item);
        setRenewError("");
        setRenewSuccess("");
    }

    async function confirmRenew() {
        if (!renewModal?.subscription_id) return;

        setRenewSubmitting(true);
        setRenewError("");
        setRenewSuccess("");
        try {
            const res = await apiPost(`/orders/${renewModal.subscription_id}/renew`, {});
            if (!res.ok) throw new Error(res.data?.message || "No se pudo renovar la suscripción.");

            setRenewSuccess(res.data?.message || "Renovación completada.");
            await loadWallet();
            await loadRenewals(page, limit, filters);
        } catch (e) {
            setRenewError(e?.message || "No se pudo renovar la suscripción.");
        } finally {
            setRenewSubmitting(false);
        }
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
                    wallet={wallet}
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
                    onGoHome={() => navigate("/dashboard")}
                    onLogout={logout}
                />

                <main className="main">
                    <h1 style={{ margin: 0 }}>Renovaciones</h1>
                    <p style={{ marginTop: 6, color: "var(--muted)" }}>
                        Busca tus cuentas renovables, filtra por plataforma y decide si quieres ver solo las disponibles o también las bloqueadas.
                    </p>

                    <div className="kpi" style={{ marginTop: 12 }}>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                            <div style={{ flex: 1, minWidth: 220 }}>
                                <div className="label">Buscar</div>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="Orden, sub ID, correo o PIN"
                                    value={filters.q}
                                    onChange={(e) => {
                                        setPage(1);
                                        setFilters((prev) => ({ ...prev, q: e.target.value }));
                                    }}
                                />
                            </div>

                            <div style={{ minWidth: 220 }}>
                                <div className="label">Plataforma</div>
                                <select
                                    className="input"
                                    value={filters.platformId}
                                    onChange={(e) => {
                                        setPage(1);
                                        setFilters((prev) => ({ ...prev, platformId: e.target.value }));
                                    }}
                                >
                                    <option value="">Todas</option>
                                    {platforms.map((platform) => (
                                        <option key={platform.id} value={platform.id}>
                                            {platform.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ minWidth: 220 }}>
                                <div className="label">Estado</div>
                                <select
                                    className="input"
                                    value={filters.availability}
                                    onChange={(e) => {
                                        setPage(1);
                                        setFilters((prev) => ({ ...prev, availability: e.target.value }));
                                    }}
                                >
                                    <option value="available">Solo disponibles</option>
                                    <option value="all">Todas</option>
                                    <option value="blocked">Solo bloqueadas</option>
                                </select>
                            </div>

                            <div style={{ minWidth: 140 }}>
                                <div className="label">Ver</div>
                                <select
                                    className="input"
                                    value={String(limit)}
                                    onChange={(e) => {
                                        setPage(1);
                                        setLimit(Number(e.target.value) || 10);
                                    }}
                                >
                                    <option value="10">10</option>
                                    <option value="20">20</option>
                                    <option value="30">30</option>
                                </select>
                            </div>

                            <div style={{ display: "flex", gap: 10 }}>
                                <button
                                    className="btn"
                                    onClick={() => {
                                        setPage(1);
                                        void loadRenewals(1, limit, filters);
                                    }}
                                >
                                    Aplicar filtros
                                </button>
                                <button
                                    className="btn-ghost"
                                    onClick={() => {
                                        const nextFilters = {
                                            q: "",
                                            platformId: "",
                                            availability: "available",
                                        };
                                        setPage(1);
                                        setLimit(10);
                                        setFilters(nextFilters);
                                        void loadRenewals(1, 10, nextFilters);
                                    }}
                                >
                                    Limpiar
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="kpi" style={{ marginTop: 12 }}>
                        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                            <div>
                                <div className="label">Cuentas listadas</div>
                                <div className="value">{items.length}</div>
                            </div>
                            <div>
                                <div className="label">Disponibles en esta página</div>
                                <div className="value">{availableCount}</div>
                            </div>
                            <div>
                                <div className="label">Total encontrado</div>
                                <div className="value">{total}</div>
                            </div>
                            <div>
                                <div className="label">Saldo disponible</div>
                                <div className="value" style={{ fontSize: 20 }}>
                                    {Number(wallet?.balance || 0).toLocaleString("es-CO")} {wallet?.currency || "COP"}
                                </div>
                            </div>
                            <div>
                                <div className="label">Página</div>
                                <div className="value">
                                    {page} / {pages}
                                </div>
                            </div>
                        </div>
                    </div>

                    {error ? <div className="error" style={{ marginTop: 12 }}>{error}</div> : null}

                    <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                        <button
                            className="btn-ghost"
                            disabled={page <= 1 || loading}
                            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                        >
                            ← Anterior
                        </button>
                        <button
                            className="btn"
                            disabled={page >= pages || loading}
                            onClick={() => setPage((prev) => prev + 1)}
                        >
                            Siguiente →
                        </button>
                    </div>

                    {loading ? <p style={{ color: "var(--muted)", marginTop: 12 }}>Cargando renovaciones...</p> : null}

                    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                        {items.map((item) => (
                            <div key={item.subscription_id} className="kpi">
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                                    <div>
                                        <div style={{ fontWeight: 900, fontSize: 18 }}>{item.platform_name}</div>
                                        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                                            Orden: {item.order_code} · Sub ID: {item.subscription_id}
                                            {item.duration_name ? ` · Plan: ${item.duration_name}` : ""}
                                        </div>
                                        {Number(item.renewal?.renewal_count || 0) > 0 ? (
                                            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                                                Renovaciones usadas: {Number(item.renewal?.renewal_count || 0)}
                                            </div>
                                        ) : null}
                                        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                                            Compra original: {formatBogota(item.order_created_at)}
                                        </div>
                                        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                                            Expira: {formatBogota(item.subscription_expires_at)}
                                        </div>
                                    </div>

                                    <div style={{ textAlign: "right" }}>
                                        <div style={{ fontWeight: 900, fontSize: 18 }}>
                                            {Number(item.renewal?.renewal_price || 0).toLocaleString("es-CO")} {item.renewal?.currency || "COP"}
                                        </div>
                                        <div style={{ color: "var(--muted)", marginTop: 4 }}>
                                            Orden original: {Number(item.order_total || 0).toLocaleString("es-CO")} {item.order_currency || "COP"}
                                        </div>
                                        <div style={{ marginTop: 6, fontSize: 12, color: item.renewal?.can_renew_now ? "#10b981" : "#f59e0b" }}>
                                            {item.renewal?.can_renew_now
                                                ? `Disponible hasta el ${item.renewal?.eligible_until_date}`
                                                : (item.renewal?.block_reason || "No disponible")}
                                        </div>
                                    </div>
                                </div>

                                {item.account ? (
                                    <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.4 }}>
                                        <div><b>Correo:</b> {item.account.email}</div>
                                        <div><b>Perfil:</b> {item.account.profile_number ?? "-"}</div>
                                        <div><b>Pin:</b> {item.account.pin ?? "-"}</div>
                                    </div>
                                ) : (
                                    <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 13 }}>
                                        Sin cuenta asignada.
                                    </div>
                                )}

                                <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                                    <button
                                        className="btn"
                                        disabled={!item.renewal?.can_renew_now}
                                        onClick={() => openRenewModal(item)}
                                        style={{
                                            width: "auto",
                                            padding: "8px 16px",
                                            opacity: item.renewal?.can_renew_now ? 1 : 0.5,
                                            cursor: item.renewal?.can_renew_now ? "pointer" : "not-allowed",
                                        }}
                                        title={item.renewal?.can_renew_now ? "Renovar ahora" : (item.renewal?.block_reason || "No disponible")}
                                    >
                                        Renovar ahora
                                    </button>
                                </div>
                            </div>
                        ))}

                        {!loading && !items.length ? (
                            <div className="kpi">
                                <div style={{ color: "var(--muted)" }}>
                                    No se encontraron renovaciones con esos filtros.
                                </div>
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
                                    {Number(wallet?.balance || 0).toLocaleString("es-CO")} {wallet?.currency || "COP"}
                                </div>
                            </div>
                        </div>

                        {renewError ? <div className="error" style={{ marginTop: 14 }}>{renewError}</div> : null}

                        {renewSuccess ? (
                            <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", fontWeight: 700 }}>
                                {renewSuccess}
                                <div style={{ marginTop: 6, color: "var(--text)", fontWeight: 500 }}>
                                    Nuevo saldo: {Number(wallet?.balance || 0).toLocaleString("es-CO")} {wallet?.currency || "COP"}
                                </div>
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
                                disabled={renewSubmitting || !renewModal.renewal?.can_renew_now}
                                onClick={confirmRenew}
                                style={{ width: "auto", padding: "8px 16px" }}
                            >
                                {renewSubmitting ? "Renovando..." : "Confirmar renovación"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
