import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiGet, apiPost, apiPatch, apiDelete, apiLogout } from "../api/api";
import { bumpPlatformLogoVersion } from "../utils/platform.js";
import PlatformEditModal from "../components/adminPlatforms/PlatformEditModal.jsx";
import { DEFAULT_PROMO_COLOR, deviceRuleEnabled, inputStyle, logoSrc, normalizePromoColor, selStyle, slugify } from "../components/adminPlatforms/platformUtils.js";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";
import "../styles/admin-platforms.css";

const LOGO_URL = "/api/branding/logo";

export default function AdminPlatforms() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();

    const [platforms, setPlatforms] = useState([]);
    const [categories, setCategories] = useState([]);
    const [fallbacks, setFallbacks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [slugManual, setSlugManual] = useState(false);
    const [categoryId, setCategoryId] = useState("");
    const [type, setType] = useState("normal");
    const [isPromo, setIsPromo] = useState(false);
    const [promoColor, setPromoColor] = useState(DEFAULT_PROMO_COLOR);
    const [showPromoLastUnits, setShowPromoLastUnits] = useState(false);
    const [showDeviceRule, setShowDeviceRule] = useState(true);
    const [productDetails, setProductDetails] = useState("");

    const [saving, setSaving] = useState(false);
    const [q, setQ] = useState("");
    const [uploadingId, setUploadingId] = useState(null);
    const [fallbackSourceId, setFallbackSourceId] = useState("");
    const [fallbackTargetId, setFallbackTargetId] = useState("");
    const [fallbackPriority, setFallbackPriority] = useState(1);
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
            const [r1, r2, r3] = await Promise.all([
                apiGet("/admin/platforms"),
                apiGet("/admin/categories"),
                apiGet("/admin/platform-fallbacks"),
            ]);
            if (!r1.ok) throw new Error(r1.data?.message || "No se pudo cargar plataformas.");
            if (!r2.ok) throw new Error(r2.data?.message || "No se pudo cargar categorías.");
            if (!r3.ok) throw new Error(r3.data?.message || "No se pudo cargar equivalencias.");
            setPlatforms(Array.isArray(r1.data) ? r1.data : []);
            setCategories(Array.isArray(r2.data) ? r2.data : []);
            setFallbacks(Array.isArray(r3.data) ? r3.data : []);
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
                type,
                product_details: productDetails,
                show_device_rule: showDeviceRule ? 1 : 0,
                is_promo: isPromo,
                promo_color: isPromo ? normalizePromoColor(promoColor) : null,
                show_promo_last_units: isPromo && showPromoLastUnits ? 1 : 0
            });
            if (!r.ok) throw new Error(r.data?.message || "No se pudo crear.");
            setName(""); setSlug(""); setCategoryId(""); setType("normal"); setSlugManual(false);
            setProductDetails("");
            setShowDeviceRule(true); setIsPromo(false); setPromoColor(DEFAULT_PROMO_COLOR); setShowPromoLastUnits(false);
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

    async function createFallback() {
        if (!fallbackSourceId || !fallbackTargetId) {
            setError("Selecciona plataforma origen y plataforma compatible.");
            return;
        }
        if (Number(fallbackSourceId) === Number(fallbackTargetId)) {
            setError("La plataforma compatible debe ser diferente.");
            return;
        }
        setSaving(true); setError(""); setSuccessMsg("");
        try {
            const r = await apiPost("/admin/platform-fallbacks", {
                source_platform_id: Number(fallbackSourceId),
                fallback_platform_id: Number(fallbackTargetId),
                priority: Number(fallbackPriority || 1),
            });
            if (!r.ok) throw new Error(r.data?.message || "No se pudo guardar equivalencia.");
            setFallbackTargetId("");
            setFallbackPriority(1);
            setSuccessMsg("Equivalencia guardada.");
            setTimeout(() => setSuccessMsg(""), 3000);
            await load();
        } catch (e) {
            setError(e?.message || "Error guardando equivalencia.");
        } finally {
            setSaving(false);
        }
    }

    async function toggleFallback(id, current) {
        try {
            const r = await apiPatch(`/admin/platform-fallbacks/${id}`, { is_active: current ? 0 : 1 });
            if (!r.ok) throw new Error(r.data?.message || "No se pudo actualizar.");
            await load();
        } catch (e) { setError(e?.message || "Error actualizando equivalencia."); }
    }

    async function deleteFallback(id) {
        try {
            const r = await apiDelete(`/admin/platform-fallbacks/${id}`);
            if (!r.ok) throw new Error(r.data?.message || "No se pudo eliminar.");
            await load();
        } catch (e) { setError(e?.message || "Error eliminando equivalencia."); }
    }

    async function saveEditedPlatform(e) {
        e.preventDefault();
        setSaving(true); setError(""); setSuccessMsg("");
        try {
            const r = await apiPatch(`/admin/platforms/${editingPlatform.id}`, {
                name: editingPlatform.name,
                slug: editingPlatform.slug,
                category_id: editingPlatform.category_id || null,
                type: editingPlatform.type || 'normal',
                product_details: editingPlatform.product_details || "",
                show_device_rule: deviceRuleEnabled(editingPlatform.show_device_rule) ? 1 : 0,
                is_promo: editingPlatform.is_promo === 1 || editingPlatform.is_promo === true,
                promo_color: (editingPlatform.is_promo === 1 || editingPlatform.is_promo === true)
                    ? normalizePromoColor(editingPlatform.promo_color || DEFAULT_PROMO_COLOR)
                    : null,
                show_promo_last_units: (editingPlatform.is_promo === 1 || editingPlatform.is_promo === true)
                    && (editingPlatform.show_promo_last_units === 1 || editingPlatform.show_promo_last_units === true)
                    ? 1
                    : 0
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

    async function updateDeviceRule(platformId, enabled) {
        try {
            const r = await apiPatch(`/admin/platforms/${platformId}`, { show_device_rule: enabled ? 1 : 0 });
            if (!r.ok) throw new Error(r.data?.message || "Error.");
            await load();
        } catch (e) { setError(e?.message || "Error actualizando regla de uso."); }
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
                bumpPlatformLogoVersion();
                // Busting individual de caché para esta plataforma
                setLogoTimestamps(prev => ({ ...prev, [platformId]: Date.now() }));
                // Recargar lista para sincronizar
                await load();
            } else {
                setError("Error subiendo logo: " + (json.message || json.error || res.statusText));
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

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden>
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />
            </div>

            <div className="page-inner">
                <AdminSidebar
                    user={user} logoSrc={LOGO_URL} logoOk={true}
                    setLogoOk={() => { }} uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main admin-platforms-main" style={{ padding: "20px 24px 40px" }}>
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
                    <motion.div className="admin-platforms-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "22px 24px", marginBottom: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                            <span style={{ fontSize: 16 }}>✨</span>
                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Nueva Plataforma</h3>
                        </div>
                        <div className="admin-platforms-create-grid">
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
                            <div>
                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Modo</label>
                                <div style={{ position: "relative" }}>
                                    <select style={selStyle} value={type} onChange={e => setType(e.target.value)}
                                        onFocus={e => e.target.style.borderColor = "#0da6f2"}
                                        onBlur={e => e.target.style.borderColor = "var(--stroke)"}>
                                        <option value="normal">🎟 Normal (Control Stock)</option>
                                        <option value="correo">📧 A correo (Sin Stock, Automático)</option>
                                    </select>
                                    <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                                </div>
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Promoción</label>
                                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, height: 42, padding: "0 14px", borderRadius: 10, border: `1px solid ${isPromo ? `${promoColor}66` : "var(--stroke)"}`, background: isPromo ? `${promoColor}14` : "var(--bg0)", boxShadow: isPromo ? `0 0 18px ${promoColor}22` : "none", cursor: "pointer" }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: isPromo ? promoColor : "var(--text)" }}>Resaltar como promo</span>
                                    <input type="checkbox" checked={isPromo} onChange={e => { setIsPromo(e.target.checked); if (!e.target.checked) setShowPromoLastUnits(false); }} />
                                </label>
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Aviso de promo</label>
                                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 42, padding: "0 14px", borderRadius: 10, border: `1px solid ${isPromo && showPromoLastUnits ? "rgba(245,158,11,0.60)" : "var(--stroke)"}`, background: isPromo && showPromoLastUnits ? "rgba(245,158,11,0.12)" : "var(--bg0)", cursor: isPromo ? "pointer" : "not-allowed", opacity: isPromo ? 1 : 0.48 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: isPromo && showPromoLastUnits ? "#fbbf24" : "var(--muted)" }}>Últimas unidades</span>
                                    <input type="checkbox" disabled={!isPromo} checked={showPromoLastUnits} onChange={e => setShowPromoLastUnits(e.target.checked)} />
                                </label>
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Regla 1 dispositivo</label>
                                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, height: 42, padding: "0 14px", borderRadius: 10, border: `1px solid ${showDeviceRule ? "rgba(16,185,129,0.34)" : "var(--stroke)"}`, background: showDeviceRule ? "rgba(16,185,129,0.10)" : "var(--bg0)", cursor: "pointer" }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: showDeviceRule ? "#10b981" : "var(--muted)" }}>{showDeviceRule ? "Se muestra" : "Oculta"}</span>
                                    <input type="checkbox" checked={showDeviceRule} onChange={e => setShowDeviceRule(e.target.checked)} />
                                </label>
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Color Neon</label>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, height: 42, padding: "0 10px", background: "var(--bg0)", border: `1px solid ${isPromo ? `${promoColor}88` : "var(--stroke)"}`, borderRadius: 10, boxShadow: isPromo ? `0 0 16px ${promoColor}22 inset` : "none", opacity: isPromo ? 1 : 0.5 }}>
                                    <input type="color" value={normalizePromoColor(promoColor)} disabled={!isPromo} onChange={e => setPromoColor(e.target.value.toUpperCase())} style={{ width: 34, height: 24, padding: 0, border: "none", background: "transparent", cursor: isPromo ? "pointer" : "not-allowed" }} />
                                    <input style={{ ...inputStyle, height: 30, padding: "0 10px", border: "none", background: "transparent", boxShadow: "none" }} disabled={!isPromo} value={promoColor} onChange={e => setPromoColor(e.target.value.toUpperCase())} placeholder="#22D3EE" />
                                </div>
                            </div>
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Ficha del producto</label>
                            <textarea
                                style={{ ...inputStyle, height: 108, padding: "12px 14px", resize: "vertical", lineHeight: 1.5 }}
                                value={productDetails}
                                onChange={e => setProductDetails(e.target.value)}
                                maxLength={5000}
                                placeholder={"Escribe una característica o condición por línea.\nEj: Acceso para 1 dispositivo\nNo permite cambio de correo\nGarantía de 30 días"}
                            />
                            <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>Esta información se mostrará antes de agregar el producto y nuevamente antes de pagar.</div>
                        </div>
                        <div className="admin-platforms-create-actions" style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                            <button className="btn" onClick={create} disabled={saving || !name.trim() || !slug.trim()}
                                style={{ height: 42, padding: "0 22px", fontSize: 14, fontWeight: 700, borderRadius: 10, whiteSpace: "nowrap" }}>
                                {saving ? "Creando..." : "+ Crear"}
                            </button>
                        </div>
                    </motion.div>

                    {/* ── Table Card ── */}
                    <motion.div className="admin-platforms-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                        style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "20px 24px", marginBottom: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Equivalencias de stock</h3>
                                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>Define que plataforma puede entregar stock cuando la original no tenga cuentas disponibles.</p>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", border: "1px solid var(--stroke)", borderRadius: 999, padding: "4px 10px" }}>{fallbacks.length} reglas</span>
                        </div>
                        <div className="admin-platforms-fallback-grid">
                            <div>
                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Si falta stock de</label>
                                <select style={selStyle} value={fallbackSourceId} onChange={e => setFallbackSourceId(e.target.value)}>
                                    <option value="">Selecciona plataforma</option>
                                    {platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Usar stock de</label>
                                <select style={selStyle} value={fallbackTargetId} onChange={e => setFallbackTargetId(e.target.value)}>
                                    <option value="">Selecciona compatible</option>
                                    {platforms.filter(p => String(p.id) !== String(fallbackSourceId)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Prioridad</label>
                                <input style={inputStyle} type="number" min="1" value={fallbackPriority} onChange={e => setFallbackPriority(e.target.value)} />
                            </div>
                            <button className="btn" onClick={createFallback} disabled={saving || !fallbackSourceId || !fallbackTargetId}
                                style={{ height: 42, padding: "0 18px", fontSize: 13, fontWeight: 800, borderRadius: 10, whiteSpace: "nowrap" }}>Guardar regla</button>
                        </div>
                        <div style={{ overflowX: "auto", border: "1px solid var(--stroke)", borderRadius: 12 }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <tbody>
                                    {!fallbacks.length ? (
                                        <tr><td style={{ padding: 18, color: "var(--muted)", textAlign: "center" }}>Sin equivalencias configuradas.</td></tr>
                                    ) : fallbacks.map(rule => (
                                        <tr key={rule.id} style={{ borderTop: "1px solid var(--stroke)" }}>
                                            <td style={{ padding: "10px 12px", fontWeight: 800, color: "var(--text)" }}>{rule.source_platform_name}</td>
                                            <td style={{ padding: "10px 12px", color: "var(--muted)" }}>usa stock de</td>
                                            <td style={{ padding: "10px 12px", color: "var(--text)" }}>{rule.fallback_platform_name}</td>
                                            <td style={{ padding: "10px 12px", color: Number(rule.fallback_stock || 0) > 0 ? "#10b981" : "var(--muted)", fontWeight: 800 }}>Stock {Number(rule.fallback_stock || 0)}</td>
                                            <td style={{ padding: "10px 12px", color: "var(--muted)" }}>Prioridad {rule.priority}</td>
                                            <td style={{ padding: "10px 12px" }}>
                                                <button onClick={() => toggleFallback(rule.id, rule.is_active)}
                                                    style={{ marginRight: 8, border: "1px solid var(--stroke)", borderRadius: 999, padding: "4px 10px", background: rule.is_active ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.04)", color: rule.is_active ? "#10b981" : "var(--muted)", fontWeight: 800, cursor: "pointer" }}>{rule.is_active ? "Activa" : "Inactiva"}</button>
                                                <button onClick={() => deleteFallback(rule.id)}
                                                    style={{ border: "1px solid rgba(239,68,68,0.35)", borderRadius: 999, padding: "4px 10px", background: "rgba(239,68,68,0.08)", color: "#ef4444", fontWeight: 800, cursor: "pointer" }}>Eliminar</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>

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
                                        {["ID", "Nombre", "Slug", "Modo", "Regla", "Promo", "Categoría", "Venta Int.", "Logo", "Activo"].map(h => (
                                            <th key={h} style={{ padding: "12px 16px", fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.7px", whiteSpace: "nowrap" }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={10} style={{ padding: "60px 20px", textAlign: "center" }}>
                                            <div style={{ width: 32, height: 32, border: "3px solid var(--stroke)", borderTopColor: "#0da6f2", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
                                        </td></tr>
                                    ) : filtered.length === 0 ? (
                                        <tr><td colSpan={10} style={{ padding: "60px 20px", textAlign: "center", color: "var(--muted)" }}>
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
                                                        <div>
                                                            <div style={{ fontWeight: 700, color: "var(--text)" }}>{p.name}</div>
                                                            <div style={{ marginTop: 3, fontSize: 10, color: String(p.product_details || "").trim() ? "#10b981" : "var(--muted)" }}>
                                                                {String(p.product_details || "").trim() ? "Ficha configurada" : "Sin ficha"}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Slug */}
                                                <td style={{ padding: "12px 16px" }}>
                                                    <code style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--stroke)", borderRadius: 6, padding: "3px 8px", fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>{p.slug}</code>
                                                </td>

                                                {/* Modo */}
                                                <td style={{ padding: "12px 16px" }}>
                                                    <span style={{
                                                        fontSize: 11, fontWeight: 800, textTransform: "uppercase",
                                                        padding: "3px 8px", borderRadius: 8,
                                                        background: p.type === "correo" ? "rgba(13,166,242,0.15)" : "transparent",
                                                        color: p.type === "correo" ? "#0da6f2" : "var(--muted)",
                                                        border: p.type === "correo" ? "1px solid rgba(13,166,242,0.3)" : "none"
                                                    }}>
                                                        {p.type === "correo" ? "A CORREO" : "NORMAL"}
                                                    </span>
                                                </td>

                                                <td style={{ padding: "12px 16px" }}>
                                                    <button
                                                        onClick={() => updateDeviceRule(p.id, !deviceRuleEnabled(p.show_device_rule))}
                                                        title={deviceRuleEnabled(p.show_device_rule) ? "Ocultar regla en entregas" : "Mostrar regla en entregas"}
                                                        style={{
                                                            background: deviceRuleEnabled(p.show_device_rule) ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.05)",
                                                            color: deviceRuleEnabled(p.show_device_rule) ? "#10b981" : "var(--muted)",
                                                            border: deviceRuleEnabled(p.show_device_rule) ? "1px solid rgba(16,185,129,0.35)" : "1px solid var(--stroke)",
                                                            padding: "5px 12px",
                                                            borderRadius: 20,
                                                            fontSize: 11,
                                                            fontWeight: 800,
                                                            cursor: "pointer",
                                                            whiteSpace: "nowrap",
                                                            fontFamily: "var(--font)"
                                                        }}
                                                    >
                                                        {deviceRuleEnabled(p.show_device_rule) ? "Activa" : "Oculta"}
                                                    </button>
                                                </td>

                                                <td style={{ padding: "12px 16px" }}>
                                                    {p.is_promo ? (
                                                        <span style={{
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            gap: 8,
                                                            padding: "5px 10px",
                                                            borderRadius: 999,
                                                            fontSize: 11,
                                                            fontWeight: 900,
                                                            color: p.promo_color || DEFAULT_PROMO_COLOR,
                                                            background: `${p.promo_color || DEFAULT_PROMO_COLOR}18`,
                                                            border: `1px solid ${(p.promo_color || DEFAULT_PROMO_COLOR)}66`,
                                                            boxShadow: `0 0 16px ${(p.promo_color || DEFAULT_PROMO_COLOR)}22`
                                                        }}>
                                                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.promo_color || DEFAULT_PROMO_COLOR, boxShadow: `0 0 12px ${p.promo_color || DEFAULT_PROMO_COLOR}` }} />
                                                            {p.show_promo_last_units ? "Promo + últimas" : "Promo"}
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: 11, color: "var(--muted)" }}>--</span>
                                                    )}
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

            <PlatformEditModal
                editingPlatform={editingPlatform}
                setEditingPlatform={setEditingPlatform}
                saveEditedPlatform={saveEditedPlatform}
                activeCategories={activeCategories}
                saving={saving}
            />
        </div>
    );
}
