import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiLogout } from "../api/api.js";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";

import { getApiBase } from "../config/apiBase.js";

const API_BASE = getApiBase();
const LOGO_URL = "/api/branding/logo";

async function apiFetch(path, opts = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
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
    if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
    return data;
}

function slugify(text) {
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const inputStyle = {
    appearance: "none", height: 42, padding: "0 14px",
    background: "var(--bg0)", color: "var(--text)",
    border: "1px solid var(--stroke)", borderRadius: 10,
    fontSize: 14, fontWeight: 500, outline: "none", width: "100%",
    fontFamily: "var(--font)", transition: "border-color 0.2s",
};

export default function AdminCategories() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [slugManual, setSlugManual] = useState(false);
    const [sortOrder, setSortOrder] = useState(0);
    const [saving, setSaving] = useState(false);

    const [q, setQ] = useState("");
    const [editingOrder, setEditingOrder] = useState(null); // id of row being edited
    const [editingOrderValue, setEditingOrderValue] = useState("");

    async function logout() {
        try { await apiLogout(); } catch { }
        setUser(null);
        try { localStorage.removeItem("user"); localStorage.removeItem("accessToken"); localStorage.removeItem("refreshToken"); } catch { }
        navigate("/", { replace: true });
    }

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const data = await apiFetch("/admin/categories");
            if (data) setItems(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e?.message || "Error cargando.");
        } finally {
            setLoading(false);
        }
    }, []);

    async function create() {
        if (!name.trim()) return;
        setSaving(true);
        setError("");
        setSuccessMsg("");
        try {
            await apiFetch("/admin/categories", {
                method: "POST",
                body: JSON.stringify({ name: name.trim(), slug: slug || undefined, sort_order: Number(sortOrder || 0) }),
            });
            setName(""); setSlug(""); setSortOrder(0); setSlugManual(false);
            setSuccessMsg("✅ Categoría creada correctamente.");
            setTimeout(() => setSuccessMsg(""), 4000);
            await load();
        } catch (e) {
            setError(e?.message || "Error creando.");
        } finally {
            setSaving(false);
        }
    }

    async function toggleActive(id, current) {
        try {
            await apiFetch(`/admin/categories/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ is_active: current ? 0 : 1 }),
            });
            await load();
        } catch (e) {
            setError(e?.message || "Error actualizando.");
        }
    }

    async function updateOrder(id, newOrder) {
        const val = parseInt(newOrder, 10);
        if (isNaN(val)) { setEditingOrder(null); return; }
        try {
            await apiFetch(`/admin/categories/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ sort_order: val }),
            });
            setEditingOrder(null);
            await load();
        } catch (e) {
            setError(e?.message || "Error actualizando orden.");
            setEditingOrder(null);
        }
    }

    useEffect(() => { load(); }, [load]);

    // Auto-slug from name
    useEffect(() => {
        if (!slugManual) setSlug(slugify(name));
    }, [name, slugManual]);

    const filtered = items.filter(c => {
        const qq = q.toLowerCase();
        return !qq || c.name?.toLowerCase().includes(qq) || c.slug?.toLowerCase().includes(qq);
    });

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                <AdminSidebar
                    user={user} logoSrc={LOGO_URL} logoOk={true}
                    setLogoOk={() => { }} uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main" style={{ padding: "20px 24px 40px", maxWidth: 1000, margin: "0 auto" }}>
                    {/* ── Header ── */}
                    <motion.div
                        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid var(--stroke)", flexWrap: "wrap", gap: 16 }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,rgba(13,166,242,0.15),rgba(99,51,255,0.15))", border: "1px solid rgba(13,166,242,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 4px 16px rgba(13,166,242,0.2)" }}>📁</div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" }}>Categorías</h1>
                                <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--muted)" }}>Crea y gestiona categorías para segmentar tu catálogo.</p>
                            </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ background: "rgba(13,166,242,0.1)", border: "1px solid rgba(13,166,242,0.25)", borderRadius: 10, padding: "6px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Total</span>
                                <span style={{ fontSize: 20, fontWeight: 900, color: "#0da6f2" }}>{items.length}</span>
                            </div>
                            <button className="btn-ghost" onClick={load} disabled={loading} style={{ height: 36, padding: "0 14px", fontSize: 13, borderRadius: 10 }}>
                                <span style={{ display: "inline-block", animation: loading ? "spin 0.8s linear infinite" : "none" }}>⟳</span> Refrescar
                            </button>
                        </div>
                    </motion.div>

                    {/* ── Messages ── */}
                    <AnimatePresence>
                        {error && (
                            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
                                {error}
                            </motion.div>
                        )}
                        {successMsg && (
                            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
                                {successMsg}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ── Create Card ── */}
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "22px 24px", marginBottom: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                            <span style={{ fontSize: 16 }}>✨</span>
                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Nueva Categoría</h3>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
                            <div>
                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Nombre *</label>
                                <input
                                    style={inputStyle} placeholder="Ej: Acción y Aventura"
                                    value={name} onChange={e => setName(e.target.value)}
                                    onFocus={e => e.target.style.borderColor = "#0da6f2"}
                                    onBlur={e => e.target.style.borderColor = "var(--stroke)"}
                                    onKeyDown={e => e.key === "Enter" && create()}
                                />
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                                    Slug-URL <span style={{ fontSize: 10, opacity: 0.6 }}>(auto)</span>
                                </label>
                                <input
                                    style={{ ...inputStyle, fontFamily: "monospace", fontSize: 13 }}
                                    placeholder="accion-y-aventura"
                                    value={slug}
                                    onChange={e => { setSlug(e.target.value); setSlugManual(true); }}
                                    onFocus={e => e.target.style.borderColor = "#0da6f2"}
                                    onBlur={e => e.target.style.borderColor = "var(--stroke)"}
                                />
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                                <div>
                                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Orden</label>
                                    <input
                                        style={{ ...inputStyle, width: 80 }} type="number"
                                        value={sortOrder} onChange={e => setSortOrder(e.target.value)}
                                        onFocus={e => e.target.style.borderColor = "#0da6f2"}
                                        onBlur={e => e.target.style.borderColor = "var(--stroke)"}
                                    />
                                </div>
                                <button
                                    className="btn"
                                    onClick={create} disabled={saving || !name.trim()}
                                    style={{ height: 42, padding: "0 22px", fontSize: 14, fontWeight: 700, borderRadius: 10, whiteSpace: "nowrap" }}
                                >
                                    {saving ? "Creando..." : "+ Crear"}
                                </button>
                            </div>
                        </div>
                    </motion.div>

                    {/* ── Table Card ── */}
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                        style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>

                        {/* Table header actions */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--stroke)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 16 }}>📋</span>
                                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Categorías Registradas</h3>
                                <span style={{ background: "rgba(99,51,255,0.12)", border: "1px solid rgba(99,51,255,0.25)", color: "#8b5cf6", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 800 }}>
                                    {filtered.length}
                                </span>
                            </div>
                            <div style={{ position: "relative", width: 220 }}>
                                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.5, pointerEvents: "none" }}>🔎</span>
                                <input
                                    style={{ ...inputStyle, height: 36, padding: "0 12px 0 32px", fontSize: 13 }}
                                    placeholder="Buscar..."
                                    value={q} onChange={e => setQ(e.target.value)}
                                    onFocus={e => e.target.style.borderColor = "#0da6f2"}
                                    onBlur={e => e.target.style.borderColor = "var(--stroke)"}
                                />
                            </div>
                        </div>

                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: "rgba(0,0,0,0.2)", textAlign: "left" }}>
                                        {["ID", "Nombre", "Slug", "Orden", "Estado", "Acciones"].map(h => (
                                            <th key={h} style={{ padding: "12px 16px", fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.7px", whiteSpace: "nowrap" }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={6} style={{ padding: "50px 20px", textAlign: "center" }}>
                                            <div style={{ width: 32, height: 32, border: "3px solid var(--stroke)", borderTopColor: "#0da6f2", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
                                        </td></tr>
                                    ) : filtered.length === 0 ? (
                                        <tr><td colSpan={6} style={{ padding: "50px 20px", textAlign: "center", color: "var(--muted)" }}>
                                            <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                                            {q ? "Sin resultados para esa búsqueda" : "No hay categorías aún. ¡Crea la primera!"}
                                        </td></tr>
                                    ) : filtered.map((c, idx) => (
                                        <motion.tr
                                            key={c.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: idx * 0.03 }}
                                            style={{ borderBottom: "1px solid var(--stroke2)", background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)", cursor: "default" }}
                                            onMouseEnter={e => e.currentTarget.style.background = "rgba(13,166,242,0.05)"}
                                            onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)"}
                                        >
                                            <td style={{ padding: "13px 16px", fontFamily: "monospace", color: "var(--muted)", fontSize: 12, fontWeight: 600 }}>#{c.id}</td>
                                            <td style={{ padding: "13px 16px", fontWeight: 700, color: "var(--text)" }}>{c.name}</td>
                                            <td style={{ padding: "13px 16px" }}>
                                                <code style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--stroke)", borderRadius: 6, padding: "3px 8px", fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>
                                                    {c.slug}
                                                </code>
                                            </td>
                                            <td style={{ padding: "13px 16px", color: "var(--muted)", fontWeight: 600 }}>
                                                {editingOrder === c.id ? (
                                                    <input
                                                        autoFocus
                                                        type="number"
                                                        value={editingOrderValue}
                                                        onChange={e => setEditingOrderValue(e.target.value)}
                                                        onBlur={() => updateOrder(c.id, editingOrderValue)}
                                                        onKeyDown={e => {
                                                            if (e.key === "Enter") updateOrder(c.id, editingOrderValue);
                                                            if (e.key === "Escape") setEditingOrder(null);
                                                        }}
                                                        style={{
                                                            width: 60, height: 32, borderRadius: 7, border: "1px solid #0da6f2",
                                                            background: "var(--bg0)", color: "var(--text)", textAlign: "center",
                                                            fontSize: 14, fontWeight: 700, fontFamily: "var(--font)", outline: "none",
                                                            boxShadow: "0 0 0 3px rgba(13,166,242,0.15)"
                                                        }}
                                                    />
                                                ) : (
                                                    <span
                                                        title="Clic para editar el orden"
                                                        onClick={() => { setEditingOrder(c.id); setEditingOrderValue(String(c.sort_order)); }}
                                                        style={{
                                                            display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
                                                            padding: "4px 10px", borderRadius: 8,
                                                            background: "rgba(255,255,255,0.04)", border: "1px solid var(--stroke2)",
                                                            transition: "border-color 0.15s",
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.borderColor = "#0da6f2"}
                                                        onMouseLeave={e => e.currentTarget.style.borderColor = "var(--stroke2)"}
                                                    >
                                                        {c.sort_order}
                                                        <span style={{ fontSize: 10, opacity: 0.4 }}>✏️</span>
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: "13px 16px" }}>
                                                {c.is_active ? (
                                                    <span style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, boxShadow: "0 0 8px rgba(16,185,129,0.2)" }}>
                                                        ● Activo
                                                    </span>
                                                ) : (
                                                    <span style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800 }}>
                                                        ○ Inactivo
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: "13px 16px" }}>
                                                <button
                                                    onClick={() => toggleActive(c.id, c.is_active)}
                                                    style={{
                                                        background: c.is_active ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
                                                        color: c.is_active ? "#ef4444" : "#10b981",
                                                        border: `1px solid ${c.is_active ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}`,
                                                        borderRadius: 8, padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                                                        transition: "all 0.2s", fontFamily: "var(--font)"
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
                                                    onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                                                >
                                                    {c.is_active ? "Desactivar" : "Activar"}
                                                </button>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                </main>
            </div>
        </div>
    );
}
