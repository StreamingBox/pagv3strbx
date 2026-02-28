import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";

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
    if (res.status === 401) {
        localStorage.removeItem("user");
        window.location.href = "/login";
        return null;
    }
    if (!res.ok) throw new Error(data?.message || "Error en la solicitud");
    return data;
}

export default function AdminExpirations() {
    const navigate = useNavigate();

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Filters
    const [q, setQ] = useState("");
    const [email, setEmail] = useState("");
    const [platform, setPlatform] = useState("all");
    const [attendedFilter, setAttendedFilter] = useState("0"); // "0" = pendientes, "1" = atendidos, "all" = todos

    // Pagination
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [limit, setLimit] = useState(20);

    const [platforms, setPlatforms] = useState([]);

    useEffect(() => {
        let mounted = true;
        async function loadPlatforms() {
            try {
                const r = await apiFetch("/platforms");
                if (mounted && r) setPlatforms(r);
            } catch (e) {
                console.error(e);
            }
        }
        loadPlatforms();
        return () => { mounted = false; };
    }, []);

    useEffect(() => {
        let mounted = true;
        async function loadData() {
            setLoading(true);
            setError("");
            try {
                const params = new URLSearchParams();
                params.set("page", page);
                params.set("limit", limit);
                if (q.trim()) params.set("q", q.trim());
                if (email.trim()) params.set("email", email.trim());
                if (platform !== "all") params.set("platform", platform);
                if (attendedFilter !== "all") params.set("attended", attendedFilter);

                const data = await apiFetch(`/admin/orders-expiring?${params.toString()}`);
                if (!mounted) return;

                if (data && data.items) {
                    setItems(data.items);
                    setTotalPages(data.pages);
                    setTotalItems(data.total);
                }
            } catch (err) {
                if (mounted) setError(err.message);
            } finally {
                if (mounted) setLoading(false);
            }
        }

        const t = setTimeout(loadData, 300);
        return () => { mounted = false; clearTimeout(t); };
    }, [page, q, email, platform, attendedFilter, limit]);

    async function toggleAttended(id, currentStatus) {
        try {
            const is_attended = currentStatus ? 0 : 1;
            await apiFetch(`/admin/orders/${id}/attend`, {
                method: "POST",
                body: JSON.stringify({ is_attended })
            });

            // Si hay un filtro activo, el item debería desaparecer visualmente si ya no coincide
            if (attendedFilter !== "all") {
                setItems(prev => prev.filter(item => item.id !== id));
            } else {
                setItems(prev => prev.map(item => item.id === id ? { ...item, is_attended } : item));
            }
        } catch (e) {
            alert(e.message || "Error cambiando estado");
        }
    }

    function getDaysLeft(expiryStr) {
        if (!expiryStr) return null;
        const diff = new Date(expiryStr) - new Date();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }

    function renderDaysBadge(days) {
        if (days === null) return <span style={{ color: "var(--muted)" }}>—</span>;
        if (days < 0) return <span style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>Vencida ({Math.abs(days)}d)</span>;
        if (days === 0) return <span style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>Vence hoy</span>;
        if (days <= 3) return <span style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{days} días</span>;
        return <span style={{ background: "rgba(16,185,129,0.15)", color: "#10b981", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{days} días</span>;
    }

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                <aside className="sidebar">
                    <div className="nav-title">Admin</div>
                    <p className="nav-sub">Vencimientos</p>
                    <div className="nav-item" onClick={() => navigate("/admin")}>
                        <span>Volver al panel</span><span style={{ opacity: 0.7 }}>→</span>
                    </div>
                </aside>

                <main className="main">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, gap: 20, flexWrap: "wrap" }}>
                        <div>
                            <h1 style={{ margin: "0 0 6px" }}>⏱️ Vencimientos</h1>
                            <p style={{ color: "var(--muted)", margin: 0 }}>
                                Cuentas de todos los usuarios próximas a vencer (7 días) o ya vencidas.
                            </p>
                        </div>
                        <div style={{ display: "flex", gap: 12 }}>
                            <div className="kpi" style={{ padding: "10px 16px", minWidth: 100 }}>
                                <div style={{ fontSize: 11, color: "var(--muted)" }}>Total Registros</div>
                                <div style={{ fontSize: 18, fontWeight: 800 }}>{totalItems}</div>
                            </div>
                        </div>
                    </div>

                    <div className="kpi" style={{ padding: 20 }}>
                        {/* Filtros */}
                        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                            <input
                                className="input"
                                style={{ flex: 1, minWidth: 200 }}
                                value={q}
                                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                                placeholder="🔎 Buscar por ID de Pedido..."
                            />
                            <input
                                className="input"
                                style={{ flex: 1, minWidth: 200 }}
                                value={email}
                                onChange={(e) => { setEmail(e.target.value); setPage(1); }}
                                placeholder="📧 Correo del usuario..."
                            />
                            <select
                                className="input"
                                style={{ minWidth: 200 }}
                                value={platform}
                                onChange={(e) => { setPlatform(e.target.value); setPage(1); }}
                            >
                                <option value="all">Todas las plataformas</option>
                                {platforms.map((p) => (
                                    <option key={p.id} value={p.slug}>{p.name}</option>
                                ))}
                            </select>
                            <select
                                className="input"
                                style={{ minWidth: 200 }}
                                value={attendedFilter}
                                onChange={(e) => { setAttendedFilter(e.target.value); setPage(1); }}
                            >
                                <option value="0">⏳ Solo Pendientes</option>
                                <option value="1">✔️ Solo Atendidos</option>
                                <option value="all">📋 Mostrar Todos</option>
                            </select>
                        </div>

                        {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

                        {/* Tabla */}
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                                <thead>
                                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", color: "var(--muted)" }}>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>ID</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>Plataforma</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>Usuario</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>Cuenta Asignada</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>Vence</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>Estado</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600, textAlign: "right" }}>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={7} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Cargando vencimientos...</td></tr>
                                    ) : items.length === 0 ? (
                                        <tr><td colSpan={7} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>No hay cuentas próximas a vencer con estos filtros.</td></tr>
                                    ) : (
                                        items.map((item) => {
                                            const daysLeft = getDaysLeft(item.expires_at);
                                            return (
                                                <tr key={item.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", opacity: item.is_attended ? 0.5 : 1 }}>
                                                    <td style={{ padding: "12px 8px", fontFamily: "monospace", opacity: 0.8 }}>
                                                        {item.id} {item.is_attended ? "✔️" : ""}
                                                    </td>
                                                    <td style={{ padding: "12px 8px" }}>
                                                        <span style={{ background: "rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>
                                                            {item.platform_name}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: "12px 8px", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.user_email}>
                                                        {item.user_email}
                                                    </td>
                                                    <td style={{ padding: "12px 8px", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.account_email}>
                                                        {item.account_email || <span style={{ color: "var(--muted)" }}>Sin asignar</span>}
                                                        {item.profile_number && <span style={{ opacity: 0.5 }}> (P{item.profile_number})</span>}
                                                    </td>
                                                    <td style={{ padding: "12px 8px", fontSize: 11, color: "var(--muted)" }}>
                                                        {item.expires_at ? new Date(item.expires_at).toLocaleDateString("es-CO") : "—"}
                                                    </td>
                                                    <td style={{ padding: "12px 8px" }}>
                                                        {renderDaysBadge(daysLeft)}
                                                    </td>
                                                    <td style={{ padding: "12px 8px", textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 6 }}>
                                                        <button
                                                            className="btn-ghost"
                                                            style={{ padding: "4px 8px", fontSize: 11, width: "auto", minHeight: 0, color: item.is_attended ? "#f59e0b" : "#10b981", border: `1px solid ${item.is_attended ? "#f59e0b55" : "#10b98155"}` }}
                                                            onClick={() => toggleAttended(item.id, item.is_attended)}
                                                        >
                                                            {item.is_attended ? "Desmarcar ❌" : "Atendido ✔️"}
                                                        </button>
                                                        <button
                                                            className="btn-ghost"
                                                            style={{ padding: "4px 10px", fontSize: 11, width: "auto", minHeight: 0 }}
                                                            onClick={() => navigate(`/admin/renewals`, { state: { orderId: item.id } })}
                                                        >
                                                            Renovar →
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Paginación */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
                            <button
                                className="btn"
                                disabled={page === 1}
                                onClick={() => setPage(page - 1)}
                                style={{ width: "auto", padding: "6px 14px", fontSize: 13, opacity: page === 1 ? 0.3 : 1 }}
                            >
                                Anterior
                            </button>

                            <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                                    Página <b style={{ color: "#fff" }}>{page}</b> de {totalPages || 1}
                                </span>
                                <select
                                    className="input"
                                    style={{ padding: "4px 8px", fontSize: 12, minWidth: 80 }}
                                    value={limit}
                                    onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                                >
                                    <option value="10">10 / pág</option>
                                    <option value="20">20 / pág</option>
                                    <option value="50">50 / pág</option>
                                    <option value="100">100 / pág</option>
                                </select>
                            </div>

                            <button
                                className="btn"
                                disabled={page === totalPages || totalPages === 0}
                                onClick={() => setPage(page + 1)}
                                style={{ width: "auto", padding: "6px 14px", fontSize: 13, opacity: (page === totalPages || totalPages === 0) ? 0.3 : 1 }}
                            >
                                Siguiente
                            </button>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
