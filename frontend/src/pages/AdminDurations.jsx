import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { apiLogout, apiGet, apiPost, apiPatch, apiDelete } from "../api/api";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";

/* ─── inline styles ─── */
const S = {
    shell: {
        display: "flex", minHeight: "100vh",
        background: "var(--bg, #0a0f1e)",
        fontFamily: "var(--font, 'Inter', system-ui, sans-serif)",
        color: "var(--text, #eaf1ff)",
        position: "relative", overflow: "hidden",
    },
    orb1: {
        position: "fixed", top: -200, left: -200, width: 600, height: 600,
        borderRadius: "50%", background: "radial-gradient(circle, rgba(13,166,242,0.08) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
    },
    orb2: {
        position: "fixed", bottom: -200, right: -100, width: 700, height: 700,
        borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
    },
    main: {
        flex: 1, padding: "36px 40px", position: "relative", zIndex: 1,
        overflowY: "auto",
    },
    header: { marginBottom: 28 },
    pageIcon: { fontSize: 36, marginBottom: 8, display: "block" },
    title: { margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px", color: "#eaf1ff" },
    subtitle: { marginTop: 6, fontSize: 14, color: "rgba(234,241,255,0.5)", marginBottom: 0 },
    card: {
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: "24px 28px",
        marginBottom: 20,
        backdropFilter: "blur(20px)",
        boxShadow: "0 4px 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)",
    },
    cardTitle: {
        fontSize: 15, fontWeight: 700, color: "#eaf1ff",
        marginBottom: 18, display: "flex", alignItems: "center", gap: 8,
    },
    cardTitleIcon: { fontSize: 18 },
    formRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 },
    label: { display: "flex", flexDirection: "column", gap: 6 },
    labelText: { fontSize: 12, fontWeight: 600, color: "rgba(234,241,255,0.5)", textTransform: "uppercase", letterSpacing: "0.5px" },
    input: {
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 10, padding: "10px 14px", color: "#eaf1ff", fontSize: 14,
        outline: "none", transition: "border-color 0.2s, box-shadow 0.2s", width: "100%", boxSizing: "border-box",
    },
    btnCreate: {
        display: "inline-flex", alignItems: "center", gap: 6,
        background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)",
        color: "#10b981", borderRadius: 10, padding: "10px 20px",
        fontWeight: 700, fontSize: 14, cursor: "pointer", transition: "all 0.2s",
    },
    tbl: { width: "100%", borderCollapse: "collapse" },
    th: {
        padding: "10px 14px", fontSize: 11, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.6px",
        color: "rgba(234,241,255,0.4)", textAlign: "left",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
    },
    td: { padding: "13px 14px", fontSize: 14, color: "#eaf1ff", verticalAlign: "middle" },
    tdBorder: { borderBottom: "1px solid rgba(255,255,255,0.04)" },
    badgeActive: {
        display: "inline-flex", alignItems: "center", gap: 4,
        background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)",
        color: "#10b981", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700,
        boxShadow: "0 0 8px rgba(16,185,129,0.2)",
    },
    badgeInactive: {
        display: "inline-flex", alignItems: "center", gap: 4,
        background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
        color: "#ef4444", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700,
    },
    btnAmber: {
        background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)",
        color: "#f59e0b", borderRadius: 8, padding: "5px 12px",
        fontWeight: 600, fontSize: 12, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
    },
    btnBlue: {
        background: "rgba(13,166,242,0.12)", border: "1px solid rgba(13,166,242,0.3)",
        color: "#0da6f2", borderRadius: 8, padding: "5px 12px",
        fontWeight: 600, fontSize: 12, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
    },
    btnRed: {
        background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
        color: "#ef4444", borderRadius: 8, padding: "5px 12px",
        fontWeight: 600, fontSize: 12, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
    },
    btnSave: {
        background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)",
        color: "#10b981", borderRadius: 8, padding: "5px 12px",
        fontWeight: 600, fontSize: 12, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
    },
    btnCancel: {
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
        color: "rgba(234,241,255,0.6)", borderRadius: 8, padding: "5px 12px",
        fontWeight: 600, fontSize: 12, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
    },
    actionsGap: { display: "flex", gap: 6, flexWrap: "wrap" },
    errorBox: {
        background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
        color: "#ef4444", borderRadius: 10, padding: "12px 16px", fontSize: 13, marginBottom: 16,
    },
    emptyRow: { textAlign: "center", padding: "28px 0", color: "rgba(234,241,255,0.3)", fontSize: 14 },
    inputEdit: {
        background: "rgba(255,255,255,0.07)", border: "1px solid rgba(13,166,242,0.3)",
        borderRadius: 8, padding: "5px 10px", color: "#eaf1ff", fontSize: 13,
        outline: "none", width: 120, boxSizing: "border-box",
    },
};

export default function AdminDurations() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [name, setName] = useState("");
    const [days, setDays] = useState("");
    const [successMsg, setSuccessMsg] = useState("");


    async function logout() {
        try { await apiLogout(); } catch (e) { console.error(e); }
        setUser(null);
        navigate("/", { replace: true });
    }

    async function load() {
        setLoading(true); setError("");
        try {
            const r = await apiGet("/admin/durations");
            if (!r.ok) throw new Error(r.data?.message || "No se pudo cargar duraciones.");
            setRows(Array.isArray(r.data) ? r.data : []);
        } catch (e) {
            setError(e.message || "Error cargando duraciones.");
        } finally { setLoading(false); }
    }

    async function create() {
        if (!name.trim() || !days) return;
        setSaving(true); setError("");
        try {
            const r = await apiPost("/admin/durations", { name: name.trim(), days: Number(days) });
            if (!r.ok) throw new Error(r.data?.message || "No se pudo crear.");
            setName(""); setDays("");
            setSuccessMsg("✅ Duración creada correctamente.");
            setTimeout(() => setSuccessMsg(""), 3000);
            await load();
        } catch (e) {
            setError(e.message || "Error creando.");
        } finally { setSaving(false); }
    }

    async function patch(id, body) {
        setSaving(true); setError("");
        try {
            const r = await apiPatch(`/admin/durations/${id}`, body);
            if (!r.ok) throw new Error(r.data?.message || "No se pudo actualizar.");
            await load();
        } catch (e) {
            setError(e.message || "Error actualizando.");
        } finally { setSaving(false); }
    }

    async function deactivate(id) {
        setSaving(true); setError("");
        try {
            const r = await apiDelete(`/admin/durations/${id}`);
            if (!r.ok) throw new Error(r.data?.message || "No se pudo eliminar.");
            await load();
        } catch (e) {
            setError(e.message || "Error eliminando.");
        } finally { setSaving(false); }
    }

    useEffect(() => { load(); }, []);

    return (
        <div style={S.shell}>
            <div style={S.orb1} />
            <div style={S.orb2} />

            <AdminSidebar
                user={user}
                logoSrc="/api/branding/logo"
                logoOk={true}
                setLogoOk={() => { }}
                uploadingLogo={false}
                onOpenLogoPicker={() => navigate("/admin")}
                onLogout={logout}
            />

            <main style={S.main}>
                {/* Header */}
                <div style={S.header}>
                    <span style={S.pageIcon}>⏱️</span>
                    <h1 style={S.title}>Duraciones</h1>
                    <p style={S.subtitle}>Crear y administrar duraciones de suscripción (ej: 30 días, 60 días, etc.)</p>
                </div>

                {error && <div style={S.errorBox}>{error}</div>}
                {successMsg && (
                    <div style={{ ...S.errorBox, background: "rgba(16,185,129,0.1)", borderColor: "rgba(16,185,129,0.25)", color: "#10b981" }}>
                        {successMsg}
                    </div>
                )}

                {/* Crear Duración */}
                <div style={S.card}>
                    <div style={S.cardTitle}>
                        <span style={S.cardTitleIcon}>➕</span> Crear duración
                    </div>
                    <div style={S.formRow}>
                        <label style={S.label}>
                            <span style={S.labelText}>Nombre (ej: Mensual)</span>
                            <input
                                style={S.input}
                                value={name}
                                placeholder="Mensual"
                                onChange={e => setName(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && create()}
                                onFocus={e => { e.target.style.borderColor = "rgba(13,166,242,0.5)"; e.target.style.boxShadow = "0 0 0 3px rgba(13,166,242,0.1)"; }}
                                onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; e.target.style.boxShadow = "none"; }}
                            />
                        </label>
                        <label style={S.label}>
                            <span style={S.labelText}>Días (ej: 30)</span>
                            <input
                                style={S.input}
                                type="number"
                                min="1"
                                value={days}
                                placeholder="30"
                                onChange={e => setDays(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && create()}
                                onFocus={e => { e.target.style.borderColor = "rgba(13,166,242,0.5)"; e.target.style.boxShadow = "0 0 0 3px rgba(13,166,242,0.1)"; }}
                                onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; e.target.style.boxShadow = "none"; }}
                            />
                        </label>
                    </div>
                    <button
                        style={{ ...S.btnCreate, opacity: (saving || !name || !days) ? 0.5 : 1 }}
                        onClick={create}
                        disabled={saving || !name.trim() || !days}
                        onMouseEnter={e => { if (!saving && name && days) { e.currentTarget.style.background = "rgba(16,185,129,0.25)"; e.currentTarget.style.boxShadow = "0 0 14px rgba(16,185,129,0.3)"; } }}
                        onMouseLeave={e => { e.currentTarget.style.background = "rgba(16,185,129,0.15)"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                        {saving ? "⏳ Guardando..." : "➕ Crear duración"}
                    </button>
                </div>

                {/* Listado */}
                <div style={S.card}>
                    <div style={{ ...S.cardTitle, justifyContent: "space-between" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={S.cardTitleIcon}>📋</span> Listado de duraciones
                        </span>
                        <span style={{
                            background: "rgba(13,166,242,0.1)", border: "1px solid rgba(13,166,242,0.2)",
                            color: "#0da6f2", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700
                        }}>
                            {rows.length} registros
                        </span>
                    </div>

                    {loading ? (
                        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(234,241,255,0.3)" }}>
                            <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
                            Cargando duraciones...
                        </div>
                    ) : (
                        <div style={{ overflowX: "auto" }}>
                            <table style={S.tbl}>
                                <thead>
                                    <tr>
                                        <th style={S.th}>ID</th>
                                        <th style={S.th}>Nombre</th>
                                        <th style={S.th}>Días</th>
                                        <th style={S.th}>Estado</th>
                                        <th style={S.th}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} style={S.emptyRow}>
                                                No hay duraciones registradas
                                            </td>
                                        </tr>
                                    ) : rows.map(r => (
                                        <DurRow key={r.id} r={r} saving={saving} onPatch={patch} onDeactivate={deactivate} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

function DurRow({ r, saving, onPatch, onDeactivate }) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(String(r.name ?? ""));
    const [days, setDays] = useState(String(r.days ?? ""));
    const [hovered, setHovered] = useState(false);

    const rowStyle = {
        ...S.tdBorder,
        background: hovered ? "rgba(13,166,242,0.04)" : "transparent",
        transition: "background 0.15s",
    };
    const startEditing = () => {
        setName(String(r.name ?? ""));
        setDays(String(r.days ?? ""));
        setEditing(true);
    };
    const cancelEditing = () => {
        setName(String(r.name ?? ""));
        setDays(String(r.days ?? ""));
        setEditing(false);
    };

    return (
        <tr onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
            <td style={{ ...S.td, ...rowStyle }}>
                <span style={{
                    background: "rgba(255,255,255,0.06)", borderRadius: 6,
                    padding: "2px 8px", fontSize: 12, fontWeight: 700, color: "rgba(234,241,255,0.5)"
                }}>#{r.id}</span>
            </td>

            <td style={{ ...S.td, ...rowStyle }}>
                {editing ? (
                    <input
                        style={S.inputEdit}
                        value={name}
                        onChange={e => setName(e.target.value)}
                    />
                ) : (
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                )}
            </td>

            <td style={{ ...S.td, ...rowStyle }}>
                {editing ? (
                    <input
                        style={{ ...S.inputEdit, width: 80 }}
                        type="number"
                        min="1"
                        value={days}
                        onChange={e => setDays(e.target.value)}
                    />
                ) : (
                    <span style={{ color: "#0da6f2", fontWeight: 700 }}>{r.days}<span style={{ color: "rgba(234,241,255,0.3)", fontWeight: 400, fontSize: 12 }}> días</span></span>
                )}
            </td>

            <td style={{ ...S.td, ...rowStyle }}>
                {r.is_active
                    ? <span style={S.badgeActive}>● Activo</span>
                    : <span style={S.badgeInactive}>● Inactivo</span>
                }
            </td>

            <td style={{ ...S.td, ...rowStyle }}>
                <div style={S.actionsGap}>
                    {/* Botón Activar/Desactivar */}
                    <button
                        style={S.btnAmber}
                        disabled={saving}
                        onClick={() => onPatch(r.id, { is_active: r.is_active ? 0 : 1 })}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(245,158,11,0.2)"}
                        onMouseLeave={e => e.currentTarget.style.background = "rgba(245,158,11,0.1)"}
                    >
                        {r.is_active ? "Desactivar" : "Activar"}
                    </button>

                    {!editing ? (
                        <button
                            style={S.btnBlue}
                            disabled={saving}
                            onClick={startEditing}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(13,166,242,0.22)"}
                            onMouseLeave={e => e.currentTarget.style.background = "rgba(13,166,242,0.12)"}
                        >
                            ✏️ Editar
                        </button>
                    ) : (
                        <>
                            <button
                                style={S.btnSave}
                                disabled={saving || !name || !days}
                                onClick={() => { onPatch(r.id, { name, days: Number(days) }); setEditing(false); }}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(16,185,129,0.25)"}
                                onMouseLeave={e => e.currentTarget.style.background = "rgba(16,185,129,0.15)"}
                            >
                                ✅ Guardar
                            </button>
                            <button
                                style={S.btnCancel}
                                disabled={saving}
                                onClick={cancelEditing}
                            >
                                Cancelar
                            </button>
                        </>
                    )}

                    <button
                        style={S.btnRed}
                        disabled={saving}
                        onClick={() => onDeactivate(r.id)}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.18)"}
                        onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,0.08)"}
                    >
                        🗑️ Borrar
                    </button>
                </div>
            </td>
        </tr>
    );
}
