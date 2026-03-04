import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiGet, apiPost, apiPatch, apiLogout } from "../api/api";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";

const LOGO_URL = "/api/branding/logo";

function slugify(text) {
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Mismo algoritmo que usa el backend para nombrar el archivo del logo
// ts = timestamp opcional para cache-busting
const logoSrc = (slug, ts) => {
    const safe = slugify(slug);
    return ts ? `/platform-logos/${safe}.png?t=${ts}` : `/platform-logos/${safe}.png`;
};

const inputStyle = {
    appearance: "none", height: 42, padding: "0 14px",
    background: "var(--bg0)", color: "var(--text)",
    border: "1px solid var(--stroke)", borderRadius: 10,
    fontSize: 14, fontWeight: 500, outline: "none", width: "100%",
    fontFamily: "var(--font)", transition: "border-color 0.2s",
};

const selStyle = { ...inputStyle, cursor: "pointer", paddingRight: 30 };

export default function AdminPlatforms() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();

    const [platforms, setPlatforms] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [slugManual, setSlugManual] = useState(false);
    const [categoryId, setCategoryId] = useState("");
    const [whatsappInstructions, setWhatsappInstructions] = useState("");

    // Toggles Options
    const [waShowId, setWaShowId] = useState(true);
    const [waShowEmail, setWaShowEmail] = useState(true);
    const [waShowPass, setWaShowPass] = useState(true);
    const [waShowProfile, setWaShowProfile] = useState(true);
    const [waShowPin, setWaShowPin] = useState(true);
    const [waShowExpire, setWaShowExpire] = useState(true);

    const [saving, setSaving] = useState(false);
    const [q, setQ] = useState("");
    const [uploadingId, setUploadingId] = useState(null);
    // Cache-busters por plataforma: { [platformId]: timestamp }
    const [logoTimestamps, setLogoTimestamps] = useState({});

    // Estado para edición
    const [editingPlatform, setEditingPlatform] = useState(null);

    async function logout() {
        try { await apiLogout(); } catch { }
        setUser(null);
        try { localStorage.removeItem("user"); localStorage.removeItem("accessToken"); localStorage.removeItem("refreshToken"); } catch { }
        navigate("/", { replace: true });
    }

    const load = useCallback(async () => {
        setLoading(true); setError("");
        try {
            const [r1, r2] = await Promise.all([
                apiGet("/admin/platforms"),
                apiGet("/admin/categories"),
            ]);
            if (!r1.ok) throw new Error(r1.data?.message || "No se pudo cargar plataformas.");
            if (!r2.ok) throw new Error(r2.data?.message || "No se pudo cargar categorías.");
            setPlatforms(Array.isArray(r1.data) ? r1.data : []);
            setCategories(Array.isArray(r2.data) ? r2.data : []);
        } catch (e) {
            setError(e?.message || "Error cargando.");
        } finally {
            setLoading(false);
        }
    }, []);

    async function create() {
        if (!name.trim() || !slug.trim()) return;
        setSaving(true); setError(""); setSuccessMsg("");
        try {
            const r = await apiPost("/admin/platforms", {
                name: name.trim(), slug: slug.trim(),
                category_id: categoryId ? Number(categoryId) : null,
                whatsapp_instructions: whatsappInstructions,
                wa_show_id: waShowId,
                wa_show_email: waShowEmail,
                wa_show_pass: waShowPass,
                wa_show_profile: waShowProfile,
                wa_show_pin: waShowPin,
                wa_show_expire: waShowExpire
            });
            if (!r.ok) throw new Error(r.data?.message || "No se pudo crear.");
            setName(""); setSlug(""); setCategoryId(""); setWhatsappInstructions(""); setSlugManual(false);
            setWaShowId(true); setWaShowEmail(true); setWaShowPass(true); setWaShowProfile(true); setWaShowPin(true); setWaShowExpire(true);
            setSuccessMsg("✅ Plataforma creada correctamente.");
            setTimeout(() => setSuccessMsg(""), 4000);
            await load();
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
            if (!r.ok) throw new Error(r.data?.message || "Error.");
            await load();
        } catch (e) { setError(e?.message || "Error actualizando categoría."); }
    }

    async function updateInternational(platformId, enabled) {
        try {
            const r = await apiPatch(`/admin/platforms/${platformId}`, {
                allowed_currencies: enabled ? ["COP", "MXN", "USD"] : ["COP"],
            });
            if (!r.ok) throw new Error(r.data?.message || "Error.");
            await load();
        } catch (e) { setError(e?.message || "Error actualizando monedas."); }
    }

    async function saveEditedPlatform(e) {
        e.preventDefault();
        setSaving(true); setError(""); setSuccessMsg("");
        try {
            const r = await apiPatch(`/admin/platforms/${editingPlatform.id}`, {
                name: editingPlatform.name,
                slug: editingPlatform.slug,
                category_id: editingPlatform.category_id || null,
                whatsapp_instructions: editingPlatform.whatsapp_instructions,
                wa_show_id: editingPlatform.wa_show_id !== 0,
                wa_show_email: editingPlatform.wa_show_email !== 0,
                wa_show_pass: editingPlatform.wa_show_pass !== 0,
                wa_show_profile: editingPlatform.wa_show_profile !== 0,
                wa_show_pin: editingPlatform.wa_show_pin !== 0,
                wa_show_expire: editingPlatform.wa_show_expire !== 0
            });
            if (!r.ok) throw new Error(r.data?.message || "Error guardando plataforma.");
            setSuccessMsg("✅ Plataforma actualizada.");
            setTimeout(() => setSuccessMsg(""), 4000);
            setEditingPlatform(null);
            await load();
        } catch (err) {
            setError(err?.message || "Error al actualizar.");
        } finally {
            setSaving(false);
        }
    }

    async function toggleActive(platformId, current) {
        try {
            const r = await apiPatch(`/admin/platforms/${platformId}`, { is_active: current ? 0 : 1 });
            if (!r.ok) throw new Error(r.data?.message || "Error.");
            await load();
        } catch (e) { setError(e?.message || "Error actualizando estado."); }
    }

    async function uploadLogo(platformId, slug, file) {
        if (!file) return;
        setUploadingId(platformId);
        try {
            const formData = new FormData();
            formData.append("logo", file);
            formData.append("slug", slug);

            // Usar URL relativa → pasa por el proxy de Vite/Nginx (mismo origen)
            const res = await fetch("/api/upload/platform-logo", {
                method: "POST",
                body: formData,
                credentials: "include",  // envía cookies de sesión (HttpOnly)
            });
            const json = await res.json().catch(() => ({}));
            if (res.ok) {
                setSuccessMsg(`✅ Logo de "${slug}" subido correctamente.`);
                setTimeout(() => setSuccessMsg(""), 4000);
                // Busting individual de caché para esta plataforma
                setLogoTimestamps(prev => ({ ...prev, [platformId]: Date.now() }));
                // Recargar lista para sincronizar
                await load();
            } else {
                setError("Error subiendo logo: " + (json.error || res.statusText));
            }
        } catch (err) {
            setError("Error de conexión: " + err.message);
        } finally {
            setUploadingId(null);
        }
    }

    useEffect(() => { load(); }, [load]);

    // Auto-slug
    useEffect(() => {
        if (!slugManual) setSlug(slugify(name));
    }, [name, slugManual]);

    const activeCategories = useMemo(() =>
        categories.filter(c => c.is_active).sort((a, b) => Number(a.sort_order) - Number(b.sort_order)),
        [categories]
    );

    const filtered = useMemo(() => {
        const qq = q.toLowerCase();
        return !qq ? platforms : platforms.filter(p =>
            p.name?.toLowerCase().includes(qq) || p.slug?.toLowerCase().includes(qq)
        );
    }, [platforms, q]);

    const catMap = useMemo(() => {
        const m = {};
        categories.forEach(c => { m[c.id] = c.name; });
        return m;
    }, [categories]);

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

                <main className="main" style={{ padding: "20px 24px 40px" }}>
                    {/* ── Header ── */}
                    <motion.div
                        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid var(--stroke)", flexWrap: "wrap", gap: 16 }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,rgba(13,166,242,0.15),rgba(99,51,255,0.15))", border: "1px solid rgba(13,166,242,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 4px 16px rgba(13,166,242,0.2)", flexShrink: 0 }}>🎬</div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" }}>Plataformas</h1>
                                <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--muted)" }}>Crea y administra plataformas de streaming. Asigna categoría y venta internacional.</p>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <div style={{ background: "rgba(13,166,242,0.1)", border: "1px solid rgba(13,166,242,0.25)", borderRadius: 10, padding: "6px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Total</span>
                                <span style={{ fontSize: 20, fontWeight: 900, color: "#0da6f2" }}>{platforms.length}</span>
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
                                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                                onClick={() => setError("")}>
                                {error} <span style={{ opacity: 0.6, float: "right" }}>✕</span>
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
                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Nueva Plataforma</h3>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end", marginBottom: 16 }}>
                            <div>
                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Nombre *</label>
                                <input style={inputStyle} placeholder="Ej: Netflix"
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
                                <input style={{ ...inputStyle, fontFamily: "monospace", fontSize: 13 }}
                                    placeholder="netflix"
                                    value={slug}
                                    onChange={e => { setSlug(e.target.value); setSlugManual(true); }}
                                    onFocus={e => e.target.style.borderColor = "#0da6f2"}
                                    onBlur={e => e.target.style.borderColor = "var(--stroke)"}
                                />
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Categoría</label>
                                <div style={{ position: "relative" }}>
                                    <select style={selStyle} value={categoryId} onChange={e => setCategoryId(e.target.value)}
                                        onFocus={e => e.target.style.borderColor = "#0da6f2"}
                                        onBlur={e => e.target.style.borderColor = "var(--stroke)"}>
                                        <option value="">Sin categoría</option>
                                        {activeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                                Formato de Mensaje de WhatsApp (Checklist)
                            </label>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 14, background: "rgba(255,255,255,0.02)", padding: 12, borderRadius: 10, border: "1px solid var(--stroke)" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                                    <input type="checkbox" checked={waShowId} onChange={e => setWaShowId(e.target.checked)} /> Mostrar ID y Plataforma
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                                    <input type="checkbox" checked={waShowEmail} onChange={e => setWaShowEmail(e.target.checked)} /> Mostrar Correo
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                                    <input type="checkbox" checked={waShowPass} onChange={e => setWaShowPass(e.target.checked)} /> Mostrar Contraseña
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                                    <input type="checkbox" checked={waShowProfile} onChange={e => setWaShowProfile(e.target.checked)} /> Mostrar Perfil
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                                    <input type="checkbox" checked={waShowPin} onChange={e => setWaShowPin(e.target.checked)} /> Mostrar PIN
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                                    <input type="checkbox" checked={waShowExpire} onChange={e => setWaShowExpire(e.target.checked)} /> Mostrar Expiración
                                </label>
                            </div>

                            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                                        Texto o Instrucciones Adicionales
                                        <span style={{ fontSize: 9, opacity: 0.8, textTransform: "none" }}>(Opcional). Variables: {'{URL}'}</span>
                                    </label>
                                    <textarea style={{ ...inputStyle, height: 60, padding: "10px 14px", resize: "none" }}
                                        placeholder="Se mostrará al final del mensaje.&#10;Ej: Para acceder, entra a {URL}"
                                        value={whatsappInstructions} onChange={e => setWhatsappInstructions(e.target.value)}
                                        onFocus={e => e.target.style.borderColor = "#0da6f2"}
                                        onBlur={e => e.target.style.borderColor = "var(--stroke)"}
                                    ></textarea>
                                </div>
                                <button className="btn" onClick={create} disabled={saving || !name.trim() || !slug.trim()}
                                    style={{ height: 42, padding: "0 22px", fontSize: 14, fontWeight: 700, borderRadius: 10, whiteSpace: "nowrap" }}>
                                    {saving ? "Creando..." : "+ Crear"}
                                </button>
                            </div>
                        </div>
                    </motion.div>

                    {/* ── Table Card ── */}
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                        style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>

                        {/* Table header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--stroke)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 16 }}>📋</span>
                                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Plataformas Registradas</h3>
                                <span style={{ background: "rgba(99,51,255,0.12)", border: "1px solid rgba(99,51,255,0.25)", color: "#8b5cf6", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 800 }}>
                                    {filtered.length}
                                </span>
                            </div>
                            <div style={{ position: "relative", width: 220 }}>
                                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.5, pointerEvents: "none" }}>🔎</span>
                                <input style={{ ...inputStyle, height: 36, padding: "0 12px 0 32px", fontSize: 13 }}
                                    placeholder="Buscar plataforma..."
                                    value={q} onChange={e => setQ(e.target.value)}
                                    onFocus={e => e.target.style.borderColor = "#0da6f2"}
                                    onBlur={e => e.target.style.borderColor = "var(--stroke)"}
                                />
                            </div>
                        </div>

                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: "rgba(0,0,0,0.25)", textAlign: "left" }}>
                                        {["ID", "Nombre", "Slug", "Categoría", "Venta Int.", "Logo", "Activo"].map(h => (
                                            <th key={h} style={{ padding: "12px 16px", fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.7px", whiteSpace: "nowrap" }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={7} style={{ padding: "60px 20px", textAlign: "center" }}>
                                            <div style={{ width: 32, height: 32, border: "3px solid var(--stroke)", borderTopColor: "#0da6f2", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
                                        </td></tr>
                                    ) : filtered.length === 0 ? (
                                        <tr><td colSpan={7} style={{ padding: "60px 20px", textAlign: "center", color: "var(--muted)" }}>
                                            <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                                            {q ? "Sin resultados." : "No hay plataformas aún."}
                                        </td></tr>
                                    ) : filtered.map((p, idx) => {
                                        const allowed = String(p.allowed_currencies || "COP,MXN,USD").toUpperCase();
                                        const isIntl = allowed.includes("MXN") || allowed.includes("USD");

                                        return (
                                            <motion.tr key={p.id}
                                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                                transition={{ delay: Math.min(idx * 0.025, 0.4) }}
                                                style={{ borderBottom: "1px solid var(--stroke2)", background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)" }}
                                                onMouseEnter={e => e.currentTarget.style.background = "rgba(13,166,242,0.05)"}
                                                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)"}
                                            >
                                                {/* ID */}
                                                <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>#{p.id}</td>

                                                {/* Nombre */}
                                                <td style={{ padding: "12px 16px" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                        <img
                                                            src={logoSrc(p.slug, logoTimestamps[p.id])}
                                                            alt={p.name}
                                                            style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover", background: "rgba(255,255,255,0.05)", border: "1px solid var(--stroke2)", flexShrink: 0 }}
                                                            onError={e => { e.target.style.display = "none"; }}
                                                        />
                                                        <span style={{ fontWeight: 700, color: "var(--text)" }}>{p.name}</span>
                                                    </div>
                                                </td>

                                                {/* Slug */}
                                                <td style={{ padding: "12px 16px" }}>
                                                    <code style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--stroke)", borderRadius: 6, padding: "3px 8px", fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>{p.slug}</code>
                                                </td>

                                                {/* Categoría inline select */}
                                                <td style={{ padding: "12px 16px", minWidth: 160 }}>
                                                    <div style={{ position: "relative" }}>
                                                        <select
                                                            style={{ ...selStyle, height: 34, fontSize: 12, padding: "0 26px 0 10px" }}
                                                            value={p.category_id ?? ""}
                                                            onChange={e => updateCategory(p.id, e.target.value)}
                                                        >
                                                            <option value="">Sin categoría</option>
                                                            {activeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                        </select>
                                                        <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 8, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                                                    </div>
                                                </td>

                                                {/* Venta Internacional */}
                                                <td style={{ padding: "12px 16px" }}>
                                                    <button
                                                        onClick={() => updateInternational(p.id, !isIntl)}
                                                        title={isIntl ? "Clic para solo COP" : "Clic para activar internacional"}
                                                        style={{
                                                            background: isIntl ? "rgba(13,166,242,0.12)" : "rgba(255,255,255,0.05)",
                                                            color: isIntl ? "#0da6f2" : "var(--muted)",
                                                            border: isIntl ? "1px solid rgba(13,166,242,0.35)" : "1px solid var(--stroke)",
                                                            padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800,
                                                            cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
                                                            whiteSpace: "nowrap", fontFamily: "var(--font)",
                                                            boxShadow: isIntl ? "0 0 8px rgba(13,166,242,0.2)" : "none",
                                                            transition: "all 0.2s"
                                                        }}
                                                    >
                                                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: isIntl ? "#0da6f2" : "var(--muted)", display: "inline-block" }} />
                                                        {isIntl ? "🌍 Internacional" : "🇨🇴 Solo COP"}
                                                    </button>
                                                </td>

                                                {/* Logo upload */}
                                                <td style={{ padding: "12px 16px" }}>
                                                    <label style={{
                                                        background: uploadingId === p.id ? "rgba(16,185,129,0.05)" : "rgba(16,185,129,0.08)",
                                                        color: "#10b981", border: "1px solid rgba(16,185,129,0.3)",
                                                        padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                                                        cursor: uploadingId === p.id ? "wait" : "pointer",
                                                        display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap"
                                                    }}>
                                                        {uploadingId === p.id ? "Subiendo..." : "⬆ Logo"}
                                                        <input type="file" accept="image/*" style={{ display: "none" }}
                                                            onChange={e => { uploadLogo(p.id, p.slug, e.target.files[0]); e.target.value = null; }}
                                                        />
                                                    </label>
                                                </td>

                                                {/* Activo y Editar */}
                                                <td style={{ padding: "12px 16px" }}>
                                                    <div style={{ display: "flex", gap: 8 }}>
                                                        <button onClick={() => toggleActive(p.id, p.is_active)}
                                                            style={{
                                                                background: p.is_active ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                                                                color: p.is_active ? "#10b981" : "#ef4444",
                                                                border: `1px solid ${p.is_active ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                                                                padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800,
                                                                cursor: "pointer", fontFamily: "var(--font)",
                                                                boxShadow: p.is_active ? "0 0 8px rgba(16,185,129,0.15)" : "none"
                                                            }}>
                                                            {p.is_active ? "● Activo" : "○ Inactivo"}
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingPlatform(p)}
                                                            style={{
                                                                background: "rgba(255,255,255,0.05)", border: "1px solid var(--stroke)",
                                                                color: "var(--text)", padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800,
                                                                cursor: "pointer"
                                                            }}
                                                        >
                                                            ✎ Editar
                                                        </button>
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                </main>
            </div>

            {/* Modal Editar Plataforma */}
            <AnimatePresence>
                {editingPlatform && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
                        onClick={() => setEditingPlatform(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 15 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 15 }}
                            onClick={e => e.stopPropagation()}
                            style={{ background: "var(--bg0)", border: "1px solid var(--stroke)", borderRadius: 20, width: "100%", maxWidth: 500, padding: 24, boxShadow: "0 24px 48px rgba(0,0,0,0.5)" }}
                        >
                            <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 0, marginBottom: 20 }}>Editar Plataforma</h2>
                            <form onSubmit={saveEditedPlatform} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                <div>
                                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Nombre</label>
                                    <input style={inputStyle} value={editingPlatform.name || ""} onChange={e => setEditingPlatform({ ...editingPlatform, name: e.target.value })} required />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Slug</label>
                                    <input style={{ ...inputStyle, fontFamily: "monospace" }} value={editingPlatform.slug || ""} onChange={e => setEditingPlatform({ ...editingPlatform, slug: e.target.value })} required />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Categoría</label>
                                    <select style={selStyle} value={editingPlatform.category_id || ""} onChange={e => setEditingPlatform({ ...editingPlatform, category_id: e.target.value })}>
                                        <option value="">Sin categoría</option>
                                        {activeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                                        Checklist de WhatsApp
                                    </label>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10, background: "rgba(255,255,255,0.02)", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--stroke)" }}>
                                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                                            <input type="checkbox" checked={editingPlatform.wa_show_id !== 0} onChange={e => setEditingPlatform({ ...editingPlatform, wa_show_id: e.target.checked ? 1 : 0 })} /> ID y Plataforma
                                        </label>
                                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                                            <input type="checkbox" checked={editingPlatform.wa_show_email !== 0} onChange={e => setEditingPlatform({ ...editingPlatform, wa_show_email: e.target.checked ? 1 : 0 })} /> Correo
                                        </label>
                                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                                            <input type="checkbox" checked={editingPlatform.wa_show_pass !== 0} onChange={e => setEditingPlatform({ ...editingPlatform, wa_show_pass: e.target.checked ? 1 : 0 })} /> Contraseña
                                        </label>
                                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                                            <input type="checkbox" checked={editingPlatform.wa_show_profile !== 0} onChange={e => setEditingPlatform({ ...editingPlatform, wa_show_profile: e.target.checked ? 1 : 0 })} /> Perfil
                                        </label>
                                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                                            <input type="checkbox" checked={editingPlatform.wa_show_pin !== 0} onChange={e => setEditingPlatform({ ...editingPlatform, wa_show_pin: e.target.checked ? 1 : 0 })} /> PIN
                                        </label>
                                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                                            <input type="checkbox" checked={editingPlatform.wa_show_expire !== 0} onChange={e => setEditingPlatform({ ...editingPlatform, wa_show_expire: e.target.checked ? 1 : 0 })} /> Expiración
                                        </label>
                                    </div>

                                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                                        Texto o Instrucciones Adicionales
                                    </label>
                                    <span style={{ fontSize: 10, color: "var(--muted)", display: "block", marginBottom: 6 }}>
                                        Aparecerá al final del mensaje. Puedes usar la variable: <code>{'{URL}'}</code>
                                    </span>
                                    <textarea style={{ ...inputStyle, height: 80, padding: "10px 14px", resize: "none" }}
                                        placeholder="Para ver más detalles visita {URL}"
                                        value={editingPlatform.whatsapp_instructions || ""}
                                        onChange={e => setEditingPlatform({ ...editingPlatform, whatsapp_instructions: e.target.value })}
                                    ></textarea>
                                </div>
                                <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                                    <button type="button" onClick={() => setEditingPlatform(null)} style={{ flex: 1, height: 44, borderRadius: 12, background: "transparent", border: "1px solid var(--stroke)", color: "var(--text)", fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
                                    <button type="submit" disabled={saving} style={{ flex: 1, height: 44, borderRadius: 12, background: "var(--accent)", color: "#fff", fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 4px 12px rgba(13,166,242,0.3)" }}>{saving ? "Guardando..." : "Guardar Cambios"}</button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
