import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:3000").replace(/\/$/, "");

function qs(obj) {
    const sp = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        const s = String(v).trim();
        if (!s) return;
        sp.set(k, s);
    });
    return sp.toString();
}

export default function AdminOrders() {
    const navigate = useNavigate();

    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // meta paginación
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(50);
    const [total, setTotal] = useState(0);
    const pages = useMemo(() => Math.max(Math.ceil(total / limit), 1), [total, limit]);

    // filtros
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("");
    const [platformId, setPlatformId] = useState("");
    const [currency, setCurrency] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    async function load(nextPage = page) {
        setLoading(true);
        setError("");

        try {
            const query = qs({
                page: nextPage,
                limit,
                q,
                status,
                platformId,
                currency,
                dateFrom,
                dateTo,
            });

            const res = await fetch(`${API_BASE}/admin/orders?${query}`, {
                credentials: "include",
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "No se pudo cargar historial.");

            const items = Array.isArray(data?.items) ? data.items : [];
            setOrders(items);
            setPage(Number(data?.page || nextPage));
            setLimit(Number(data?.limit || limit));
            setTotal(Number(data?.total || 0));
        } catch (e) {
            setError(e.message || "Error cargando historial.");
            setOrders([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load(1);
        // eslint-disable-next-line
    }, []);

    function applyFilters(e) {
        e.preventDefault();
        setPage(1);
        load(1);
    }

    function prevPage() {
        const p = Math.max(page - 1, 1);
        setPage(p);
        load(p);
    }

    function nextPage() {
        const p = Math.min(page + 1, pages);
        setPage(p);
        load(p);
    }

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                <aside className="sidebar">
                    <div className="nav-title">Admin</div>
                    <p className="nav-sub">Historial de compras</p>

                    <button className="btn-ghost" style={{ width: "100%" }} onClick={() => navigate("/admin")}>
                        ⬅ Volver al panel
                    </button>

                    <button
                        className="btn-ghost"
                        style={{ width: "100%", marginTop: 10 }}
                        onClick={() => load(page)}
                        disabled={loading}
                    >
                        {loading ? "Cargando..." : "Refrescar"}
                    </button>

                    <div style={{ marginTop: 14, color: "rgba(234,241,255,.6)", fontSize: 12 }}>
                        Total: <b>{total}</b> • Página: <b>{page}</b> / <b>{pages}</b>
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button className="btn-ghost" style={{ flex: 1 }} onClick={prevPage} disabled={loading || page <= 1}>
                            ◀
                        </button>
                        <button className="btn-ghost" style={{ flex: 1 }} onClick={nextPage} disabled={loading || page >= pages}>
                            ▶
                        </button>
                    </div>
                </aside>

                <main className="main">
                    <h1 style={{ margin: 0 }}>Historial</h1>
                    <p style={{ marginTop: 6, color: "rgba(234,241,255,.65)" }}>
                        Lista de compras (tabla <b>subscriptions</b>).
                    </p>

                    {error ? <div className="error">{error}</div> : null}

                    {/* Filtros */}
                    <div className="kpi" style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 900, marginBottom: 10 }}>Filtros</div>

                        <form onSubmit={applyFilters} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
                            <div>
                                <div style={{ fontSize: 12, color: "rgba(234,241,255,.65)", marginBottom: 6 }}>Buscar</div>
                                <input
                                    className="input"
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="email, nombre o plataforma..."
                                />
                            </div>

                            <div>
                                <div style={{ fontSize: 12, color: "rgba(234,241,255,.65)", marginBottom: 6 }}>Estado</div>
                                <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                                    <option value="">Todos</option>
                                    <option value="active">active</option>
                                    <option value="expired">expired</option>
                                    <option value="cancelled">cancelled</option>
                                    <option value="pending">pending</option>
                                </select>
                            </div>

                            <div>
                                <div style={{ fontSize: 12, color: "rgba(234,241,255,.65)", marginBottom: 6 }}>Plataforma ID</div>
                                <input
                                    className="input"
                                    value={platformId}
                                    onChange={(e) => setPlatformId(e.target.value)}
                                    placeholder="Ej: 1"
                                />
                            </div>

                            <div>
                                <div style={{ fontSize: 12, color: "rgba(234,241,255,.65)", marginBottom: 6 }}>Desde</div>
                                <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                            </div>

                            <div>
                                <div style={{ fontSize: 12, color: "rgba(234,241,255,.65)", marginBottom: 6 }}>Hasta</div>
                                <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                            </div>

                            <div>
                                <div style={{ fontSize: 12, color: "rgba(234,241,255,.65)", marginBottom: 6 }}>Moneda</div>
                                <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                                    <option value="">Todas</option>
                                    <option value="COP">COP</option>
                                    <option value="MXN">MXN</option>
                                    <option value="USD">USD</option>
                                </select>
                            </div>

                            <div>
                                <div style={{ fontSize: 12, color: "rgba(234,241,255,.65)", marginBottom: 6 }}>Límite</div>
                                <select
                                    className="input"
                                    value={limit}
                                    onChange={(e) => {
                                        const v = Number(e.target.value);
                                        setLimit(v);
                                    }}
                                >
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value={150}>150</option>
                                </select>
                            </div>

                            <div style={{ display: "flex", alignItems: "end", gap: 10 }}>
                                <button className="btn" type="submit" disabled={loading}>
                                    Aplicar
                                </button>
                                <button
                                    className="btn-ghost"
                                    type="button"
                                    disabled={loading}
                                    onClick={() => {
                                        setQ("");
                                        setStatus("");
                                        setPlatformId("");
                                        setCurrency("");
                                        setDateFrom("");
                                        setDateTo("");
                                        setPage(1);
                                        setLimit(50);
                                        load(1);
                                    }}
                                >
                                    Limpiar
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Tabla */}
                    <div className="kpi" style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 900, marginBottom: 10 }}>
                            Órdenes {loading ? "• Cargando..." : `• ${orders.length} mostradas`}
                        </div>

                        {loading ? (
                            <div style={{ color: "rgba(234,241,255,.65)" }}>Cargando...</div>
                        ) : (
                            <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <thead>
                                    <tr style={{ textAlign: "left", color: "rgba(234,241,255,.75)" }}>
                                        <th style={{ padding: "10px 8px" }}>ID</th>
                                        <th style={{ padding: "10px 8px" }}>Usuario</th>
                                        <th style={{ padding: "10px 8px" }}>Plataforma</th>
                                        <th style={{ padding: "10px 8px" }}>Plan</th>
                                        <th style={{ padding: "10px 8px" }}>Precio</th>
                                        <th style={{ padding: "10px 8px" }}>Estado</th>
                                        <th style={{ padding: "10px 8px" }}>Creada</th>
                                        <th style={{ padding: "10px 8px" }}>Expira</th>
                                    </tr>
                                    </thead>

                                    <tbody>
                                    {orders.map((o) => (
                                        <tr key={o.orderId} style={{ borderTop: "1px solid rgba(46,123,255,.12)" }}>
                                            <td style={{ padding: "10px 8px" }}>#{o.orderId}</td>
                                            <td style={{ padding: "10px 8px" }}>{o.userEmail}</td>
                                            <td style={{ padding: "10px 8px" }}>{o.platformName}</td>
                                            <td style={{ padding: "10px 8px" }}>
                                                {o.durationName} ({o.days}d)
                                            </td>
                                            <td style={{ padding: "10px 8px" }}>
                                                {Number(o.price).toLocaleString()} {o.currency}
                                            </td>
                                            <td style={{ padding: "10px 8px" }}>{o.status}</td>
                                            <td style={{ padding: "10px 8px" }}>{String(o.created_at || "").slice(0, 10)}</td>
                                            <td style={{ padding: "10px 8px" }}>{String(o.expires_at || "").slice(0, 10)}</td>
                                        </tr>
                                    ))}

                                    {!orders.length ? (
                                        <tr>
                                            <td colSpan="8" style={{ padding: 12, color: "rgba(234,241,255,.65)" }}>
                                                No hay registros con esos filtros.
                                            </td>
                                        </tr>
                                    ) : null}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Footer paginación */}
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, alignItems: "center" }}>
                            <div style={{ color: "rgba(234,241,255,.65)", fontSize: 12 }}>
                                Total: <b>{total}</b> • Página <b>{page}</b> / <b>{pages}</b>
                            </div>

                            <div style={{ display: "flex", gap: 8 }}>
                                <button className="btn-ghost" onClick={prevPage} disabled={loading || page <= 1}>
                                    ◀ Anterior
                                </button>
                                <button className="btn-ghost" onClick={nextPage} disabled={loading || page >= pages}>
                                    Siguiente ▶
                                </button>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
