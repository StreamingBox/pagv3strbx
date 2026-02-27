// FRONTEND: src/pages/admin/AdminCategories.jsx (o donde lo tengas)
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:3000").replace(/\/$/, "");

export default function AdminCategories() {
    const navigate = useNavigate();

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [sortOrder, setSortOrder] = useState(0);
    const [saving, setSaving] = useState(false);

    async function load() {
        setLoading(true);
        setError("");

        try {
            const res = await fetch(`${API_BASE}/admin/categories`, {
                credentials: "include", // ✅ cookies HttpOnly
            });

            const data = await res.json().catch(() => []);
            if (!res.ok) {
                throw new Error(data?.message || `Error cargando (${res.status})`);
            }

            setItems(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e?.message || "Error cargando.");
        } finally {
            setLoading(false);
        }
    }

    async function create() {
        setSaving(true);
        setError("");

        try {
            const res = await fetch(`${API_BASE}/admin/categories`, {
                method: "POST",
                credentials: "include", // ✅ cookies HttpOnly
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    slug: slug || undefined,
                    sort_order: Number(sortOrder || 0),
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || `No se pudo crear (${res.status})`);

            setName("");
            setSlug("");
            setSortOrder(0);

            await load();
            alert("Categoría creada ✅");
        } catch (e) {
            setError(e?.message || "Error creando.");
        } finally {
            setSaving(false);
        }
    }

    async function toggleActive(id, current) {
        try {
            const res = await fetch(`${API_BASE}/admin/categories/${id}`, {
                method: "PATCH",
                credentials: "include", // ✅ cookies HttpOnly
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: current ? 0 : 1 }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || `No se pudo actualizar (${res.status})`);

            await load();
        } catch (e) {
            alert(e?.message || "Error actualizando.");
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
                    <p className="nav-sub">Categorías</p>

                    {/* ✅ sin recargar */}
                    <div className="nav-item" onClick={() => navigate("/admin")}>
                        <span>Volver al panel</span>
                        <span style={{ opacity: 0.7 }}>→</span>
                    </div>

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
                    <h1 style={{ margin: 0 }}>Categorías</h1>
                    <p style={{ marginTop: 6, color: "rgba(234,241,255,.65)" }}>
                        Crea categorías para segmentar: Video, IA, Música, etc.
                    </p>

                    {error ? <div className="error">{error}</div> : null}

                    <div className="kpi" style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 900, marginBottom: 10 }}>Crear categoría</div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                            <label className="label">
                                Nombre
                                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                            </label>

                            <label className="label">
                                Slug (opcional)
                                <input className="input" value={slug} onChange={(e) => setSlug(e.target.value)} />
                            </label>

                            <label className="label">
                                Orden
                                <input
                                    className="input"
                                    type="number"
                                    value={sortOrder}
                                    onChange={(e) => setSortOrder(e.target.value)}
                                />
                            </label>
                        </div>

                        <button className="btn" style={{ marginTop: 12 }} onClick={create} disabled={saving || !name}>
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
                                        <th style={{ padding: "10px 8px" }}>Slug</th>
                                        <th style={{ padding: "10px 8px" }}>Orden</th>
                                        <th style={{ padding: "10px 8px" }}>Activo</th>
                                        <th style={{ padding: "10px 8px" }}></th>
                                    </tr>
                                    </thead>

                                    <tbody>
                                    {items.map((c) => (
                                        <tr key={c.id} style={{ borderTop: "1px solid rgba(46,123,255,.12)" }}>
                                            <td style={{ padding: "10px 8px" }}>#{c.id}</td>
                                            <td style={{ padding: "10px 8px" }}>{c.name}</td>
                                            <td style={{ padding: "10px 8px" }}>{c.slug}</td>
                                            <td style={{ padding: "10px 8px" }}>{c.sort_order}</td>
                                            <td style={{ padding: "10px 8px" }}>{c.is_active ? "Sí" : "No"}</td>
                                            <td style={{ padding: "10px 8px" }}>
                                                <button className="btn-ghost" onClick={() => toggleActive(c.id, c.is_active)}>
                                                    {c.is_active ? "Desactivar" : "Activar"}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}

                                    {!items.length ? (
                                        <tr>
                                            <td colSpan="6" style={{ padding: 12, color: "rgba(234,241,255,.65)" }}>
                                                No hay categorías.
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
