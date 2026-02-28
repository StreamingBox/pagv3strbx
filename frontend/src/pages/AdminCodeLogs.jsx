import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../api/api";

export default function AdminCodeLogs() {
    const navigate = useNavigate();

    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState("");
    const [platform, setPlatform] = useState("all");
    const [page, setPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    useEffect(() => {
        let mounted = true;

        async function load() {
            setLoading(true);
            try {
                const r = await apiGet("/admin/code-logs");

                // 401: no sesión o refresh falló
                if (r.status === 401) {
                    try {
                        localStorage.removeItem("user");
                        localStorage.removeItem("accessToken");
                        localStorage.removeItem("refreshToken");
                    } catch { }
                    navigate("/");
                    return;
                }

                if (!mounted) return;

                if (r.ok && r.data?.ok) setLogs(r.data.logs || []);
                else setLogs([]);
            } catch {
                if (!mounted) return;
                setLogs([]);
            } finally {
                if (mounted) setLoading(false);
            }
        }

        load();
        return () => {
            mounted = false;
        };
    }, [navigate]);

    const platforms = useMemo(() => {
        const set = new Set();
        logs.forEach((l) => {
            if (l.platform_slug) set.add(l.platform_slug);
        });
        return ["all", ...Array.from(set).sort()];
    }, [logs]);

    const filtered = useMemo(() => {
        const query = q.trim().toLowerCase();

        let result = logs.filter((l) => {
            if (platform !== "all" && l.platform_slug !== platform) return false;
            if (!query) return true;

            const hay = [
                l.id,
                l.order_id,
                l.platform_slug,
                l.order_email,
                l.requested_by,
                l.delivered_code,
                l.status,
                l.requester_ip,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return hay.includes(query);
        });

        // Ordenar por fecha más reciente por defecto
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return result;
    }, [logs, q, platform]);

    useEffect(() => {
        setPage(1);
    }, [q, platform, itemsPerPage]);

    const paginated = useMemo(() => {
        const start = (page - 1) * itemsPerPage;
        return filtered.slice(start, start + itemsPerPage);
    }, [filtered, page, itemsPerPage]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));

    function statusBadge(status) {
        const s = String(status || "").toLowerCase();
        let color = "#6b7280"; // neutral
        if (s.includes("delivered") || s.includes("success")) color = "#10b981";
        else if (s.includes("blocked") || s.includes("limit")) color = "#ef4444";
        else if (s.includes("expired")) color = "#f59e0b";
        else if (s.includes("no_account")) color = "#3b82f6";

        return (
            <span style={{
                display: "inline-block",
                border: `1px solid ${color}66`,
                color: color,
                backgroundColor: `${color}15`,
                padding: "2px 8px",
                borderRadius: "12px",
                fontSize: "11px",
                fontWeight: 600
            }}>
                {status}
            </span>
        );
    }

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                {/* Sidebar */}
                <aside className="sidebar">
                    <div className="nav-title">Admin</div>
                    <p className="nav-sub">Logs de Códigos</p>
                    <div className="nav-item" onClick={() => navigate("/admin")}>
                        <span>Volver al panel</span><span style={{ opacity: 0.7 }}>→</span>
                    </div>
                </aside>

                <main className="main">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, gap: 20, flexWrap: "wrap" }}>
                        <div>
                            <h1 style={{ margin: "0 0 6px" }}>📜 Logs de Códigos</h1>
                            <p style={{ color: "var(--muted)", margin: 0 }}>
                                Registro de solicitudes, estado, IP, usuario y código entregado.
                            </p>
                        </div>
                        <div style={{ display: "flex", gap: 12 }}>
                            <div className="kpi" style={{ padding: "10px 16px", minWidth: 100 }}>
                                <div style={{ fontSize: 11, color: "var(--muted)" }}>Total</div>
                                <div style={{ fontSize: 18, fontWeight: 800 }}>{logs.length}</div>
                            </div>
                            <div className="kpi" style={{ padding: "10px 16px", minWidth: 100 }}>
                                <div style={{ fontSize: 11, color: "var(--muted)" }}>Mostrando</div>
                                <div style={{ fontSize: 18, fontWeight: 800 }}>{filtered.length}</div>
                            </div>
                        </div>
                    </div>

                    <div className="kpi" style={{ padding: 20 }}>
                        {/* Controles: Buscar y Filtro */}
                        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                            <input
                                className="input"
                                style={{ flex: 1, minWidth: 250 }}
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="🔎 Buscar por pedido, correo, IP, usuario, código..."
                            />
                            <select
                                className="input"
                                style={{ minWidth: 200 }}
                                value={platform}
                                onChange={(e) => setPlatform(e.target.value)}
                            >
                                {platforms.map((p) => (
                                    <option key={p} value={p}>
                                        {p === "all" ? "Todas las plataformas" : p}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Tabla */}
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                                <thead>
                                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", color: "var(--muted)" }}>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>ID</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>Pedido</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>Plataforma</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>Correo</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>Usuario</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>Código</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>Estado</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>IP</th>
                                        <th style={{ padding: "12px 8px", fontWeight: 600 }}>Fecha</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={9} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Cargando logs...</td></tr>
                                    ) : paginated.length === 0 ? (
                                        <tr><td colSpan={9} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>No hay registros que coincidan con la búsqueda.</td></tr>
                                    ) : (
                                        paginated.map((l) => (
                                            <tr key={l.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                                <td style={{ padding: "12px 8px", fontFamily: "monospace", opacity: 0.8 }}>{l.id}</td>
                                                <td style={{ padding: "12px 8px", fontFamily: "monospace", opacity: 0.8 }}>{l.order_id}</td>
                                                <td style={{ padding: "12px 8px" }}>
                                                    <span style={{ background: "rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>
                                                        {l.platform_slug}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "12px 8px", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.order_email}>
                                                    {l.order_email}
                                                </td>
                                                <td style={{ padding: "12px 8px", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.requested_by || ""}>
                                                    {l.requested_by || "-"}
                                                </td>
                                                <td style={{ padding: "12px 8px", fontFamily: "monospace", fontWeight: 700 }}>
                                                    {l.delivered_code || "-"}
                                                </td>
                                                <td style={{ padding: "12px 8px" }}>
                                                    {statusBadge(l.status)}
                                                </td>
                                                <td style={{ padding: "12px 8px", fontFamily: "monospace", fontSize: 11, opacity: 0.7 }}>
                                                    {l.requester_ip}
                                                </td>
                                                <td style={{ padding: "12px 8px", fontSize: 11, color: "var(--muted)" }}>
                                                    {new Date(l.created_at).toLocaleString("es-CO")}
                                                </td>
                                            </tr>
                                        ))
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
                                    Página <b style={{ color: "#fff" }}>{page}</b> de {totalPages}
                                </span>
                                <select
                                    className="input"
                                    style={{ padding: "4px 8px", fontSize: 12 }}
                                    value={itemsPerPage}
                                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                                >
                                    <option value={10}>10 / pág</option>
                                    <option value={20}>20 / pág</option>
                                    <option value={30}>30 / pág</option>
                                    <option value={50}>50 / pág</option>
                                    <option value={100}>100 / pág</option>
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
