import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiLogout } from "../api/api";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";

const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:3000").replace(/\/$/, "");

async function apiFetch(path, opts = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
        ...opts,
    });

    const contentType = res.headers.get("content-type") || "";
    let data = null;
    if (contentType.includes("application/json")) {
        data = await res.json().catch(() => null);
    } else {
        const txt = await res.text().catch(() => "");
        data = { message: txt?.slice(0, 200) || "" };
    }

    if (res.status === 401) {
        localStorage.removeItem("user");
        window.location.href = "/login";
        return null;
    }

    if (!res.ok) {
        throw new Error(data?.message || `HTTP ${res.status} ${res.statusText || ""}`.trim() || "Error en la solicitud");
    }

    return data;
}

const LOGO_URL = "/api/branding/logo";

function CustomPlatformSelect({ value, onChange, platforms, selStyle }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const dropdownRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filtered = platforms.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    const currentName = value === "" ? "-- Selecciona --" : (platforms.find(p => String(p.id) === String(value))?.name || "-- Selecciona --");

    return (
        <div ref={dropdownRef} style={{ position: "relative", width: "100%", height: "100%" }}>
            <div
                style={{ ...selStyle, display: "flex", alignItems: "center", justifyContent: "space-between", height: "100%", userSelect: "none", cursor: "pointer" }}
                onClick={() => { setOpen(!open); setSearch(""); }}
            >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {currentName}
                </span>
                <span style={{ fontSize: 10, color: "var(--muted)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
            </div>

            {open && (
                <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                    background: "var(--bg1)", border: "1px solid var(--stroke)", borderRadius: 12,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 100, overflow: "hidden",
                    display: "flex", flexDirection: "column"
                }}>
                    <input
                        type="text"
                        autoFocus
                        placeholder="Buscar plataforma..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            background: "rgba(0,0,0,0.2)", border: "none", borderBottom: "1px solid var(--stroke)",
                            padding: "12px 14px", color: "var(--text)", fontSize: 13, outline: "none", width: "100%", fontFamily: "var(--font)"
                        }}
                    />
                    <div style={{ maxHeight: 220, overflowY: "auto", padding: "4px 0" }}>
                        <div
                            style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, background: value === "" ? "rgba(13,166,242,0.1)" : "transparent", color: value === "" ? "var(--accent)" : "var(--text)", transition: "background 0.1s" }}
                            onClick={() => { onChange(""); setOpen(false); }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                            onMouseLeave={e => e.currentTarget.style.background = value === "" ? "rgba(13,166,242,0.1)" : "transparent"}
                        >
                            -- Selecciona --
                        </div>
                        {filtered.map(p => (
                            <div
                                key={p.id}
                                style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, background: String(value) === String(p.id) ? "rgba(13,166,242,0.1)" : "transparent", color: String(value) === String(p.id) ? "var(--accent)" : "var(--text)", transition: "background 0.1s" }}
                                onClick={() => { onChange(p.id); setOpen(false); }}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                                onMouseLeave={e => e.currentTarget.style.background = String(value) === String(p.id) ? "rgba(13,166,242,0.1)" : "transparent"}
                            >
                                #{p.id} - {p.name}
                            </div>
                        ))}
                        {filtered.length === 0 && (
                            <div style={{ padding: "16px 14px", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>No hay coincidencias</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AdminAccounts() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();

    const [platforms, setPlatforms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const [platformId, setPlatformId] = useState("");
    const [platformName, setPlatformName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [pin, setPin] = useState("");
    const [profileNumber, setProfileNumber] = useState("");

    // Excel upload
    const fileExcelRef = useRef(null);
    const [excelLoading, setExcelLoading] = useState(false);
    const [excelMsg, setExcelMsg] = useState("");
    const [excelError, setExcelError] = useState(false);
    const [dragActive, setDragActive] = useState(false);

    const selectedPlatform = useMemo(
        () => platforms.find((p) => String(p.id) === String(platformId)),
        [platforms, platformId]
    );

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

    async function loadPlatforms() {
        setLoading(true);
        setError("");

        try {
            const data = await apiFetch(`/admin/platforms`);
            if (!data) return;
            setPlatforms(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e?.message || "Error cargando plataformas.");
        } finally {
            setLoading(false);
        }
    }

    async function createAccount() {
        setSaving(true);
        setError("");
        setExcelMsg("");

        try {
            const data = await apiFetch(`/admin/accounts`, {
                method: "POST",
                body: JSON.stringify({
                    platformId: Number(platformId),
                    platformName: platformName || selectedPlatform?.name || "",
                    email,
                    password,
                    pin: pin || null,
                    profileNumber: profileNumber || null,
                }),
            });

            if (data?.id) {
                setEmail("");
                setPassword("");
                setPin("");
                setProfileNumber("");
                setExcelError(false);
                setExcelMsg(`✅ Cuenta cargada correctamente (ID: ${data.id})`);
                setTimeout(() => setExcelMsg(""), 5000);
            }
        } catch (e) {
            setError(e.message || "Error cargando cuenta.");
        } finally {
            setSaving(false);
        }
    }

    function openExcelPicker() {
        setExcelMsg("");
        setExcelError(false);
        fileExcelRef.current?.click();
    }

    async function processExcelFile(file) {
        if (!file) return;

        setExcelLoading(true);
        setError("");
        setExcelMsg("");
        setExcelError(false);

        try {
            // 1) leer excel
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer);
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

            // 2) enviar al backend
            const out = await apiFetch(`/admin/accounts/bulk`, {
                method: "POST",
                body: JSON.stringify({ rows }),
            });

            if (out) {
                setExcelMsg(`✅ Excel cargado. Insertadas: ${out.inserted || 0}`);
            }
        } catch (err) {
            setExcelError(true);
            setExcelMsg(`❌ ${err.message || "Error subiendo Excel."}`);
        } finally {
            setExcelLoading(false);
            if (fileExcelRef.current) fileExcelRef.current.value = "";
        }
    }

    function onPickExcel(e) {
        processExcelFile(e.target.files?.[0]);
    }

    function handleDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processExcelFile(e.dataTransfer.files[0]);
        }
    }

    function downloadTemplate() {
        const headers = ["platformId", "platformName", "email", "password", "profileNumber", "pin"];
        const exampleRow = {
            platformId: 1,
            platformName: "Netflix",
            email: "ejemplo@correo.com",
            password: "mypassword123",
            profileNumber: "1",
            pin: "1234"
        };

        const wsCuentas = XLSX.utils.json_to_sheet([exampleRow], { header: headers });

        const plataformasRows = platforms.map(p => ({
            "ID": p.id,
            "Plataforma": p.name
        }));
        const wsPlataformas = XLSX.utils.json_to_sheet(plataformasRows);

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, wsCuentas, "Plantilla Cuentas");
        XLSX.utils.book_append_sheet(wb, wsPlataformas, "Plataformas");

        XLSX.writeFile(wb, "Plantilla_Cuentas_StreamingBox.xlsx");
    }

    useEffect(() => {
        loadPlatforms();
        // eslint-disable-next-line
    }, []);

    useEffect(() => {
        setPlatformName(selectedPlatform?.name || "");
    }, [selectedPlatform]);

    const inputStyle = {
        appearance: "none", WebkitAppearance: "none",
        height: 44, padding: "0 14px",
        background: "var(--bg0)", color: "var(--text)",
        border: "1px solid var(--stroke)", borderRadius: 12,
        fontSize: 14, fontWeight: 500, outline: "none", width: "100%", fontFamily: "var(--font)",
        transition: "all 0.2s"
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

                <main className="main" style={{ padding: "20px 24px 32px", maxWidth: 1000, margin: "0 auto" }}>
                    {/* ── Page header ── */}
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 32, gap: 20, flexWrap: "wrap", borderBottom: "1px solid var(--stroke)", paddingBottom: 24 }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                            <div style={{
                                width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                                background: "linear-gradient(135deg, rgba(13,166,242,0.1) 0%, rgba(99,51,255,0.1) 100%)",
                                border: "1px solid rgba(13,166,242,0.3)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 24, boxShadow: "0 4px 16px rgba(13,166,242,0.15)",
                            }}>
                                📤
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.5px" }}>
                                    Cargar Cuentas
                                </h1>
                                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
                                    Sube inventario masivamente usando Excel o agrega nuevas cuentas manualmente.
                                </p>
                            </div>
                        </div>

                        <button
                            className="btn-ghost"
                            style={{ height: 38, borderRadius: 10, fontSize: 13, gap: 8, display: "flex", alignItems: "center" }}
                            onClick={loadPlatforms}
                            disabled={loading}
                        >
                            <span style={{ animation: loading ? "spin 1s linear infinite" : "none" }}>🔄</span>
                            {loading ? "Cargando..." : "Refrescar Plataformas"}
                        </button>
                    </motion.div>

                    {error && (
                        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="error" style={{ marginBottom: 20 }}>
                            {error}
                        </motion.div>
                    )}

                    {excelMsg && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                            style={{
                                padding: "14px 20px", borderRadius: 12, marginBottom: 24, fontSize: 13, fontWeight: 600,
                                background: excelError ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
                                border: `1px solid ${excelError ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"}`,
                                color: excelError ? "#ef4444" : "#10b981", boxShadow: `0 4px 12px ${excelError ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)"}`
                            }}
                        >
                            {excelMsg}
                        </motion.div>
                    )}

                    {/* ── EXCEL UPLOADER CARD ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "24px 28px", marginBottom: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}
                    >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text)" }}>Carga Masiva (Excel)</h3>
                                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted)" }}>Encabezados clave: <code style={{ background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4 }}>platformId</code> <code style={{ background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4 }}>email</code> <code style={{ background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4 }}>password</code></p>
                            </div>
                            <button
                                className="btn-ghost"
                                onClick={downloadTemplate}
                                style={{ fontSize: 13, borderRadius: 10, padding: "0 16px", height: 38 }}
                            >
                                📄 Descargar Plantilla
                            </button>
                        </div>

                        <div
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            onClick={openExcelPicker}
                            style={{
                                border: dragActive ? "2px dashed #0da6f2" : "2px dashed var(--stroke2)",
                                borderRadius: 16, padding: "40px 20px", textAlign: "center", cursor: "pointer",
                                background: dragActive ? "rgba(13,166,242,0.08)" : "var(--bg0)",
                                transition: "all 0.2s ease"
                            }}
                        >
                            <div style={{ fontSize: 32, marginBottom: 12, opacity: dragActive ? 1 : 0.6 }}>{excelLoading ? "⏳" : "📊"}</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: dragActive ? "#0da6f2" : "var(--text)" }}>
                                {excelLoading ? "Cargando archivo..." : "Haz clic para subir un Excel (.xlsx)"}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                                O arrastra y suelta el archivo aquí
                            </div>
                        </div>

                        <input
                            ref={fileExcelRef}
                            type="file"
                            accept=".xlsx,.xls"
                            style={{ display: "none" }}
                            onChange={onPickExcel}
                        />
                    </motion.div>

                    {/* ── MANUAL ENTRY CARD ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                        style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "clamp(16px, 4vw, 24px) clamp(20px, 5vw, 28px)", boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}
                    >
                        <h3 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 800, color: "var(--text)" }}>Carga Manual (1x1)</h3>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Plataforma *
                                </label>
                                <div style={{ position: "relative", height: 44 }}>
                                    <CustomPlatformSelect
                                        value={platformId}
                                        onChange={(val) => setPlatformId(val)}
                                        platforms={platforms}
                                        selStyle={inputStyle}
                                    />
                                </div>
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Nombre plataforma <span style={{ opacity: 0.5, fontWeight: 400 }}>(Opcional)</span>
                                </label>
                                <input
                                    style={inputStyle}
                                    placeholder="Ej: Netflix Premium Custom"
                                    value={platformName}
                                    onChange={(e) => setPlatformName(e.target.value)}
                                />
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Email de la cuenta *
                                </label>
                                <input
                                    style={inputStyle}
                                    type="email"
                                    placeholder="correo@ejemplo.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Contraseña *
                                </label>
                                <input
                                    style={inputStyle}
                                    type="text"
                                    placeholder="Contraseña de la cuenta"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Perfil <span style={{ opacity: 0.5, fontWeight: 400 }}>(Opcional)</span>
                                </label>
                                <input
                                    style={inputStyle}
                                    placeholder="Ej: 1, 2, Kids..."
                                    value={profileNumber}
                                    onChange={(e) => setProfileNumber(e.target.value)}
                                />
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Pin <span style={{ opacity: 0.5, fontWeight: 400 }}>(Opcional)</span>
                                </label>
                                <input
                                    style={inputStyle}
                                    placeholder="Ej: 1234"
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value)}
                                />
                            </div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--stroke2)" }}>
                            <button
                                className="btn"
                                style={{ width: "100%", maxWidth: 320, fontSize: 14, fontWeight: 800, height: 48 }}
                                onClick={createAccount}
                                disabled={saving || !platformId || !email || !password}
                            >
                                {saving ? "Guardando..." : "✅ Agregar Cuenta"}
                            </button>
                        </div>
                    </motion.div>
                </main>
            </div>
        </div>
    );
}
