// FRONTEND: src/pages/admin/AdminDurations.jsx (o donde lo tengas)
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:3000").replace(/\/$/, "");

export default function AdminDurations() {
    const navigate = useNavigate();

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    // create form
    const [name, setName] = useState("");
    const [days, setDays] = useState("");

    async function load() {
        setLoading(true);
        setError("");

        try {
            const res = await fetch(`${API_BASE}/admin/durations`, {
                credentials: "include",
            });

            const data = await res.json().catch(() => []);
            if (!res.ok) throw new Error(data?.message || "No se pudo cargar duraciones.");

            setRows(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e.message || "Error cargando duraciones.");
        } finally {
            setLoading(false);
        }
    }

    async function create() {
        setSaving(true);
        setError("");

        try {
            const res = await fetch(`${API_BASE}/admin/durations`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, days: Number(days) }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "No se pudo crear la duración.");

            setName("");
            setDays("");
            await load();
            alert("Duración creada ✅");
        } catch (e) {
            setError(e.message || "Error creando duración.");
        } finally {
            setSaving(false);
        }
    }

    async function patch(id, patchBody) {
        setSaving(true);
        setError("");

        try {
            const res = await fetch(`${API_BASE}/admin/durations/${id}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patchBody),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "No se pudo actualizar.");

            await load();
        } catch (e) {
            setError(e.message || "Error actualizando.");
        } finally {
            setSaving(false);
        }
    }

    async function deactivate(id) {
        setSaving(true);
        setError("");

        try {
            const res = await fetch(`${API_BASE}/admin/durations/${id}`, {
                method: "DELETE",
                credentials: "include",
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "No se pudo desactivar.");

            await load();
        } catch (e) {
            setError(e.message || "Error desactivando.");
        } finally {
            setSaving(false);
        }
    }

    useEffect(() => {
        load();
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
                    <p className="nav-sub">Duraciones</p>

                    {/* ✅ Navegación correcta */}
                    <button
                        className="btn-ghost"
                        style={{ width: "100%" }}
                        onClick={() => navigate("/admin")}
                    >
                        ⬅ Volver al panel
                    </button>

                    <button
                        className="btn-ghost"
                        style={{ width: "100%", marginTop: 10 }}
                        onClick={load}
                        disabled={loading}
                    >
                        {loading ? "Cargando..." : "Refrescar"}
                    </button>
                </aside>

                <main className="main">
                    <h1 style={{ margin: 0 }}>Duraciones</h1>
                    <p style={{ marginTop: 6, color: "rgba(234,241,255,.65)" }}>
                        Crear y administrar duraciones (ej: 30 días, 60 días, etc).
                    </p>

                    {error ? <div className="error">{error}</div> : null}

                    <div className="kpi" style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 900, marginBottom: 10 }}>Crear duración</div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <label className="label">
                                Nombre (ej: Mensual)
                                <input
                                    className="input"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </label>

                            <label className="label">
                                Días (ej: 30)
                                <input
                                    className="input"
                                    type="number"
                                    value={days}
                                    onChange={(e) => setDays(e.target.value)}
                                />
                            </label>
                        </div>

                        <button
                            className="btn"
                            style={{ marginTop: 12 }}
                            onClick={create}
                            disabled={saving || !name || !days}
                        >
                            {saving ? "Guardando..." : "Crear"}
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
                                        <th style={{ padding: "10px 8px" }}>Nombre</th>
                                        <th style={{ padding: "10px 8px" }}>Días</th>
                                        <th style={{ padding: "10px 8px" }}>Activo</th>
                                        <th style={{ padding: "10px 8px" }}>Acciones</th>
                                    </tr>
                                    </thead>

                                    <tbody>
                                    {rows.map((r) => (
                                        <DurRow
                                            key={r.id}
                                            r={r}
                                            saving={saving}
                                            onPatch={patch}
                                            onDeactivate={deactivate}
                                        />
                                    ))}

                                    {!rows.length ? (
                                        <tr>
                                            <td colSpan="5" style={{ padding: 12, color: "rgba(234,241,255,.65)" }}>
                                                No hay duraciones.
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

function DurRow({ r, saving, onPatch, onDeactivate }) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(String(r.name ?? ""));
    const [days, setDays] = useState(String(r.days ?? ""));

    useEffect(() => {
        setName(String(r.name ?? ""));
        setDays(String(r.days ?? ""));
    }, [r.name, r.days]);

    return (
        <tr style={{ borderTop: "1px solid rgba(46,123,255,.12)" }}>
            <td style={{ padding: "10px 8px" }}>#{r.id}</td>

            <td style={{ padding: "10px 8px" }}>
                {editing ? (
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                ) : (
                    r.name
                )}
            </td>

            <td style={{ padding: "10px 8px" }}>
                {editing ? (
                    <input
                        className="input"
                        type="number"
                        value={days}
                        onChange={(e) => setDays(e.target.value)}
                    />
                ) : (
                    r.days
                )}
            </td>

            <td style={{ padding: "10px 8px" }}>{r.is_active ? "Sí" : "No"}</td>

            <td style={{ padding: "10px 8px" }}>
                <button
                    className="btn-ghost"
                    disabled={saving}
                    onClick={() => onPatch(r.id, { is_active: r.is_active ? 0 : 1 })}
                >
                    {r.is_active ? "Desactivar" : "Activar"}
                </button>{" "}
                {!editing ? (
                    <button className="btn-ghost" disabled={saving} onClick={() => setEditing(true)}>
                        Editar
                    </button>
                ) : (
                    <>
                        <button
                            className="btn-ghost"
                            disabled={saving || !name || !days}
                            onClick={() => {
                                onPatch(r.id, { name, days: Number(days) });
                                setEditing(false);
                            }}
                        >
                            Guardar
                        </button>{" "}
                        <button className="btn-ghost" disabled={saving} onClick={() => setEditing(false)}>
                            Cancelar
                        </button>
                    </>
                )}{" "}
                <button className="btn-ghost" disabled={saving} onClick={() => onDeactivate(r.id)}>
                    Borrar (soft)
                </button>
            </td>
        </tr>
    );
}
