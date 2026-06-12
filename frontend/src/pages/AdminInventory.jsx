import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiGet, apiPatch, apiPost, apiLogout } from "../api/api";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";
import { formatBogotaDate, normalizeDateOnly } from "../utils/datetime.js";

const LOGO_URL = "/api/branding/logo";

function SearchableSelect({
    label,
    value,
    onChange,
    options,
    placeholder,
    searchPlaceholder,
    inputStyle,
    getSearchText,
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

    const selected = options.find((opt) => String(opt.value) === String(value));
    const selectedLabel = selected?.label || placeholder;

    const filteredOptions = options.filter((opt) => {
        const haystack = (getSearchText ? getSearchText(opt) : opt.label).toLowerCase();
        return haystack.includes(search.toLowerCase());
    });

    return (
        <div>
            <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 8, fontWeight: 500 }}>
                {label}
            </label>
            <div style={{ position: "relative" }}>
                <button
                    type="button"
                    onClick={() => {
                        setOpen((prev) => !prev);
                        setSearch("");
                    }}
                    style={{
                        ...inputStyle,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        textAlign: "left",
                    }}
                >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedLabel}</span>
                    <span style={{ marginLeft: 12, fontSize: 10, color: "var(--muted)" }}>▼</span>
                </button>

                {open && (
                    <div style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        left: 0,
                        right: 0,
                        background: "var(--bg1)",
                        border: "1px solid var(--stroke)",
                        borderRadius: 14,
                        boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
                        zIndex: 120,
                        overflow: "hidden",
                    }}>
                        <div style={{ padding: 10, borderBottom: "1px solid var(--stroke2)" }}>
                            <input
                                autoFocus
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={searchPlaceholder}
                                style={{ ...inputStyle, height: 38, fontSize: 13 }}
                            />
                        </div>

                        <div style={{ maxHeight: 240, overflowY: "auto", padding: 6 }}>
                            {filteredOptions.map((opt) => {
                                const active = String(opt.value) === String(value);
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => {
                                            onChange(opt.value);
                                            setOpen(false);
                                            setSearch("");
                                        }}
                                        style={{
                                            width: "100%",
                                            textAlign: "left",
                                            padding: "10px 12px",
                                            borderRadius: 10,
                                            border: active ? "1px solid rgba(13,166,242,0.35)" : "1px solid transparent",
                                            background: active ? "rgba(13,166,242,0.12)" : "transparent",
                                            color: active ? "var(--accent)" : "var(--text)",
                                            cursor: "pointer",
                                            fontSize: 13,
                                            fontWeight: active ? 700 : 500,
                                        }}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}

                            {!filteredOptions.length && (
                                <div style={{ padding: "14px 12px", color: "var(--muted)", fontSize: 13, textAlign: "center" }}>
                                    Sin resultados
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function AdminInventory() {
    const [platforms, setPlatforms] = useState([]);
    const [users, setUsers] = useState([]);
    const [items, setItems] = useState([]);
    const [prices, setPrices] = useState([]);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    const [platformId, setPlatformId] = useState("");
    const [status, setStatus] = useState(""); // available | assigned | sold | inactive | down
    const [q, setQ] = useState("");
    const [assignedTo, setAssignedTo] = useState("");
    const [profileNumber, setProfileNumber] = useState("");

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
    const [sellCompleted, setSellCompleted] = useState(false);
    const [sellDeliveryMessage, setSellDeliveryMessage] = useState("");
    const [editModal, setEditModal] = useState({ open: false, item: null });
    const [editData, setEditData] = useState({
        email: "",
        password: "",
        pin: "",
        profile_number: "",
        expiresAt: "",
        status: "available",
    });
    const [editError, setEditError] = useState("");
    const [supportModal, setSupportModal] = useState({ open: false, item: null });
    const [supportInfo, setSupportInfo] = useState(null);
    const [supportLoading, setSupportLoading] = useState(false);
    const [supportError, setSupportError] = useState("");
    const [supportCopied, setSupportCopied] = useState("");
    const [supportReplacementId, setSupportReplacementId] = useState("");
    const [detailById, setDetailById] = useState({});
    const [detailLoadingById, setDetailLoadingById] = useState({});
    const [detailErrorById, setDetailErrorById] = useState({});

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

    const platformOptions = useMemo(
        () => [
            { value: "", label: "Todas las plataformas" },
            ...platforms.map((p) => ({ value: String(p.id), label: `#${p.id} - ${p.name}` })),
        ],
        [platforms]
    );

    const statusOptions = useMemo(
        () => [
            { value: "", label: "Cualquier estado" },
            { value: "available", label: "🟢 Disponibles" },
            { value: "assigned", label: "🔵 Asignadas (vendidas)" },
            { value: "sold", label: "🟣 Vendidas (alias)" },
            { value: "inactive", label: "⚪ Inactivas" },
            { value: "down", label: "🔴 Caídas" },
        ],
        []
    );

    const assignedUserOptions = useMemo(
        () => [
            { value: "", label: "Cualquier usuario" },
            ...users.map((u) => ({
                value: u.email,
                label: u.email,
                name: u.name || "",
            })),
        ],
        [users]
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
            if (profileNumber.trim()) params.set("profileNumber", profileNumber.trim());
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

    function openEdit(item) {
        if (!item) return;
        setEditError("");
        setEditData({
            email: item.email || "",
            password: item.password || "",
            pin: item.pin || "",
            profile_number: item.profile_number ?? "",
            expiresAt: normalizeDateOnly(item.display_expires_at || item.expires_at),
            status: item.status || "available",
        });
        setEditModal({ open: true, item });
    }

    async function handleEditSave() {
        if (!editModal.item?.id) return;
        if (!String(editData.email || "").trim()) {
            setEditError("El correo es obligatorio.");
            return;
        }

        setSaving(true);
        setEditError("");
        setError("");
        try {
            const r = await apiPatch(`/api/admin/inventory/${editModal.item.id}`, {
                email: editData.email,
                password: editData.password,
                pin: editData.pin,
                profile_number: editData.profile_number,
                expiresAt: editData.expiresAt,
                status: editData.status,
            });
            if (!r.ok) throw new Error(r.data?.message || "No se pudo guardar la cuenta.");

            const editedId = editModal.item.id;
            setDetailById((prev) => {
                const next = { ...prev };
                delete next[editedId];
                return next;
            });
            setEditModal({ open: false, item: null });
            await loadInventory(page);
        } catch (e) {
            setEditError(e?.message || "No se pudo guardar la cuenta.");
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

            setSellDeliveryMessage(r.data?.deliveryMessage || "");
            setSellCompleted(true);
            await loadInventory(page);
        } catch (e) {
            setError(e?.message || "Error en la venta.");
        } finally {
            setSaving(false);
        }
    }

    async function openSupport(item) {
        if (!item?.sale_id) {
            setError("Esta cuenta no tiene una venta activa asociada para generar soporte.");
            return;
        }

        setSupportModal({ open: true, item });
        setSupportInfo(null);
        setSupportError("");
        setSupportCopied("");
        setSupportReplacementId("");
        setSupportLoading(true);
        try {
            const r = await apiGet(`/api/admin/support/subscription/${item.sale_id}`);
            if (!r.ok) throw new Error(r.data?.message || "No se pudo cargar el soporte.");
            setSupportInfo(r.data);
            setSupportReplacementId(r.data?.suggestedReplacementId ? String(r.data.suggestedReplacementId) : "");
        } catch (e) {
            setSupportError(e?.message || "No se pudo cargar el soporte.");
        } finally {
            setSupportLoading(false);
        }
    }

    async function handleSupportReplace() {
        if (!supportInfo?.subscriptionId) return;
        setSupportLoading(true);
        setSupportError("");
        try {
            const r = await apiPost("/api/admin/support/replace-account", {
                subscriptionId: supportInfo.subscriptionId,
                replacementAccountId: supportReplacementId || null,
            });
            if (!r.ok) throw new Error(r.data?.message || "No se pudo reemplazar la cuenta.");
            setSupportInfo(r.data?.info || null);
            setSupportReplacementId(r.data?.info?.suggestedReplacementId ? String(r.data.info.suggestedReplacementId) : "");
            await loadInventory(page);
        } catch (e) {
            setSupportError(e?.message || "No se pudo reemplazar la cuenta.");
        } finally {
            setSupportLoading(false);
        }
    }

    async function copySupportText(text, label) {
        try {
            await navigator.clipboard.writeText(text || "");
            setSupportCopied(label);
            setTimeout(() => setSupportCopied(""), 1800);
        } catch {
            setSupportCopied("");
        }
    }

    async function ensureAccountDetail(accountId) {
        if (!accountId || detailById[accountId] || detailLoadingById[accountId]) return;

        setDetailLoadingById((prev) => ({ ...prev, [accountId]: true }));
        setDetailErrorById((prev) => ({ ...prev, [accountId]: "" }));
        try {
            const r = await apiGet(`/api/admin/inventory/${accountId}/detail`);
            if (!r.ok) throw new Error(r.data?.message || "No se pudo cargar el historial.");
            setDetailById((prev) => ({ ...prev, [accountId]: r.data }));
        } catch (e) {
            setDetailErrorById((prev) => ({ ...prev, [accountId]: e?.message || "No se pudo cargar el historial." }));
        } finally {
            setDetailLoadingById((prev) => ({ ...prev, [accountId]: false }));
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
            <div className="page-shell-bg" aria-hidden>
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />
            </div>

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
                                <SearchableSelect
                                    label="Plataforma"
                                    value={platformId}
                                    onChange={setPlatformId}
                                    options={platformOptions}
                                    placeholder="Todas las plataformas"
                                    searchPlaceholder="Buscar plataforma..."
                                    inputStyle={inputStyle}
                                />
                            </div>

                            <div>
                                <SearchableSelect
                                    label="Estado"
                                    value={status}
                                    onChange={setStatus}
                                    options={statusOptions}
                                    placeholder="Cualquier estado"
                                    searchPlaceholder="Buscar estado..."
                                    inputStyle={inputStyle}
                                />
                            </div>

                            <div>
                                <SearchableSelect
                                    label="Asignada a (Email)"
                                    value={assignedTo}
                                    onChange={setAssignedTo}
                                    options={assignedUserOptions}
                                    placeholder="Cualquier usuario"
                                    searchPlaceholder="Buscar usuario..."
                                    inputStyle={inputStyle}
                                    getSearchText={(opt) => `${opt.label} ${opt.name || ""}`}
                                />
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

                            <div>
                                <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 8, fontWeight: 500 }}>
                                    Perfil
                                </label>
                                <input
                                    type="text"
                                    inputMode="text"
                                    style={inputStyle}
                                    value={profileNumber}
                                    onChange={(e) => setProfileNumber(e.target.value)}
                                    placeholder="Ej: 5 o sin perfil"
                                />
                            </div>

                            <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16, marginTop: 12, gridColumn: "1 / -1" }}>
                                <div style={{ fontSize: 13, color: "var(--muted)", display: "flex", gap: 8, flexWrap: "wrap", flex: "1 1 auto" }}>
                                    <div style={{ background: "rgba(0,0,0,0.15)", padding: "6px 14px", borderRadius: 8, border: "1px solid var(--stroke2)", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                                        Plataforma: <b style={{ color: "var(--text)" }}>{selectedPlatform?.name || "Todas"}</b>
                                    </div>
                                    <div style={{ background: "rgba(0,0,0,0.15)", padding: "6px 14px", borderRadius: 8, border: "1px solid var(--stroke2)", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                                        Registros: <b style={{ color: "var(--text)" }}>{total}</b>
                                    </div>
                                    {profileNumber.trim() && (
                                        <div style={{ background: "rgba(0,0,0,0.15)", padding: "6px 14px", borderRadius: 8, border: "1px solid var(--stroke2)", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                                            Perfil: <b style={{ color: "var(--text)" }}>{profileNumber.trim()}</b>
                                        </div>
                                    )}
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
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>ID Venta</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Asignada A</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Expiración</th>
                                        <th style={{ padding: "14px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Acciones Rápidas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={8} style={{ padding: "60px 20px", textAlign: "center" }}><div className="spinner" style={{ margin: "0 auto" }}></div></td></tr>
                                    ) : items.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} style={{ padding: "60px 20px", textAlign: "center", color: "var(--muted)" }}>
                                                <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
                                                No hay registros de inventario con estos filtros.
                                            </td>
                                        </tr>
                                    ) : (
                                        items.map((it, idx) => (
                                            <InvRow
                                                key={it.id}
                                                it={it}
                                                detail={detailById[it.id] || null}
                                                detailLoading={!!detailLoadingById[it.id]}
                                                detailError={detailErrorById[it.id] || ""}
                                                idx={idx}
                                                saving={saving}
                                                onOpenDetail={() => ensureAccountDetail(it.id)}
                                                onUpdate={(patch) => updateItem(it.id, patch)}
                                                onEdit={() => openEdit(it)}
                                                onSupport={() => openSupport(it)}
                                                onSell={() => {
                                                    setUserSearch("");
                                                    setSellData({ userId: "", platformPriceId: "", customExpiryDate: "", recordProfit: true, profitAmount: 0 });
                                                    setSellCompleted(false);
                                                    setSellDeliveryMessage("");
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

            {/* Modal Soporte */}
            <AnimatePresence>
                {supportModal.open && (
                    <div className="modal-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            style={{ background: "var(--bg1)", border: "1px solid var(--stroke)", borderRadius: 24, width: "100%", maxWidth: 760, padding: 28, boxShadow: "0 20px 80px rgba(0,0,0,0.5)", position: "relative", overflow: "hidden" }}
                        >
                            <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 6, background: "linear-gradient(90deg, #0da6f2 0%, #10b981 100%)" }} />
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 18 }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "var(--text)" }}>Soporte y reemplazo</h2>
                                    <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)" }}>
                                        {supportModal.item?.platform_name} · Venta {supportModal.item?.sale_id ? `#${supportModal.item.sale_id}` : "sin ID"}
                                    </p>
                                </div>
                                <button className="btn-ghost" style={{ height: 40 }} onClick={() => { setSupportModal({ open: false, item: null }); setSupportInfo(null); setSupportError(""); }}>
                                    Cerrar
                                </button>
                            </div>

                            {supportLoading && !supportInfo ? (
                                <div style={{ padding: "40px 0", textAlign: "center", color: "var(--muted)" }}>Cargando soporte...</div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                    {supportError && (
                                        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 12, padding: "12px 16px", fontSize: 13, fontWeight: 600 }}>
                                            {supportError}
                                        </div>
                                    )}
                                    {supportCopied && (
                                        <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", borderRadius: 12, padding: "12px 16px", fontSize: 13, fontWeight: 600 }}>
                                            {supportCopied} copiado
                                        </div>
                                    )}
                                    {supportInfo && (
                                        <>
                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                                                <div style={{ background: "var(--bg0)", border: "1px solid var(--stroke2)", borderRadius: 12, padding: 14 }}>
                                                    <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Subscription</div>
                                                    <div style={{ marginTop: 6, fontWeight: 800 }}>#{supportInfo.subscriptionId}</div>
                                                </div>
                                                <div style={{ background: "var(--bg0)", border: "1px solid var(--stroke2)", borderRadius: 12, padding: 14 }}>
                                                    <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Orden</div>
                                                    <div style={{ marginTop: 6, fontWeight: 800 }}>{supportInfo.orderCode || supportInfo.orderId || "—"}</div>
                                                </div>
                                                <div style={{ background: "var(--bg0)", border: "1px solid var(--stroke2)", borderRadius: 12, padding: 14 }}>
                                                    <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Expira</div>
                                                    <div style={{ marginTop: 6, fontWeight: 800 }}>{formatBogotaDate(supportInfo.expiresAt)}</div>
                                                </div>
                                            </div>
                                            <div style={{ background: "var(--bg0)", border: "1px solid var(--stroke2)", borderRadius: 12, padding: 16 }}>
                                                <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>Cuenta de reemplazo</label>
                                                <select style={inputStyle} value={supportReplacementId} onChange={(e) => setSupportReplacementId(e.target.value)}>
                                                    <option value="">Siguiente disponible</option>
                                                    {(supportInfo.replacementCandidates || []).map((candidate) => (
                                                        <option key={candidate.id} value={candidate.id}>
                                                            #{candidate.id} - {candidate.email} - Perfil {candidate.profile_number ?? "—"}
                                                        </option>
                                                    ))}
                                                </select>
                                                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                                                    {(supportInfo.replacementCandidates || []).length
                                                        ? "Puedes dejar la siguiente disponible o escoger una cuenta específica."
                                                        : "No hay stock disponible para reemplazo."}
                                                </div>
                                            </div>
                                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                                <button className="btn-ghost" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.35)" }} onClick={handleSupportReplace} disabled={supportLoading}>
                                                    {supportLoading ? "Procesando..." : "Reemplazar"}
                                                </button>
                                                <button className="btn-ghost" onClick={() => copySupportText(supportInfo.message || "", "Mensaje")}>Copiar mensaje</button>
                                                <button className="btn-ghost" onClick={() => copySupportText(supportInfo.token ? `${window.location.origin}/s/${supportInfo.token}` : "", "Link")}>Copiar link</button>
                                                {supportInfo?.token && (
                                                    <a className="btn-ghost" href={`/s/${supportInfo.token}`} target="_blank" rel="noreferrer">Abrir /s/</a>
                                                )}
                                            </div>
                                            <textarea readOnly value={supportInfo.message || ""} style={{ ...inputStyle, minHeight: 220, height: 220, padding: 14, resize: "vertical", fontSize: 12, background: "var(--bg0)", fontFamily: "monospace" }} />
                                        </>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

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

                            {sellCompleted ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                    <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 12, padding: 16, color: "#10b981", fontSize: 14, fontWeight: 600 }}>
                                        ✅ ¡Venta realizada con éxito!
                                    </div>
                                    {sellDeliveryMessage ? (
                                        <>
                                            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Mensaje de entrega:</label>
                                            <textarea
                                                readOnly
                                                style={{ ...inputStyle, height: 190, resize: "vertical", fontSize: 12, background: "var(--bg0)", padding: 12, lineHeight: 1.5 }}
                                                value={sellDeliveryMessage}
                                            />
                                            <button
                                                className="btn-primary"
                                                style={{ height: 48, borderRadius: 12, background: "#2563EB", color: "white", fontWeight: 700, border: "none", cursor: "pointer" }}
                                                onClick={() => {
                                                    navigator.clipboard.writeText(sellDeliveryMessage);
                                                    alert("Copiado al portapapeles");
                                                }}
                                            >
                                                Copiar mensaje
                                            </button>
                                        </>
                                    ) : null}
                                    <button className="btn-ghost" style={{ height: 44 }} onClick={() => { setSellModal({ open: false, item: null }); setSellCompleted(false); setSellDeliveryMessage(""); }}>
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
            <AnimatePresence>
                {editModal.open && (
                    <div className="modal-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.94, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.94, y: 20 }}
                            style={{ background: "var(--bg1)", border: "1px solid var(--stroke)", borderRadius: 24, width: "100%", maxWidth: 680, padding: 28, boxShadow: "0 20px 80px rgba(0,0,0,0.5)", position: "relative", overflow: "hidden" }}
                        >
                            <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 6, background: "linear-gradient(90deg, #10b981 0%, #0da6f2 100%)" }} />
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 22 }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "var(--text)" }}>Editar cuenta #{editModal.item?.id}</h2>
                                    <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)" }}>
                                        {editModal.item?.platform_name || "Cuenta"} · los cambios no desactivan el stock.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="btn-ghost"
                                    onClick={() => setEditModal({ open: false, item: null })}
                                    disabled={saving}
                                    style={{ height: 34, padding: "0 12px", borderRadius: 10 }}
                                >
                                    Cerrar
                                </button>
                            </div>

                            {editError && (
                                <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
                                    {editError}
                                </div>
                            )}

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                                <div>
                                    <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>Correo</label>
                                    <input
                                        type="email"
                                        style={inputStyle}
                                        value={editData.email}
                                        onChange={(e) => setEditData((prev) => ({ ...prev, email: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>Contraseña</label>
                                    <input
                                        type="text"
                                        style={inputStyle}
                                        value={editData.password}
                                        onChange={(e) => setEditData((prev) => ({ ...prev, password: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>PIN</label>
                                    <input
                                        type="text"
                                        style={inputStyle}
                                        placeholder="Opcional"
                                        value={editData.pin}
                                        onChange={(e) => setEditData((prev) => ({ ...prev, pin: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>Perfil / pantalla</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        style={inputStyle}
                                        placeholder="Ej: 1, 2, 3..."
                                        value={editData.profile_number}
                                        onChange={(e) => setEditData((prev) => ({ ...prev, profile_number: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>Expiración</label>
                                    <input
                                        type="date"
                                        style={inputStyle}
                                        value={editData.expiresAt}
                                        onChange={(e) => setEditData((prev) => ({ ...prev, expiresAt: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>Estado</label>
                                    <select
                                        style={inputStyle}
                                        value={editData.status}
                                        onChange={(e) => setEditData((prev) => ({ ...prev, status: e.target.value }))}
                                    >
                                        <option value="available">Disponible</option>
                                        <option value="assigned">Asignada</option>
                                        <option value="sold">Vendida</option>
                                        <option value="inactive">Inactiva</option>
                                        <option value="down">Caída</option>
                                        <option value="disabled">Deshabilitada</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginTop: 18, background: "rgba(13,166,242,0.08)", border: "1px solid rgba(13,166,242,0.22)", borderRadius: 14, padding: "12px 14px", color: "var(--muted)", fontSize: 12, lineHeight: 1.45 }}>
                                Para quitar perfil, PIN o fecha, deja el campo vacío y guarda. Para seguir vendiendo la cuenta, deja el estado en Disponible.
                            </div>

                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
                                <button className="btn-ghost" style={{ height: 44, padding: "0 18px" }} onClick={() => setEditModal({ open: false, item: null })} disabled={saving}>
                                    Cancelar
                                </button>
                                <button
                                    className="btn-primary"
                                    style={{ height: 44, minWidth: 160, borderRadius: 12, background: "#10b981", color: "white", fontWeight: 800, border: "none", cursor: saving ? "wait" : "pointer", opacity: saving ? 0.75 : 1 }}
                                    onClick={handleEditSave}
                                    disabled={saving}
                                >
                                    {saving ? "Guardando..." : "Guardar cambios"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

function DetailStat({ label, value, mono = false, tone = "default" }) {
    const toneColor = tone === "accent" ? "#0da6f2" : tone === "success" ? "#10b981" : tone === "warning" ? "#f59e0b" : "var(--text)";
    return (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--stroke2)", borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>{label}</div>
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: toneColor, fontFamily: mono ? "monospace" : "inherit", wordBreak: "break-word" }}>
                {value || "—"}
            </div>
        </div>
    );
}

function MiniPill({ label, tone = "default" }) {
    const styles = tone === "accent"
        ? { color: "#0da6f2", background: "rgba(13,166,242,0.12)", border: "1px solid rgba(13,166,242,0.28)" }
        : tone === "warning"
            ? { color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.28)" }
            : { color: "var(--text)", background: "rgba(255,255,255,0.05)", border: "1px solid var(--stroke2)" };

    return (
        <span style={{ ...styles, display: "inline-flex", alignItems: "center", padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {label}
        </span>
    );
}

function InventoryTimelineItem({ entry }) {
    const titleColor = entry.type === "replacement_in" ? "#10b981" : entry.type === "replacement_out" ? "#f59e0b" : "#0da6f2";
    return (
        <div style={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "center" }}>
                <div style={{ width: 10, height: 10, borderRadius: 999, marginTop: 6, background: titleColor, boxShadow: `0 0 0 4px ${titleColor}22` }} />
            </div>
            <div style={{ paddingBottom: 12, borderBottom: "1px solid var(--stroke2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: titleColor }}>{entry.title}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{formatBogotaDate(entry.created_at)}</div>
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: "var(--text)", fontWeight: 600 }}>{entry.subtitle || "—"}</div>
                {!!entry.meta && <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)" }}>{entry.meta}</div>}
                {!!entry.expires_at && <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)" }}>Expira: {formatBogotaDate(entry.expires_at)}</div>}
                {!!entry.admin_email && <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)" }}>Admin: {entry.admin_email}</div>}
            </div>
        </div>
    );
}

function InvRow({ it, detail, detailLoading, detailError, idx, saving, onOpenDetail, onUpdate, onEdit, onSell, onSupport }) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (show) onOpenDetail?.();
    }, [show, onOpenDetail]);

    let badgeBg, badgeColor, badgeText;
    if (it.is_replacement) {
        badgeBg = "rgba(245,158,11,0.16)";
        badgeColor = "#f59e0b";
        badgeText = "Cuenta reemplazada";
    } else {
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
                <td style={{ padding: "14px 16px", fontFamily: "monospace", fontSize: 12, color: "var(--text)" }}>
                    {it.sale_id ? `#${it.sale_id}` : ""}
                </td>
                <td style={{ padding: "14px 16px", color: "var(--muted)", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.assigned_user_email}>
                    {it.assigned_user_email || "—"}
                </td>
                <td style={{ padding: "14px 16px", fontSize: 12, color: "var(--muted)" }}>
                    {formatBogotaDate(it.display_expires_at || it.expires_at)}
                </td>
                <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 220 }}>
                        <button className="btn-ghost" disabled={saving} onClick={onSell} style={{ ...rowBtnStyle, background: "#10b981", color: "white", border: "none", fontWeight: 700 }}>💰 Vender</button>
                        <button className="btn-ghost" disabled={saving || !it.sale_id} onClick={onSupport} style={{ ...rowBtnStyle, background: "rgba(13,166,242,0.14)", color: "#0da6f2", border: "1px solid rgba(13,166,242,0.35)", fontWeight: 700 }} title={it.sale_id ? "Generar soporte" : "Sin venta activa"}>
                            Soporte
                        </button>
                        <button className="btn-ghost" disabled={saving} onClick={() => setShow((s) => !s)} style={{ ...rowBtnStyle, border: show ? "1px solid #10b981" : "1px solid var(--stroke)", color: show ? "#10b981" : "var(--text)", background: show ? "rgba(16,185,129,0.1)" : "var(--input-bg)" }}>
                            {show ? "Ocultar" : "Credenciales"}
                        </button>
                        <button className="btn-ghost" disabled={saving} onClick={onEdit} style={{ ...rowBtnStyle, background: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.35)", fontWeight: 700 }}>
                            Editar
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
                        <td colSpan={8} style={{ padding: 0 }}>
                            <div style={{ padding: "18px 20px 0", background: "linear-gradient(180deg, rgba(13,166,242,0.07), rgba(13,166,242,0.03))" }}>
                                <div style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.025))", border: "1px solid var(--stroke2)", borderRadius: 20, overflow: "hidden" }}>
                                    <div style={{ padding: "18px 18px 16px", borderBottom: "1px solid var(--stroke2)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                                        <div>
                                            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 800 }}>Tarjeta de cuenta</div>
                                            <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900, color: "var(--text)" }}>#{it.id} · {it.platform_name}</div>
                                            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                                <MiniPill label={`Venta ${it.sale_id ? `#${it.sale_id}` : "sin ID"}`} tone="accent" />
                                                <MiniPill label={`Expira ${formatBogotaDate(it.display_expires_at || it.expires_at)}`} tone="warning" />
                                                <MiniPill label={it.assigned_user_email || "Sin asignar"} />
                                            </div>
                                        </div>
                                        <span style={{ background: badgeBg, color: badgeColor, padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800, border: `1px solid ${badgeColor}40`, whiteSpace: "nowrap" }}>
                                            {badgeText}
                                        </span>
                                    </div>

                                    <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700, marginBottom: 14 }}>Datos de la cuenta</div>
                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 10 }}>
                                                <DetailStat label="Correo" value={it.email} />
                                                <DetailStat label="Contraseña" value={it.password} mono />
                                                <DetailStat label="Pin" value={it.pin} mono />
                                                <DetailStat label="Perfil" value={it.profile_number ?? "—"} />
                                                <DetailStat label="ID venta" value={it.sale_id ? `#${it.sale_id}` : "—"} mono tone="accent" />
                                                <DetailStat label="Asignada a" value={it.assigned_user_email || "—"} />
                                                <DetailStat label="Expiración" value={formatBogotaDate(it.display_expires_at || it.expires_at)} tone="warning" />
                                                <DetailStat label="Orden actual" value={detail?.account?.current_order_code || (detail?.account?.current_order_id ? `#${detail.account.current_order_id}` : "—")} />
                                                <DetailStat label="Creada" value={formatBogotaDate(detail?.account?.created_at || it.created_at)} />
                                                <DetailStat label="Actualizada" value={formatBogotaDate(detail?.account?.updated_at || it.updated_at)} />
                                                <DetailStat label="Asignada desde" value={formatBogotaDate(detail?.account?.assigned_at || it.assigned_at)} />
                                                <DetailStat label="Estado técnico" value={detail?.account?.status || it.status || "—"} />
                                            </div>

                                            {(it.is_replacement || it.replaced_from_account_id || it.replaced_from_account_email) && (
                                                <div style={{ marginTop: 14, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.22)", borderRadius: 14, padding: "12px 14px" }}>
                                                    <div style={{ fontSize: 11, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 800 }}>Origen del reemplazo</div>
                                                    <div style={{ marginTop: 6, fontSize: 14, color: "var(--text)", fontWeight: 700 }}>
                                                        {it.replaced_from_account_id ? `Cuenta #${it.replaced_from_account_id}` : "Cuenta anterior"}
                                                    </div>
                                                    <div style={{ marginTop: 4, fontSize: 13, color: "var(--muted)", wordBreak: "break-word" }}>
                                                        {it.replaced_from_account_email || "Sin correo anterior registrado"}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700, marginBottom: 14 }}>Historial y trazabilidad</div>
                                            {detailLoading ? (
                                                <div style={{ padding: "24px 0", textAlign: "center", color: "var(--muted)" }}>Cargando historial...</div>
                                            ) : detailError ? (
                                                <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 14, padding: "14px 16px" }}>
                                                    {detailError}
                                                </div>
                                            ) : (
                                                <>
                                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
                                                        <DetailStat label="Última orden" value={detail?.lastSubscription?.order_code || (detail?.lastSubscription?.order_id ? `#${detail.lastSubscription.order_id}` : "—")} tone="accent" />
                                                        <DetailStat label="Último comprador" value={detail?.lastSubscription?.buyer_email || detail?.lastSubscription?.buyer_name || "—"} />
                                                        <DetailStat label="Suscripciones" value={detail?.subscriptions?.length ? String(detail.subscriptions.length) : "0"} />
                                                        <DetailStat label="Reemplazos" value={detail?.replacements?.length ? String(detail.replacements.length) : "0"} />
                                                    </div>

                                                    {!!detail?.replacements?.[0] && (
                                                        <div style={{ marginBottom: 16, background: "rgba(13,166,242,0.08)", border: "1px solid rgba(13,166,242,0.22)", borderRadius: 14, padding: "12px 14px" }}>
                                                            <div style={{ fontSize: 11, color: "#0da6f2", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 800 }}>Último reemplazo</div>
                                                            <div style={{ marginTop: 6, fontSize: 14, color: "var(--text)", fontWeight: 700 }}>
                                                                {detail.replacements[0].direction === "incoming" ? "Esta cuenta entró como reemplazo" : "Esta cuenta fue reemplazada por otra"}
                                                            </div>
                                                            <div style={{ marginTop: 4, fontSize: 13, color: "var(--muted)", wordBreak: "break-word" }}>
                                                                {detail.replacements[0].direction === "incoming"
                                                                    ? `${detail.replacements[0].old_account_id ? `Cuenta #${detail.replacements[0].old_account_id}` : "Cuenta anterior"}${detail.replacements[0].old_account_email ? ` · ${detail.replacements[0].old_account_email}` : ""}`
                                                                    : `${detail.replacements[0].new_account_id ? `Cuenta #${detail.replacements[0].new_account_id}` : "Cuenta nueva"}${detail.replacements[0].new_account_email ? ` · ${detail.replacements[0].new_account_email}` : ""}`}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
                                                        {(detail?.timeline?.length ? detail.timeline : [{
                                                            type: "empty",
                                                            created_at: null,
                                                            title: "Sin historial registrado",
                                                            subtitle: "Esta cuenta no tiene movimientos auditados todavía.",
                                                            meta: "",
                                                        }]).map((entry, index) => (
                                                            <InventoryTimelineItem key={`${entry.type}-${entry.created_at || index}-${index}`} entry={entry} />
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: "none" }}>
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
                                {it.is_replacement && (
                                    <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                                        <span style={{ textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>Viene de reemplazo</span>
                                        <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 13, background: "var(--bg0)", padding: "4px 8px", borderRadius: 6 }}>
                                            {it.replaced_from_account_id ? `Cuenta #${it.replaced_from_account_id}` : "Cuenta anterior"}
                                            {it.replaced_from_account_email ? ` · ${it.replaced_from_account_email}` : ""}
                                        </span>
                                    </div>
                                )}
                                {it.access_url && (
                                    <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                                        <span style={{ textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>URL Acceso</span>
                                        <div
                                            title={it.access_url}
                                            style={{
                                                color: "var(--text)",
                                                fontWeight: 600,
                                                fontSize: 13,
                                                background: "var(--bg0)",
                                                padding: "8px 10px",
                                                borderRadius: 8,
                                                border: "1px solid var(--stroke2)",
                                                userSelect: "all",
                                                overflowWrap: "anywhere",
                                                wordBreak: "break-all",
                                                lineHeight: 1.45,
                                            }}
                                        >
                                            {it.access_url}
                                        </div>
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                            <a
                                                href={it.access_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                style={{
                                                    color: "var(--accent)",
                                                    fontWeight: 700,
                                                    fontSize: 13,
                                                    background: "rgba(13,166,242,0.12)",
                                                    border: "1px solid rgba(13,166,242,0.25)",
                                                    padding: "6px 10px",
                                                    borderRadius: 8,
                                                    textDecoration: "none",
                                                }}
                                            >
                                                Abrir enlace 🔗
                                            </a>
                                            <button
                                                type="button"
                                                onClick={() => navigator.clipboard.writeText(it.access_url)}
                                                style={{
                                                    color: "var(--text)",
                                                    fontWeight: 700,
                                                    fontSize: 13,
                                                    background: "var(--bg0)",
                                                    border: "1px solid var(--stroke2)",
                                                    padding: "6px 10px",
                                                    borderRadius: 8,
                                                    cursor: "pointer",
                                                }}
                                            >
                                                Copiar link
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div style={{ display: "none" }}>
                                <div style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025))", border: "1px solid var(--stroke2)", borderRadius: 18, padding: 18 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap" }}>
                                        <div>
                                            <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Tarjeta de cuenta</div>
                                            <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900, color: "var(--text)" }}>#{it.id} · {it.platform_name}</div>
                                        </div>
                                        <span style={{ background: badgeBg, color: badgeColor, padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 800, border: `1px solid ${badgeColor}40` }}>{badgeText}</span>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                                        <DetailStat label="Correo" value={it.email} />
                                        <DetailStat label="Contraseña" value={it.password} mono />
                                        <DetailStat label="Pin" value={it.pin} mono />
                                        <DetailStat label="Perfil" value={it.profile_number ?? "—"} />
                                        <DetailStat label="ID venta" value={it.sale_id ? `#${it.sale_id}` : "—"} mono tone="accent" />
                                        <DetailStat label="Asignada a" value={it.assigned_user_email || "—"} />
                                        <DetailStat label="Expiración" value={formatBogotaDate(it.display_expires_at || it.expires_at)} tone="warning" />
                                        <DetailStat label="Creada" value={formatBogotaDate(detail?.account?.created_at || it.created_at)} />
                                        <DetailStat label="Actualizada" value={formatBogotaDate(detail?.account?.updated_at || it.updated_at)} />
                                    </div>
                                </div>
                                <div style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025))", border: "1px solid var(--stroke2)", borderRadius: 18, padding: 18 }}>
                                    <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700, marginBottom: 14 }}>Historial y trazabilidad</div>
                                    {detailLoading ? (
                                        <div style={{ padding: "24px 0", textAlign: "center", color: "var(--muted)" }}>Cargando historial...</div>
                                    ) : detailError ? (
                                        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 14, padding: "14px 16px" }}>
                                            {detailError}
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
                                                <DetailStat label="Última orden" value={detail?.lastSubscription?.order_code || (detail?.lastSubscription?.order_id ? `#${detail.lastSubscription.order_id}` : "—")} tone="accent" />
                                                <DetailStat label="Último comprador" value={detail?.lastSubscription?.buyer_email || detail?.lastSubscription?.buyer_name || "—"} />
                                                <DetailStat label="Suscripciones" value={detail?.subscriptions?.length ? String(detail.subscriptions.length) : "0"} />
                                                <DetailStat label="Reemplazos" value={detail?.replacements?.length ? String(detail.replacements.length) : "0"} />
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                                {(detail?.timeline?.length ? detail.timeline : [{
                                                    type: "empty",
                                                    created_at: null,
                                                    title: "Sin historial registrado",
                                                    subtitle: "Esta cuenta no tiene movimientos auditados todavía.",
                                                    meta: "",
                                                }]).map((entry, index) => (
                                                    <InventoryTimelineItem key={`${entry.type}-${entry.created_at || index}-${index}`} entry={entry} />
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </td>
                    </motion.tr>
                )}
            </AnimatePresence>
        </>
    );
}
