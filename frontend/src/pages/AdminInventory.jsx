import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiGet, apiPatch, apiPost, apiLogout } from "../api/api";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";

const LOGO_URL = "/api/branding/logo";

export default function AdminInventory() {
    const [platforms, setPlatforms] = useState([]);
    const [users, setUsers] = useState([]);
    const [items, setItems] = useState([]);
    const [prices, setPrices] = useState([]);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(25);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    const [platformId, setPlatformId] = useState("");
    const [status, setStatus] = useState(""); // available | assigned | sold | inactive | down
    const [q, setQ] = useState("");
    const [assignedTo, setAssignedTo] = useState("");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    // Modal de Venta
    const [sellModal, setSellModal] = useState({ open: false, item: null });
    const [userSearch, setUserSearch] = useState("");
    const [sellData, setSellData] = useState({
        userId: "",
        platformPriceId: "",
        customExpiryDate: "",
        recordProfit: true,
        profitAmount: 0
    });
    const [whatsappResult, setWhatsappResult] = useState("");

    const navigate = useNavigate();
    const { user, setUser } = useAuth();

    const filteredUsersForModal = useMemo(() => {
        if (!userSearch) return users;
        const low = userSearch.toLowerCase();
        return users.filter(u => 
            String(u.email || "").toLowerCase().includes(low) || 
            String(u.name || "").toLowerCase().includes(low)
        );
    }, [users, userSearch]);

    async function logout() {
        try { await apiLogout(); } catch (e) { console.error(e); }
        setUser(null);
        try {
            localStorage.removeItem("user");
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
        } catch { }
        navigate("/", { replace: true });
    }

    const selectedPlatform = useMemo(
        () => platforms.find((p) => String(p.id) === String(platformId)),
        [platforms, platformId]
    );

    async function loadPlatforms() {
        const r = await apiGet("/api/admin/platforms");
        if (!r.ok) throw new Error(r.data?.message || "No se pudo cargar plataformas.");
        return Array.isArray(r.data) ? r.data : [];
    }

    async function loadUsers() {
        const r = await apiGet("/api/admin/users?limit=1000"); // Aumentar límite para ver todos
        if (!r.ok) throw new Error(r.data?.message || "No se pudo cargar usuarios.");
        const us = r.data?.items || [];
        // Ordenar alfabéticamente por email
        us.sort((a, b) => (a.email || "").localeCompare(b.email || ""));
        return us;
    }

    async function loadPrices() {
        const r = await apiGet("/api/admin/prices");
        if (!r.ok) throw new Error(r.data?.message || "No se pudo cargar precios.");
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

            const r = await apiGet(`/api/admin/inventory?${params.toString()}`);
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
            const [p, u, pr] = await Promise.all([loadPlatforms(), loadUsers(), loadPrices()]);
            setPlatforms(p);
            setUsers(u);
            setPrices(pr);
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
            const r = await apiPatch(`/api/admin/inventory/${id}`, patch);
            if (!r.ok) throw new Error(r.data?.message || "No se pudo actualizar.");
            await loadInventory(page);
        } catch (e) {
            setError(e?.message || "Error actualizando.");
        } finally {
            setSaving(false);
        }
    }

    async function handleSell() {
        if (!sellData.userId || !sellData.platformPriceId) {
            alert("Usuario y Plan son obligatorios.");
            return;
        }

        setSaving(true);
        setError("");
        try {
            const r = await apiPost(`/api/admin/inventory/${sellModal.item.id}/sell`, {
                userId: sellData.userId,
                platformPriceId: sellData.platformPriceId,
                customExpiryDate: sellData.customExpiryDate || null,
                recordProfit: sellData.recordProfit,
                profitAmount: sellData.profitAmount
            });

            if (!r.ok) throw new Error(r.data?.message || "Error en la venta.");

            setWhatsappResult(r.data.whatsappMessage);
            await loadInventory(page);
        } catch (e) {
            setError(e?.message || "Error en la venta.");
        } finally {
            setSaving(false);
        }
    }

    useEffect(() => {
        refreshAll();
        // eslint-disable-next-line
    }, []);

    const inputStyle = {
        appearance: "none", WebkitAppearance: "none",
        height: 44, padding: "0 16px",
        background: "var(--input-bg)", color: "var(--text)",
        border: "1px solid var(--stroke)", borderRadius: 12,
        fontSize: 14, fontWeight: 500, outline: "none", width: "100%", fontFamily: "var(--font)",
        transition: "border-color 0.2s, box-shadow 0.2s"
    };

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                <AdminSidebar
                    user={user}
                    logoSrc={LOGO_URL}
                    logoOk={true}
                    setLogoOk={() => { }}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main" style={{ padding: "20px 24px 32px", display: "flex", flexDirection: "column" }}>
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, gap: 20, flexWrap: "wrap", borderBottom: "1px solid var(--stroke)", paddingBottom: 24 }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                                background: "rgba(13,166,242,0.1)",
                                border: "1px solid rgba(13,166,242,0.3)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 24, boxShadow: "0 4px 16px rgba(13,166,242,0.2)",
                            }}>
                                📦
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" }}>
                                    Inventario (Cuentas)
                                </h1>
                                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
                                    Gestión global de credenciales, perfiles y estados asignados.
                                </p>
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: 12 }}>
                            <button className="btn-ghost" style={{ padding: "0 16px", height: 42, background: "rgba(255,255,255,0.03)" }} onClick={refreshAll} disabled={loading}>
                                {loading ? "↻" : "🔄 Refrescar"}
                            </button>
                        </div>
                    </motion.div>

                    {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

                    {/* Filters */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "20px", marginBottom: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}
                    >
                        <form onSubmit={(e) => { e.preventDefault(); loadInventory(1); }} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>

                            <div>
                                <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 8, fontWeight: 500 }}>
                                    Plataforma
                                </label>
                                <div style={{ position: "relative" }}>
                                    <select style={{ ...inputStyle, cursor: "pointer", paddingRight: 36 }}
                                        value={platformId} onChange={e => setPlatformId(e.target.value)}>
                                        <option value="" style={{ background: "var(--bg0)", color: "var(--text)" }}>Todas las plataformas</option>
                                        {platforms.map(p => (
                                            <option key={p.id} value={p.id} style={{ background: "var(--bg0)", color: "var(--text)" }}>#{p.id} - {p.name}</option>
                                        ))}
                                    </select>
                                    <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 8, fontWeight: 500 }}>
                                    Estado
                                </label>
                                <div style={{ position: "relative" }}>
                                    <select style={{ ...inputStyle, cursor: "pointer", paddingRight: 36 }}
                                        value={status} onChange={e => setStatus(e.target.value)}>
                                        <option value="" style={{ background: "var(--bg0)", color: "var(--text)" }}>Cualquier estado</option>
                                        <option value="available" style={{ background: "var(--bg0)", color: "var(--text)" }}>🟢 Disponibles</option>
                                        <option value="assigned" style={{ background: "var(--bg0)", color: "var(--text)" }}>🔵 Asignadas (vendidas)</option>
                                        <option value="sold" style={{ background: "var(--bg0)", color: "var(--text)" }}>🟣 Vendidas (alias)</option>
                                        <option value="inactive" style={{ background: "var(--bg0)", color: "var(--text)" }}>⚪ Inactivas</option>
                                        <option value="down" style={{ background: "var(--bg0)", color: "var(--text)" }}>🔴 Caídas</option>
                                    </select>
                                    <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 8, fontWeight: 500 }}>
                                    Asignada a (Email)
                                </label>
                                <div style={{ position: "relative" }}>
                                    <select style={{ ...inputStyle, cursor: "pointer", paddingRight: 36 }}
                                        value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                                        <option value="" style={{ background: "var(--bg0)", color: "var(--text)" }}>Cualquier usuario</option>
                                        {users.map(u => (
                                            <option key={u.id} value={u.email} style={{ background: "var(--bg0)", color: "var(--text)" }}>{u.email}</option>
                                        ))}
                                    </select>
                                    <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 8, fontWeight: 500 }}>
                                    Buscar texto
                                </label>
                                <div style={{ position: "relative" }}>
                                    <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 14, opacity: 0.6 }}>🔍</span>
                                    <input
                                        type="text"
                                        style={{ ...inputStyle, paddingLeft: 38 }}
                                        value={q}
                                        onChange={e => setQ(e.target.value)}
                                        placeholder="Buscar email..."
                                    />
                                </div>
                            </div>

                            <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16, marginTop: 12, gridColumn: "1 / -1" }}>
                                <div style={{ fontSize: 13, color: "var(--muted)", display: "flex", gap: 8, flexWrap: "wrap", flex: "1 1 auto" }}>
                                    <div style={{ background: "rgba(0,0,0,0.15)", padding: "6px 14px", borderRadius: 8, border: "1px solid var(--stroke2)", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                                        Plataforma: <b style={{ color: "var(--text)" }}>{selectedPlatform?.name || "Todas"}</b>
                                    </div>
                                    <div style={{ background: "rgba(0,0,0,0.15)", padding: "6px 14px", borderRadius: 8, border: "1px solid var(--stroke2)", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                                        Registros: <b style={{ color: "var(--text)" }}>{total}</b>
                                    </div>
                                </div>
                                <button type="submit" disabled={loading} style={{ height: 44, padding: "0 28px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #0da6f2 0%, #8b5cf6 100%)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 4px 16px rgba(13,166,242,0.3)", flex: "1 1 auto", minWidth: 200 }}>
                                    Filtrar Inventario
                                </button>
                            </div>
                        </form>
                    </motion.div>

                    {/* Table */}
                    <div style={{ flex: 1, background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                                <thead>
                                    <tr style={{ background: "rgba(0,0,0,0.2)", borderBottom: "1px solid var(--stroke2)" }}>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>ID</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Plataforma</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Email Cuenta</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Estado</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Asignada A</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Expiración</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Acciones Rápidas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={7} style={{ padding: "60px 20px", textAlign: "center" }}><div className="spinner" style={{ margin: "0 auto" }}></div></td></tr>
                                    ) : items.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ padding: "60px 20px", textAlign: "center", color: "var(--muted)" }}>
                                                <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
                                                No hay registros de inventario con estos filtros.
                                            </td>
                                        </tr>
                                    ) : (
                                        items.map((it, idx) => (
                                            <InvRow
                                                key={it.id}
                                                it={it}
                                                idx={idx}
                                                saving={saving}
                                                onUpdate={(patch) => updateItem(it.id, patch)}
                                                onSell={() => {
                                                    setUserSearch("");
                                                    setSellData({ userId: "", platformPriceId: "", customExpiryDate: "", recordProfit: true, profitAmount: 0 });
                                                    setSellModal({ open: true, item: it });
                                                }}
                                            />
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {total > 0 && (
                            <div style={{ padding: "16px 20px", borderTop: "1px solid var(--stroke)", background: "var(--bg0)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: "auto" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <span style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>Mostrar:</span>
                                    <select style={{ ...inputStyle, height: 32, padding: "0 10px", paddingRight: 30, fontSize: 12, width: "auto" }} value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); loadInventory(1, Number(e.target.value)); }}>
                                        <option value={10}>10 / pág</option>
                                        <option value={25}>25 / pág</option>
                                        <option value={50}>50 / pág</option>
                                        <option value={100}>100 / pág</option>
                                    </select>
                                    <span style={{ fontSize: 13, color: "var(--text)", marginLeft: 8 }}>
                                        Pág <b style={{ color: "var(--accent)" }}>{page}</b> de {totalPages || 1}
                                    </span>
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button className="btn-ghost" disabled={page <= 1 || loading} onClick={() => loadInventory(page - 1)} style={{ padding: "6px 14px", height: "auto", fontSize: 13, borderRadius: 8 }}>
                                        ← Anterior
                                    </button>
                                    <button className="btn-ghost" disabled={page >= totalPages || loading} onClick={() => loadInventory(page + 1)} style={{ padding: "6px 14px", height: "auto", fontSize: 13, borderRadius: 8 }}>
                                        Siguiente →
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* Modal Vender */}
            <AnimatePresence>
                {sellModal.open && (
                    <div className="modal-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            style={{ background: "var(--bg1)", border: "1px solid var(--stroke)", borderRadius: 24, width: "100%", maxWidth: 500, padding: 32, boxShadow: "0 20px 80px rgba(0,0,0,0.5)", position: "relative", overflow: "hidden" }}
                        >
                            <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 6, background: "linear-gradient(90deg, #0da6f2 0%, #8b5cf6 100%)" }} />
                            
                            <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 900, color: "var(--text)" }}>Vender Cuenta</h2>
                            <p style={{ margin: "0 0 24px", fontSize: 14, color: "var(--muted)" }}>
                                Estas vendiendo: <b style={{ color: "var(--text)" }}>{sellModal.item?.platform_name}</b> ({sellModal.item?.email})
                            </p>

                            {whatsappResult ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                    <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 12, padding: 16, color: "#10b981", fontSize: 14, fontWeight: 600 }}>
                                        ✅ ¡Venta realizada con éxito!
                                    </div>
                                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Mensaje para WhatsApp:</label>
                                    <textarea
                                        readOnly
                                        style={{ ...inputStyle, height: 160, resize: "none", fontSize: 12, background: "var(--bg0)", padding: 12 }}
                                        value={whatsappResult}
                                    />
                                    <button 
                                        className="btn-primary" 
                                        style={{ height: 48, borderRadius: 12, background: "#2563EB", color: "white", fontWeight: 700, border: "none", cursor: "pointer" }}
                                        onClick={() => {
                                            navigator.clipboard.writeText(whatsappResult);
                                            alert("Copiado al portapapeles");
                                        }}
                                    >
                                        📋 Copiar Mensaje
                                    </button>
                                    <button className="btn-ghost" style={{ height: 44 }} onClick={() => { setSellModal({ open: false, item: null }); setWhatsappResult(""); }}>
                                        Cerrar
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                                    {error && (
                                        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 12, padding: "12px 16px", fontSize: 13, fontWeight: 600 }}>
                                            ⚠ {error}
                                        </div>
                                    )}
                                    <div>
                                        <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>Usuario Comprador</label>
                                        <div style={{ position: "relative", marginBottom: 8 }}>
                                            <input 
                                                type="text" 
                                                placeholder="🔍 Buscar por Correo o Nombre..." 
                                                style={{ ...inputStyle, height: 38, fontSize: 13, paddingLeft: 12, background: "rgba(0,0,0,0.2)" }} 
                                                value={userSearch} 
                                                onChange={e => setUserSearch(e.target.value)} 
                                            />
                                        </div>
                                        <select style={inputStyle} value={sellData.userId} onChange={e => setSellData({...sellData, userId: e.target.value})}>
                                            <option value="">{userSearch ? `Filtrados (${filteredUsersForModal.length})` : "Selecciona un usuario..."}</option>
                                            {filteredUsersForModal.map(u => (
                                                <option key={u.id} value={u.id}>{u.email} ({u.currency})</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>Plan / Duración</label>
                                        <select style={inputStyle} value={sellData.platformPriceId} onChange={e => setSellData({...sellData, platformPriceId: e.target.value})}>
                                            <option value="">Selecciona el plan...</option>
                                            {prices.filter(p => p.platform_id === sellModal.item?.platform_id).map(p => (
                                                <option key={p.id} value={p.id}>{p.duration_name} - {p.price} {p.currency}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>Fecha Vencimiento (Opcional)</label>
                                        <input 
                                            type="date" 
                                            style={inputStyle} 
                                            value={sellData.customExpiryDate} 
                                            onChange={e => setSellData({...sellData, customExpiryDate: e.target.value})} 
                                        />
                                        <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Si está vacío, se usará la duración del plan.</p>
                                    </div>

                                    <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                                        <button className="btn-ghost" style={{ flex: 1, height: 48 }} onClick={() => setSellModal({ open: false, item: null })} disabled={saving}>Cancelar</button>
                                        <button 
                                            className="btn-primary" 
                                            style={{ flex: 2, height: 48, borderRadius: 12, background: "linear-gradient(135deg, #0da6f2 0%, #8b5cf6 100%)", color: "white", fontWeight: 700, border: "none", cursor: "pointer" }}
                                            onClick={handleSell}
                                            disabled={saving}
                                        >
                                            {saving ? "Procesando..." : "🚀 Confirmar Venta"}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

function InvRow({ it, idx, saving, onUpdate, onSell }) {
    const [show, setShow] = useState(false);

    let badgeBg, badgeColor, badgeText;
    switch (it.status) {
        case "available":
            badgeBg = "rgba(16,185,129,0.15)"; badgeColor = "#10b981"; badgeText = "Disponible"; break;
        case "assigned":
            badgeBg = "rgba(13,166,242,0.15)"; badgeColor = "#0da6f2"; badgeText = "Asignada"; break;
        case "sold":
            badgeBg = "rgba(139,92,246,0.15)"; badgeColor = "#8b5cf6"; badgeText = "Vendida"; break;
        case "inactive":
            badgeBg = "rgba(107,114,128,0.15)"; badgeColor = "#9ca3af"; badgeText = "Inactiva"; break;
        case "down":
            badgeBg = "rgba(239,68,68,0.15)"; badgeColor = "#ef4444"; badgeText = "Caída"; break;
        default:
            badgeBg = "rgba(255,255,255,0.05)"; badgeColor = "var(--muted)"; badgeText = String(it.status); break;
    }

    const rowBtnStyle = { padding: "4px 10px", fontSize: 11, height: "auto", borderRadius: 6, minWidth: 0, whiteSpace: "nowrap" };

    return (
        <>
            <motion.tr
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.02 }}
                style={{ borderBottom: "1px solid var(--stroke2)", background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(13,166,242,0.05)"}
                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)"}
            >
                <td style={{ padding: "14px 16px", fontFamily: "monospace", fontSize: 12, color: "var(--muted)" }}>#{it.id}</td>
                <td style={{ padding: "14px 16px", fontWeight: 600 }}>{it.platform_name}</td>
                <td style={{ padding: "14px 16px", fontWeight: 500 }}>{it.email}</td>
                <td style={{ padding: "14px 16px" }}>
                    <span style={{ background: badgeBg, color: badgeColor, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, border: `1px solid ${badgeColor}40`, display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>
                        {badgeText}
                    </span>
                </td>
                <td style={{ padding: "14px 16px", color: "var(--muted)", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.assigned_user_email}>
                    {it.assigned_user_email || "—"}
                </td>
                <td style={{ padding: "14px 16px", fontSize: 12, color: "var(--muted)" }}>
                    {it.expires_at ? String(it.expires_at).slice(0, 10) : "—"}
                </td>
                <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 220 }}>
                        <button className="btn-ghost" disabled={saving} onClick={onSell} style={{ ...rowBtnStyle, background: "#10b981", color: "white", border: "none", fontWeight: 700 }}>💰 Vender</button>
                        <button className="btn-ghost" disabled={saving} onClick={() => setShow((s) => !s)} style={{ ...rowBtnStyle, border: show ? "1px solid #10b981" : "1px solid var(--stroke)", color: show ? "#10b981" : "var(--text)", background: show ? "rgba(16,185,129,0.1)" : "var(--input-bg)" }}>
                            {show ? "Ocultar" : "Credenciales"}
                        </button>
                        <button className="btn-ghost" disabled={saving} onClick={() => onUpdate({ status: "available" })} style={{ ...rowBtnStyle, background: "var(--input-bg)" }} title="Marcar disponible">🟢</button>
                        <button className="btn-ghost" disabled={saving} onClick={() => onUpdate({ status: "inactive" })} style={{ ...rowBtnStyle, background: "var(--input-bg)" }} title="Marcar inactiva">⚪</button>
                        <button className="btn-ghost" disabled={saving} onClick={() => onUpdate({ status: "down" })} style={{ ...rowBtnStyle, background: "var(--input-bg)" }} title="Marcar caída">🔴</button>
                        <button className="btn-ghost" disabled={saving} onClick={() => onUpdate({ reset_assign: true })} style={{ ...rowBtnStyle, background: "var(--input-bg)" }} title="Reset asignación">🔄</button>
                    </div>
                </td>
            </motion.tr>
            <AnimatePresence>
                {show && (
                    <motion.tr initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                        <td colSpan={7} style={{ padding: 0 }}>
                            <div style={{ padding: "16px 24px", background: "rgba(13,166,242,0.05)", borderBottom: "1px solid var(--stroke2)", display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
                                <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                                    <span style={{ textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>Email</span>
                                    <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 13, background: "var(--bg0)", padding: "4px 8px", borderRadius: 6, userSelect: "all" }}>{it.email}</span>
                                </div>
                                <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                                    <span style={{ textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>Contraseña</span>
                                    <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 13, background: "var(--bg0)", padding: "4px 8px", borderRadius: 6, userSelect: "all", fontFamily: "monospace" }}>{it.password || "—"}</span>
                                </div>
                                <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                                    <span style={{ textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>Perfil / Pantalla</span>
                                    <span style={{ color: "var(--text)", fontWeight: 800, fontSize: 13, background: "var(--bg0)", padding: "4px 12px", borderRadius: 6, textAlign: "center" }}>{it.profile_number ?? "—"}</span>
                                </div>
                                <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                                    <span style={{ textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>Pin Control</span>
                                    <span style={{ color: "var(--text)", fontWeight: 800, fontSize: 13, background: "var(--bg0)", padding: "4px 12px", borderRadius: 6, textAlign: "center", fontFamily: "monospace" }}>{it.pin ?? "—"}</span>
                                </div>
                                {it.access_url && (
                                    <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                                        <span style={{ textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>URL Acceso</span>
                                        <a href={it.access_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontWeight: 600, fontSize: 13, background: "var(--bg0)", padding: "4px 8px", borderRadius: 6, textDecoration: "none" }}>Abrir Enlace 🔗</a>
                                    </div>
                                )}
                            </div>
                        </td>
                    </motion.tr>
                )}
            </AnimatePresence>
        </>
    );
}
