// FRONTEND: src/pages/admin/AdminAccounts.jsx (o donde lo tengas)
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";

// ✅ En tu proyecto, VITE_API_BASE debe ser: https://strbx.com.co/api (producción)
// ✅ En local: http://localhost:3000 (si tu backend corre ahí)
// Nota: si tu backend local tiene prefijo /api, pon http://localhost:3000/api
const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:3000").replace(/\/$/, "");

export default function AdminAccounts() {
    const navigate = useNavigate();

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

    // ✅ Excel upload
    const fileExcelRef = useRef(null);
    const [excelLoading, setExcelLoading] = useState(false);
    const [excelMsg, setExcelMsg] = useState("");

    const selectedPlatform = useMemo(
        () => platforms.find((p) => String(p.id) === String(platformId)),
        [platforms, platformId]
    );

    async function loadPlatforms() {
        setLoading(true);
        setError("");

        try {
            const res = await fetch(`${API_BASE}/admin/platforms`, {
                credentials: "include",
            });

            // ✅ intenta json; si falla, lee texto (HTML de nginx, etc)
            const contentType = res.headers.get("content-type") || "";
            let data = null;

            if (contentType.includes("application/json")) {
                data = await res.json().catch(() => null);
            } else {
                const txt = await res.text().catch(() => "");
                data = { message: txt?.slice(0, 200) || "" }; // corta para no romper UI
            }

            if (!res.ok) {
                const msg =
                    data?.message ||
                    `HTTP ${res.status} ${res.statusText || ""}`.trim() ||
                    "No se pudo cargar plataformas.";
                throw new Error(msg);
            }

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

        try {
            const res = await fetch(`${API_BASE}/admin/accounts`, {
                method: "POST",
                credentials: "include", // ✅ Cookies HttpOnly
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    platformId: Number(platformId),
                    platformName: platformName || selectedPlatform?.name || "",
                    email,
                    password,
                    pin: pin || null,
                    profileNumber: profileNumber || null,
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "No se pudo crear la cuenta.");

            setEmail("");
            setPassword("");
            setPin("");
            setProfileNumber("");
            alert(`Cuenta cargada ✅ (id: ${data.id})`);
        } catch (e) {
            setError(e.message || "Error cargando cuenta.");
        } finally {
            setSaving(false);
        }
    }

    function openExcelPicker() {
        setExcelMsg("");
        fileExcelRef.current?.click();
    }

    async function onPickExcel(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        setExcelLoading(true);
        setError("");
        setExcelMsg("");

        try {
            // 1) leer excel
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer);
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

            // 2) enviar al backend
            const res = await fetch(`${API_BASE}/admin/accounts/bulk`, {
                method: "POST",
                credentials: "include", // ✅ Cookies HttpOnly
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows }),
            });

            const out = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(out?.message || "Error cargando excel.");

            setExcelMsg(`✅ Excel cargado. Insertadas: ${out.inserted || 0}`);
            // opcional: refrescar algo
        } catch (err) {
            setExcelMsg(`❌ ${err.message || "Error subiendo Excel."}`);
        } finally {
            setExcelLoading(false);
            if (fileExcelRef.current) fileExcelRef.current.value = "";
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

        // Pestaña con el listado de plataformas
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

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                <aside className="sidebar">
                    <div className="nav-title">Admin</div>
                    <p className="nav-sub">Inventario de cuentas</p>

                    {/* ✅ navegación correcta */}
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
                        onClick={loadPlatforms}
                        disabled={loading}
                    >
                        {loading ? "Cargando..." : "Refrescar plataformas"}
                    </button>
                </aside>

                <main className="main">
                    <h1 style={{ margin: 0 }}>Cargar cuentas</h1>
                    <p style={{ marginTop: 6, color: "var(--muted)" }}>
                        Aquí subes las cuentas que se van a vender (email/clave, pin y perfil opcional).
                    </p>

                    {error ? <div className="error">{error}</div> : null}

                    {/* ✅ EXCEL UPLOADER */}
                    <div className="kpi" style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 900, marginBottom: 10 }}>
                            Carga masiva (Excel)
                        </div>

                        <div className="hint" style={{ marginBottom: 10 }}>
                            Encabezados requeridos/sugeridos: <b>platformId</b> o <b>platformName</b>,{" "}
                            <b>email</b>, <b>password</b>, <b>profileNumber</b> (opcional),{" "}
                            <b>pin</b> (opcional).
                        </div>

                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
                            <button
                                className="btn-ghost"
                                type="button"
                                onClick={openExcelPicker}
                                disabled={excelLoading}
                            >
                                {excelLoading ? "Subiendo Excel..." : "Subir Excel (.xlsx)"}
                            </button>

                            <button
                                className="btn-ghost"
                                type="button"
                                onClick={downloadTemplate}
                            >
                                Descargar Plantilla (.xlsx)
                            </button>
                        </div>

                        <input
                            ref={fileExcelRef}
                            type="file"
                            accept=".xlsx,.xls"
                            style={{ display: "none" }}
                            onChange={onPickExcel}
                        />

                        {excelMsg ? (
                            <div className="hint" style={{ marginTop: 10 }}>
                                {excelMsg}
                            </div>
                        ) : null}
                    </div>

                    {/* FORM 1x1 */}
                    <div className="kpi" style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 900, marginBottom: 10 }}>Nueva cuenta</div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <label className="label">
                                Plataforma
                                <select
                                    className="input"
                                    value={platformId}
                                    onChange={(e) => setPlatformId(e.target.value)}
                                >
                                    <option value="">-- Selecciona --</option>
                                    {platforms.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            #{p.id} - {p.name}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="label">
                                Nombre plataforma (opcional)
                                <input
                                    className="input"
                                    value={platformName}
                                    onChange={(e) => setPlatformName(e.target.value)}
                                />
                            </label>

                            <label className="label">
                                Email de la cuenta
                                <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
                            </label>

                            <label className="label">
                                Contraseña
                                <input
                                    className="input"
                                    type="text"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </label>

                            <label className="label">
                                Perfil (opcional)
                                <input
                                    className="input"
                                    value={profileNumber}
                                    onChange={(e) => setProfileNumber(e.target.value)}
                                />
                            </label>

                            <label className="label">
                                Pin (opcional)
                                <input className="input" value={pin} onChange={(e) => setPin(e.target.value)} />
                            </label>
                        </div>

                        <button
                            className="btn"
                            style={{ marginTop: 12 }}
                            onClick={createAccount}
                            disabled={saving || !platformId || !email || !password}
                        >
                            {saving ? "Guardando..." : "Cargar cuenta"}
                        </button>
                    </div>
                </main>
            </div>
        </div>
    );
}
