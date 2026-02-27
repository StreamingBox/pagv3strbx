import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/adminCodeLogs.css";
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
                    localStorage.removeItem("user");
                    navigate("/login");
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

    // Resetear a página 1 si cambian los filtros o la cantidad de ítems por página
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

        if (s.includes("delivered") || s.includes("success")) return "ok";
        if (s.includes("blocked") || s.includes("limit")) return "danger";
        if (s.includes("expired")) return "warn";
        if (s.includes("no_account")) return "info";

        return "neutral";
    }

    if (loading) {
        return (
            <div className="aclPage">
                <div className="aclCard">
                    <div className="aclLoading">
                        <span className="aclSpinner" />
                        Cargando logs...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="aclPage">
            <div className="aclCard">
                {/* Header */}
                <div className="aclHeader">
                    <div>
                        <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
                            <button className="btn" onClick={() => navigate("/admin")} style={{ fontSize: "12px", padding: "6px 12px", background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}>
                                ← Volver a Admin
                            </button>
                            <button className="btn" onClick={() => navigate("/dashboard")} style={{ fontSize: "12px", padding: "6px 12px", background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}>
                                Ir al Dashboard
                            </button>
                        </div>
                        <h2 className="aclTitle">Historial de Códigos</h2>
                        <p className="aclSub">
                            Registro de solicitudes, estado, IP, usuario y código entregado.
                        </p>
                    </div>

                    <div className="aclStats">
                        <div className="aclStat">
                            <div className="aclStatLabel">Total</div>
                            <div className="aclStatValue">{logs.length}</div>
                        </div>
                        <div className="aclStat">
                            <div className="aclStatLabel">Mostrando</div>
                            <div className="aclStatValue">{filtered.length}</div>
                        </div>
                    </div>
                </div>

                {/* Controls */}
                <div className="aclControls">
                    <div className="aclSearchWrap">
                        <span className="aclSearchIcon">🔎</span>
                        <input
                            className="aclSearch"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Buscar por pedido, correo, IP, usuario, código..."
                        />
                    </div>

                    <select
                        className="aclSelect"
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value)}
                    >
                        {platforms.map((p) => (
                            <option key={p} value={p}>
                                {p === "all" ? "Todas las plataformas" : p}
                            </option>
                        ))}
                    </select>
                </div >

                {/* Table */}
                < div className="aclTableWrap" >
                    <table className="aclTable">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Pedido</th>
                                <th>Plataforma</th>
                                <th>Correo</th>
                                <th>Usuario</th>
                                <th>Código</th>
                                <th>Estado</th>
                                <th>IP</th>
                                <th>Fecha</th>
                            </tr>
                        </thead>

                        <tbody>
                            {paginated.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="aclEmpty">
                                        No hay registros con ese filtro.
                                    </td>
                                </tr>
                            ) : (
                                paginated.map((l) => (
                                    <tr key={l.id}>
                                        <td className="aclMono">{l.id}</td>
                                        <td className="aclMono">{l.order_id}</td>
                                        <td>
                                            <span className="aclPlatform">{l.platform_slug}</span>
                                        </td>
                                        <td className="aclEllipsis" title={l.order_email}>
                                            {l.order_email}
                                        </td>
                                        <td className="aclEllipsis" title={l.requested_by || ""}>
                                            {l.requested_by || "-"}
                                        </td>
                                        <td className="aclMono">{l.delivered_code || "-"}</td>
                                        <td>
                                            <span className={`aclBadge ${statusBadge(l.status)}`}>
                                                {l.status}
                                            </span>
                                        </td>
                                        <td className="aclMono">{l.requester_ip}</td>
                                        <td className="aclMono">
                                            {new Date(l.created_at).toLocaleString()}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div >

                {/* Paginación */}
                < div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", padding: "0 10px" }
                }>
                    <button
                        className="btn"
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                        style={{ padding: "8px 16px", fontSize: "13px", opacity: page === 1 ? 0.5 : 1, cursor: page === 1 ? "not-allowed" : "pointer" }}
                    >
                        Anterior
                    </button>

                    <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                        <span style={{ fontSize: "13px", color: "var(--muted)" }}>
                            Página {page} de {totalPages}
                        </span>
                        <select
                            className="aclSelect"
                            style={{ height: "34px", fontSize: "13px", padding: "0 10px", width: "100px", borderRadius: "8px" }}
                            value={itemsPerPage}
                            onChange={(e) => setItemsPerPage(Number(e.target.value))}
                        >
                            <option value={10}>10 / pág</option>
                            <option value={20}>20 / pág</option>
                            <option value={30}>30 / pág</option>
                            <option value={50}>50 / pág</option>
                            <option value={100}>100/ pág</option>
                        </select>
                    </div>

                    <button
                        className="btn"
                        disabled={page === totalPages || totalPages === 0}
                        onClick={() => setPage(page + 1)}
                        style={{ padding: "8px 16px", fontSize: "13px", opacity: (page === totalPages || totalPages === 0) ? 0.5 : 1, cursor: (page === totalPages || totalPages === 0) ? "not-allowed" : "pointer" }}
                    >
                        Siguiente
                    </button>
                </div >
            </div >
        </div >
    );
}
