import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPatch } from "../api/api";


export default function AdminInventory() {
    const [platforms, setPlatforms] = useState([]);
    const [users, setUsers] = useState([]);
    const [items, setItems] = useState([]);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(5);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    const [platformId, setPlatformId] = useState("");
    const [status, setStatus] = useState(""); // available | assigned | sold | inactive | down
    const [q, setQ] = useState("");
    const [assignedTo, setAssignedTo] = useState("");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const navigate = useNavigate();

    const selectedPlatform = useMemo(
        () => platforms.find((p) => String(p.id) === String(platformId)),
        [platforms, platformId]
    );

    async function loadPlatforms() {
        const r = await apiGet("/admin/platforms");
        if (!r.ok) throw new Error(r.data?.message || "No se pudo cargar plataformas.");
        return Array.isArray(r.data) ? r.data : [];
    }

    async function loadUsers() {
        const r = await apiGet("/admin/users");
        if (!r.ok) throw new Error(r.data?.message || "No se pudo cargar usuarios.");
        return Array.isArray(r.data) ? r.data : [];
    }

    async function loadInventory(pageNum = page, currentLimit = limit) {
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams();
            if (platformId) params.set("platformId", platformId);
            if (status) params.set("status", status);
            if (q) params.set("q", q);
            if (assignedTo) params.set("assignedTo", assignedTo);
            params.set("page", pageNum);
            params.set("limit", currentLimit);

            const r = await apiGet(`/admin/inventory?${params.toString()}`);
            if (!r.ok) throw new Error(r.data?.message || "No se pudo cargar inventario.");

            setItems(r.data?.items || []);
            setTotalPages(r.data?.totalPages || 1);
            setTotal(r.data?.total || 0);
            setPage(pageNum);
            setLimit(currentLimit);
        } catch (e) {
            setError(e?.message || "Error cargando inventario.");
        } finally {
            setLoading(false);
        }
    }

    async function refreshAll() {
        setLoading(true);
        setError("");
        try {
            const [p, u] = await Promise.all([loadPlatforms(), loadUsers()]);
            setPlatforms(p);
            setUsers(u);
            await loadInventory(1);
        } catch (e) {
            setError(e?.message || "Error cargando.");
        } finally {
            setLoading(false);
        }
    }

    async function updateItem(id, patch) {
        setSaving(true);
        setError("");
        try {
            const r = await apiPatch(`/admin/inventory/${id}`, patch);
            if (!r.ok) throw new Error(r.data?.message || "No se pudo actualizar.");
            await loadInventory(page);
        } catch (e) {
            setError(e?.message || "Error actualizando.");
        } finally {
            setSaving(false);
        }
    }

    useEffect(() => {
        refreshAll();
        // eslint-disable-next-line
    }, []);

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                <aside className="sidebar">
                    <div className="nav-title">Admin</div>
                    <p className="nav-sub">Inventario</p>

                    <button className="btn-ghost" style={{ width: "100%" }} onClick={() => navigate("/admin")}>
                        Volver al Admin
                    </button>

                    <button
                        className="btn-ghost"
                        style={{ width: "100%", marginTop: 10 }}
                        onClick={refreshAll}
                        disabled={loading}
                    >
                        {loading ? "Cargando..." : "Refrescar"}
                    </button>
                </aside>

                <main className="main">
                    <h1 style={{ margin: 0 }}>Inventario (Cuentas)</h1>
                    <p style={{ marginTop: 6, color: "rgba(234,241,255,.65)" }}>
                        Ver disponibles / asignadas (vendidas) y gestionar estados.
                    </p>

                    {error ? <div className="error">{error}</div> : null}

                    <div className="kpi" style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 900, marginBottom: 10 }}>Filtros</div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                            <label className="label">
                                Plataforma
                                <select className="input" value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
                                    <option value="">Todas</option>
                                    {platforms.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            #{p.id} - {p.name}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="label">
                                Estado
                                <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                                    <option value="">Todos</option>
                                    <option value="available">Disponibles</option>
                                    <option value="assigned">Asignadas (vendidas)</option>
                                    <option value="sold">Vendidas (alias)</option>
                                    <option value="inactive">Inactivas</option>
                                    <option value="down">Caídas</option>
                                </select>
                            </label>

                            <label className="label">
                                Asignada a (email)
                                <select className="input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                                    <option value="">Cualquiera</option>
                                    {users.map((u) => (
                                        <option key={u.id} value={u.email}>
                                            {u.name} ({u.email})
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="label">
                                Buscar
                                <input
                                    className="input"
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="correo, plataforma..."
                                />
                            </label>
                        </div>

                        <div style={{ marginTop: 10, color: "rgba(234,241,255,.7)" }}>
                            Plataforma: <b>{selectedPlatform?.name || "Todas"}</b> — Registros totales: <b>{total}</b>
                        </div>

                        <button className="btn" style={{ marginTop: 12 }} onClick={() => loadInventory(1)} disabled={loading}>
                            Aplicar filtros
                        </button>
                    </div>

                    <div className="kpi" style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 900, marginBottom: 10 }}>Listado</div>

                        {loading ? (
                            <div style={{ color: "rgba(234,241,255,.65)" }}>Cargando...</div>
                        ) : (
                            <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <thead>
                                        <tr style={{ textAlign: "left", color: "rgba(234,241,255,.75)" }}>
                                            <th style={{ padding: "10px 8px" }}>ID</th>
                                            <th style={{ padding: "10px 8px" }}>Plataforma</th>
                                            <th style={{ padding: "10px 8px" }}>Email</th>
                                            <th style={{ padding: "10px 8px" }}>Status</th>
                                            <th style={{ padding: "10px 8px" }}>Asignada a</th>
                                            <th style={{ padding: "10px 8px" }}>Expira</th>
                                            <th style={{ padding: "10px 8px" }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((it) => (
                                            <InvRow key={it.id} it={it} saving={saving} onUpdate={(patch) => updateItem(it.id, patch)} />
                                        ))}

                                        {!items.length ? (
                                            <tr>
                                                <td colSpan="7" style={{ padding: 12, color: "rgba(234,241,255,.65)" }}>
                                                    No hay registros con esos filtros.
                                                </td>
                                            </tr>
                                        ) : null}
                                    </tbody>
                                </table>
                                <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end", paddingRight: 10 }}>
                                    <div style={{ color: "rgba(234,241,255,.8)", marginRight: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                                        <span>Mostrar:</span>
                                        <select
                                            className="input"
                                            style={{ padding: "4px 8px", width: "auto" }}
                                            value={limit}
                                            onChange={(e) => loadInventory(1, Number(e.target.value))}
                                        >
                                            <option value={5}>5</option>
                                            <option value={10}>10</option>
                                            <option value={20}>20</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                        </select>
                                    </div>
                                    <button className="btn-ghost" disabled={page <= 1 || loading} onClick={() => loadInventory(page - 1)}>
                                        Anterior
                                    </button>
                                    <span style={{ color: "rgba(234,241,255,.8)" }}>Página {page} de {totalPages || 1}</span>
                                    <button className="btn-ghost" disabled={page >= totalPages || loading} onClick={() => loadInventory(page + 1)}>
                                        Siguiente
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}

function InvRow({ it, saving, onUpdate }) {
    const [show, setShow] = useState(false);

    const statusLabel =
        it.status === "available"
            ? "Disponible"
            : it.status === "assigned"
                ? "Asignada (vendida)"
                : it.status === "inactive"
                    ? "Inactiva"
                    : it.status === "down"
                        ? "Caída"
                        : String(it.status);

    return (
        <tr style={{ borderTop: "1px solid rgba(46,123,255,.12)" }}>
            <td style={{ padding: "10px 8px" }}>#{it.id}</td>
            <td style={{ padding: "10px 8px" }}>{it.platform_name}</td>
            <td style={{ padding: "10px 8px" }}>{it.email}</td>
            <td style={{ padding: "10px 8px" }}>{statusLabel}</td>
            <td style={{ padding: "10px 8px" }}>
                {it.assigned_user_email ? it.assigned_user_email : <span style={{ color: "rgba(234,241,255,.55)" }}>—</span>}
            </td>
            <td style={{ padding: "10px 8px" }}>
                {it.expires_at ? String(it.expires_at).slice(0, 10) : <span style={{ color: "rgba(234,241,255,.55)" }}>—</span>}
            </td>
            <td style={{ padding: "10px 8px" }}>
                <button className="btn-ghost" disabled={saving} onClick={() => setShow((s) => !s)}>
                    {show ? "Ocultar" : "Ver credenciales"}
                </button>{" "}
                <button className="btn-ghost" disabled={saving} onClick={() => onUpdate({ status: "available" })}>
                    Marcar disponible
                </button>{" "}
                <button className="btn-ghost" disabled={saving} onClick={() => onUpdate({ status: "inactive" })}>
                    Marcar inactiva
                </button>{" "}
                <button className="btn-ghost" disabled={saving} onClick={() => onUpdate({ status: "down" })}>
                    Marcar caída
                </button>{" "}
                <button className="btn-ghost" disabled={saving} onClick={() => onUpdate({ reset_assign: true })}>
                    Reset asignación
                </button>

                {show ? (
                    <div style={{ marginTop: 10, padding: 10, border: "1px solid rgba(46,123,255,.12)", borderRadius: 12 }}>
                        <div style={{ fontWeight: 900, marginBottom: 6 }}>Credenciales</div>
                        <div style={{ color: "rgba(234,241,255,.8)" }}>
                            <div>
                                <b>Email:</b> {it.email}
                            </div>
                            <div>
                                <b>Password:</b> {it.password}
                            </div>
                            <div>
                                <b>Perfil:</b> {it.profile_number ?? "-"}
                            </div>
                            <div>
                                <b>Pin:</b> {it.pin ?? "-"}
                            </div>
                        </div>
                    </div>
                ) : null}
            </td>
        </tr>
    );
}
