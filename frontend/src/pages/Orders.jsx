import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import LastWhatsappCard from "../components/LastWhatsappCard.jsx";
import { apiLogout, apiGet } from "../api/api";
import { useAuth } from "../context/AuthContext.jsx";
import Sidebar from "../components/dashboard/Sidebar.jsx";


export default function Orders() {
    const { user, setUser } = useAuth();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState([]);
    const [platforms, setPlatforms] = useState([]);
    const [error, setError] = useState("");

    // ✅ paginación
    const [page, setPage] = useState(1);
    const [limit] = useState(5);
    const [total, setTotal] = useState(0);

    const [filters, setFilters] = useState({
        from: "",
        to: "",
        platformId: "",
        q: "",
    });

    async function logout() {
        try {
            await apiLogout();
        } catch (e) {
            console.error(e);
        } finally {
            setUser(null);

            // limpieza extra
            try {
                localStorage.removeItem("user");
                localStorage.removeItem("accessToken");
                localStorage.removeItem("refreshToken");
            } catch { }

            navigate("/", { replace: true });
        }
    }

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
            // ignore
        }
    }

    async function loadOrders(nextPage = page) {
        setLoading(true);
        setError("");

        try {
            const qs = new URLSearchParams();
            if (filters.from) qs.set("from", filters.from);
            if (filters.to) qs.set("to", filters.to);
            if (filters.platformId) qs.set("platformId", filters.platformId);
            if (filters.q) qs.set("q", filters.q);

            qs.set("page", String(nextPage));
            qs.set("limit", String(limit));

            const res = await apiGet(`/orders?${qs.toString()}`);
            if (!res.ok) throw new Error(res.data?.message || "Error cargando historial.");

            const data = res.data;

            if (data && typeof data === "object" && Array.isArray(data.orders)) {
                setOrders(data.orders);
                setTotal(Number(data.total || 0));
                // Eliminado setPage para no tener feedback loop con useEffect
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
    }

    // carga inicial
    useEffect(() => {
        loadPlatforms();
        // loadOrders(page) se disparará por el useEffect de [page]
        // eslint-disable-next-line
    }, []);

    // recarga cuando cambie page
    useEffect(() => {
        loadOrders(page);
        // eslint-disable-next-line
    }, [page]);

    const totalOrdersShown = orders.length;
    const totalItemsShown = useMemo(() => orders.reduce((sum, o) => sum + (o.items?.length || 0), 0), [orders]);

    const canPrev = page > 1;
    const canNext = page * limit < total;

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                <Sidebar
                    user={user}
                    wallet={null}
                    cartCount={0}
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

                {/* MAIN */}
                <main className="main">
                    <h1 style={{ margin: 0 }}>Historial de compras</h1>
                    <p style={{ marginTop: 6, color: "var(--muted)" }}>
                        Filtra por fecha y plataforma. Cada compra tiene un número de orden.
                    </p>

                    <LastWhatsappCard />

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
                                        loadOrders(1);
                                    }}
                                >
                                    Aplicar filtros
                                </button>

                                <button
                                    className="btn-ghost"
                                    onClick={() => {
                                        setFilters({ from: "", to: "", platformId: "", q: "" });
                                        setPage(1);
                                        setTimeout(() => loadOrders(1), 0);
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

                    {/* Controles paginación */}
                    <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                        <button
                            className="btn-ghost"
                            disabled={!canPrev || loading}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                            ⬅ Anterior
                        </button>
                        <button className="btn" disabled={!canNext || loading} onClick={() => setPage((p) => p + 1)}>
                            Siguiente ➡️
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
        </div>
    );
}
