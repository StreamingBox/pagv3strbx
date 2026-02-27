import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost, apiPatch } from "../api/api"; // ✅ Ajusta si tu archivo NO está en src/pages/

export default function AdminPlatforms() {
    const navigate = useNavigate();

    const [platforms, setPlatforms] = useState([]);
    const [categories, setCategories] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [categoryId, setCategoryId] = useState(""); // para crear
    const [saving, setSaving] = useState(false);

    async function load() {
        setLoading(true);
        setError("");

        try {
            // 1) plataformas
            const r1 = await apiGet("/admin/platforms");
            if (!r1.ok) throw new Error(r1.data?.message || "No se pudo cargar plataformas.");
            setPlatforms(Array.isArray(r1.data) ? r1.data : []);

            // 2) categorías
            const r2 = await apiGet("/admin/categories");
            if (!r2.ok) throw new Error(r2.data?.message || "No se pudo cargar categorías.");
            setCategories(Array.isArray(r2.data) ? r2.data : []);
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
            const r = await apiPost("/admin/platforms", {
                name,
                slug,
                category_id: categoryId ? Number(categoryId) : null,
            });

            if (!r.ok) throw new Error(r.data?.message || "No se pudo crear.");

            setName("");
            setSlug("");
            setCategoryId("");
            await load();
            alert("Plataforma creada ✅");
        } catch (e) {
            setError(e?.message || "Error creando.");
        } finally {
            setSaving(false);
        }
    }

    async function updateCategory(platformId, newCategoryId) {
        try {
            const r = await apiPatch(`/admin/platforms/${platformId}`, {
                category_id: newCategoryId === "" ? null : Number(newCategoryId),
            });

            if (!r.ok) throw new Error(r.data?.message || "No se pudo actualizar categoría.");
            await load();
        } catch (e) {
            alert(e?.message || "Error actualizando.");
        }
    }

    // Toggle: internacional ON/OFF
    // ON  -> COP,MXN,USD
    // OFF -> COP
    async function updateInternational(platformId, enabled) {
        try {
            const r = await apiPatch(`/admin/platforms/${platformId}`, {
                allowed_currencies: enabled ? ["COP", "MXN", "USD"] : ["COP"],
            });

            if (!r.ok) throw new Error(r.data?.message || "No se pudo actualizar monedas.");
            await load();
        } catch (e) {
            alert(e?.message || "Error actualizando.");
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line
    }, []);

    const activeCategories = useMemo(
        () =>
            categories
                .filter((c) => c.is_active)
                .sort((a, b) => Number(a.sort_order) - Number(b.sort_order)),
        [categories]
    );

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                <aside className="sidebar">
                    <div className="nav-title">Admin</div>
                    <p className="nav-sub">Plataformas / Productos</p>

                    {/* ✅ Volver al admin (sin meter imports dentro del JSX) */}
                    <button className="btn-ghost" style={{ width: "100%" }} onClick={() => navigate("/admin")}>
                        Volver al Admin
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
                    <h1 style={{ margin: 0 }}>Plataformas</h1>
                    <p style={{ marginTop: 6, color: "rgba(234,241,255,.65)" }}>
                        Crea y administra las plataformas (productos) y asigna su categoría.
                    </p>

                    {error ? <div className="error">{error}</div> : null}

                    {/* Crear plataforma */}
                    <div className="kpi" style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 900, marginBottom: 10 }}>Crear plataforma</div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                            <label className="label">
                                Nombre
                                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                            </label>

                            <label className="label">
                                Slug (ej: netflix)
                                <input className="input" value={slug} onChange={(e) => setSlug(e.target.value)} />
                            </label>

                            <label className="label">
                                Categoría
                                <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                                    <option value="">(Sin categoría)</option>
                                    {activeCategories.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <button className="btn" style={{ marginTop: 12 }} onClick={create} disabled={saving || !name || !slug}>
                            {saving ? "Guardando..." : "Crear"}
                        </button>
                    </div>

                    {/* Listado */}
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
                                            <th style={{ padding: "10px 8px" }}>Categoría</th>
                                            <th style={{ padding: "10px 8px" }}>Venta internacional</th>
                                            <th style={{ padding: "10px 8px" }}>Activo</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {platforms.map((p) => {
                                            const allowed = String(p.allowed_currencies || "COP,MXN,USD").toUpperCase();
                                            const isInternational = allowed.includes("MXN") || allowed.includes("USD");

                                            return (
                                                <tr key={p.id} style={{ borderTop: "1px solid rgba(46,123,255,.12)" }}>
                                                    <td style={{ padding: "10px 8px" }}>#{p.id}</td>
                                                    <td style={{ padding: "10px 8px" }}>{p.name}</td>
                                                    <td style={{ padding: "10px 8px" }}>{p.slug}</td>

                                                    <td style={{ padding: "10px 8px" }}>
                                                        <select
                                                            className="input"
                                                            value={p.category_id ?? ""}
                                                            onChange={(e) => updateCategory(p.id, e.target.value)}
                                                        >
                                                            <option value="">(Sin categoría)</option>
                                                            {activeCategories.map((c) => (
                                                                <option key={c.id} value={c.id}>
                                                                    {c.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>

                                                    <td style={{ padding: "10px 8px" }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => updateInternational(p.id, !isInternational)}
                                                            style={{
                                                                border: "1px solid rgba(46,123,255,.25)",
                                                                background: isInternational ? "rgba(46,123,255,.22)" : "rgba(255,255,255,.06)",
                                                                color: "rgba(234,241,255,.92)",
                                                                padding: "8px 12px",
                                                                borderRadius: 999,
                                                                fontWeight: 800,
                                                                cursor: "pointer",
                                                                display: "inline-flex",
                                                                alignItems: "center",
                                                                gap: 8,
                                                                whiteSpace: "nowrap",
                                                                marginBottom: 6
                                                            }}
                                                            title={isInternational ? "Se vende fuera de Colombia" : "Solo Colombia (COP)"}
                                                        >
                                                            <span
                                                                style={{
                                                                    width: 10,
                                                                    height: 10,
                                                                    borderRadius: 999,
                                                                    background: isInternational ? "rgba(46,123,255,1)" : "rgba(234,241,255,.35)",
                                                                    display: "inline-block",
                                                                }}
                                                            />
                                                            {isInternational ? "Internacional" : "Solo COP"}
                                                        </button>
                                                        <br />
                                                        <label
                                                            style={{
                                                                border: "1px solid rgba(16, 185, 129, 0.3)",
                                                                background: "rgba(16, 185, 129, 0.1)",
                                                                color: "#10b981",
                                                                padding: "6px 10px",
                                                                borderRadius: 6,
                                                                fontWeight: 700,
                                                                fontSize: "12px",
                                                                cursor: "pointer",
                                                                display: "inline-flex",
                                                                alignItems: "center",
                                                                gap: 4
                                                            }}
                                                        >
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                                                            </svg>
                                                            Subir Logo
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                style={{ display: "none" }}
                                                                onChange={async (e) => {
                                                                    const file = e.target.files[0];
                                                                    if (!file) return;

                                                                    const formData = new FormData();
                                                                    formData.append("logo", file);
                                                                    formData.append("slug", p.slug);

                                                                    try {
                                                                        let base = "http://localhost:8000/api";
                                                                        if (import.meta.env.VITE_API_BASE) {
                                                                            base = import.meta.env.VITE_API_BASE.replace(/\/+$/, "") + "/api";
                                                                        }
                                                                        const res = await fetch(`${base}/upload/platform-logo`, {
                                                                            method: "POST",
                                                                            body: formData
                                                                        });

                                                                        let json = {};
                                                                        try { json = await res.json(); } catch (e) { }

                                                                        if (res.ok) {
                                                                            alert("Logo subido correctamente: " + p.slug + ".png");
                                                                        } else {
                                                                            alert("Error subiendo logo: " + (json.error || res.statusText));
                                                                        }
                                                                    } catch (err) {
                                                                        alert("Error de conexión subiendo logo: " + err.message);
                                                                    }
                                                                    e.target.value = null; // reset
                                                                }}
                                                            />
                                                        </label>
                                                    </td>

                                                    <td style={{ padding: "10px 8px" }}>{p.is_active ? "Sí" : "No"}</td>
                                                </tr>
                                            );
                                        })}

                                        {!platforms.length ? (
                                            <tr>
                                                <td colSpan="6" style={{ padding: 12, color: "rgba(234,241,255,.65)" }}>
                                                    No hay plataformas.
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
