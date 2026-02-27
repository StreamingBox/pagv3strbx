import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPatch } from "../api/api";


export default function AdminInventory() {
    const [platforms, setPlatforms] = useState([]);
    const [items, setItems] = useState([]);

    const [platformId, setPlatformId] = useState("");
    const [status, setStatus] = useState(""); // available | assigned | sold | inactive | down
    const [q, setQ] = useState("");

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

    async function loadInventory() {
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams();
            if (platformId) params.set("platformId", platformId);
            if (status) params.set("status", status);
            if (q) params.set("q", q);

            const r = await apiGet(`/admin/inventory?${params.toString()}`);
            if (!r.ok) throw new Error(r.data?.message || "No se pudo cargar inventario.");
            setItems(Array.isArray(r.data) ? r.data : []);
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
            const p = await loadPlatforms();
            setPlatforms(p);
            await loadInventory();
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
            await loadInventory();
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

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
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
                                Buscar (email)
                                <input
                                    className="input"
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="correo o plataforma..."
                                />
                            </label>
                        </div>

                        <div style={{ marginTop: 10, color: "rgba(234,241,255,.7)" }}>
                            Plataforma: <b>{selectedPlatform?.name || "Todas"}</b> — Registros: <b>{items.length}</b>
                        </div>

                        <button className="btn" style={{ marginTop: 12 }} onClick={loadInventory} disabled={loading}>
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
